from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio
import random
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from src.models import IngestData, HealthResponse, MetricsResponse
from src.kafka_producer import KafkaProducerWrapper
from src.metrics import metrics
from src.config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global producer instance
kafka_producer = KafkaProducerWrapper()
load_test_task = None
load_test_state = {
    "running": False,
    "rate": 0,
    "symbols": ["AAPL"],
    "started_at": None,
    "ticks_sent": 0,
    "actual_tps": 0.0,
    "last_cycle_sent": 0,
}


class LoadTestStartRequest(BaseModel):
    rate: int = Field(default=100, ge=1, le=2000)
    symbols: list[str] = Field(default_factory=lambda: ["AAPL", "GOLD"])


async def load_test_loop(rate: int, symbols: list[str]):
    """Generate synthetic ticks continuously at `rate` ticks/sec."""
    local_prices = {symbol: random.uniform(120, 280) for symbol in symbols}
    loop = asyncio.get_running_loop()
    batch_size = 25

    while load_test_state["running"]:
        cycle_start = loop.time()
        remaining = rate
        cycle_successes = 0

        while remaining > 0 and load_test_state["running"]:
            current_batch = min(batch_size, remaining)
            batch_messages = []

            for _ in range(current_batch):
                symbol = random.choice(symbols)
                delta = random.uniform(-1.5, 1.5)
                local_prices[symbol] = max(1.0, local_prices[symbol] + delta)
                batch_messages.append(
                    {
                        "symbol": symbol,
                        "price": round(local_prices[symbol], 2),
                        "volume": random.randint(500, 12000),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                )

            results = await asyncio.gather(
                *[
                    kafka_producer.send_message(Config.KAFKA_TOPIC, message)
                    for message in batch_messages
                ]
            )
            successes = sum(1 for result in results if result)
            cycle_successes += successes
            for _ in range(successes):
                metrics.record_message()

            remaining -= current_batch

        load_test_state["ticks_sent"] += cycle_successes
        load_test_state["last_cycle_sent"] = cycle_successes

        elapsed = loop.time() - cycle_start
        sleep_for = max(0.0, 1.0 - elapsed)
        if sleep_for > 0:
            await asyncio.sleep(sleep_for)

        effective_window = max(loop.time() - cycle_start, 0.001)
        load_test_state["actual_tps"] = round(cycle_successes / effective_window, 2)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global load_test_task
    logger.info("Starting Data Ingestion Service...")
    await kafka_producer.start()
    logger.info("Service started successfully")
    yield
    logger.info("Shutting down...")
    load_test_state["running"] = False
    if load_test_task and not load_test_task.done():
        load_test_task.cancel()
        try:
            await load_test_task
        except asyncio.CancelledError:
            pass
    await kafka_producer.stop()

app = FastAPI(
    title="Data Ingestion Service",
    description="Ingests streaming data and publishes to Kafka",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != Config.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return x_api_key

@app.post("/ingest", status_code=201)
async def ingest_data(
    data: IngestData,
    api_key: str = Depends(verify_api_key)
):
    """
    Ingest data from client and publish to Kafka
    """
    try:
        tick_message = {
            "symbol": data.symbol,
            "price": data.price,
            "volume": data.volume,
            "timestamp": data.timestamp.isoformat()
        }
        success = await kafka_producer.send_message(Config.KAFKA_TOPIC, tick_message)
        if success:
            metrics.record_message()
            logger.info(f"Ingested tick {tick_message['symbol']} at {tick_message['price']}")
            return {
                "status": "success",
                "symbol": tick_message["symbol"],
                "timestamp": tick_message["timestamp"]
            }
        else:
            raise HTTPException(
                status_code=503,
                detail="Failed to publish message after retries"
            )
    except Exception as e:
        logger.error(f"Ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest/batch")
async def ingest_batch(
    messages: list[IngestData],
    api_key: str = Depends(verify_api_key)
):
    """
    Ingest multiple messages at once
    """
    results = []
    for msg in messages:
        tick_message = {
            "symbol": msg.symbol,
            "price": msg.price,
            "volume": msg.volume,
            "timestamp": msg.timestamp.isoformat()
        }
        success = await kafka_producer.send_message(Config.KAFKA_TOPIC, tick_message)
        if success:
            metrics.record_message()
            results.append({
                "symbol": tick_message["symbol"],
                "timestamp": tick_message["timestamp"],
                "status": "success"
            })
        else:
            results.append({
                "symbol": tick_message["symbol"],
                "timestamp": tick_message["timestamp"],
                "status": "failed"
            })
    return {"batch_results": results, "total": len(results)}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for orchestrator"""
    return HealthResponse(
        status="healthy" if kafka_producer.connected else "degraded",
        kafka_connected=kafka_producer.connected,
        messages_ingested_total=metrics.total_messages
    )

@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Metrics endpoint for dashboard"""
    tick_rate = metrics.get_messages_per_second()
    return MetricsResponse(
        total_messages=metrics.total_messages,
        messages_last_minute=metrics.get_messages_last_minute(),
        messages_per_second=tick_rate,
        kafka_status="connected" if kafka_producer.connected else "disconnected",
        # Compatibility fields expected by orchestratorService.
        queueDepth=0,
        tickRatePerSecond=tick_rate,
        cpuUsage=0.0
    )

@app.get("/")
async def root():
    return {
        "service": "Data Ingestion Service",
        "version": "1.0.0",
        "endpoints": ["/ingest", "/ingest/batch", "/health", "/metrics"]
    }


@app.post("/api/load-test/start")
async def start_load_test(request: LoadTestStartRequest):
    global load_test_task

    symbols = [s.strip().upper() for s in request.symbols if s and s.strip()]
    if not symbols:
        symbols = ["AAPL"]

    if load_test_state["running"]:
        return {
            "status": "already_running",
            "rate": load_test_state["rate"],
            "symbols": load_test_state["symbols"],
            "ticks_sent": load_test_state["ticks_sent"],
            "actual_tps": load_test_state["actual_tps"],
        }

    load_test_state["running"] = True
    load_test_state["rate"] = request.rate
    load_test_state["symbols"] = symbols
    load_test_state["started_at"] = datetime.now(timezone.utc).isoformat()
    load_test_state["ticks_sent"] = 0
    load_test_state["actual_tps"] = 0.0
    load_test_state["last_cycle_sent"] = 0

    load_test_task = asyncio.create_task(load_test_loop(request.rate, symbols))
    logger.info(f"Load test started at {request.rate} ticks/sec for symbols: {symbols}")

    return {
        "status": "started",
        "rate": request.rate,
        "symbols": symbols,
    }


@app.post("/api/load-test/stop")
async def stop_load_test():
    global load_test_task

    if not load_test_state["running"]:
        return {
            "status": "already_stopped",
            "ticks_sent": load_test_state["ticks_sent"],
        }

    load_test_state["running"] = False
    if load_test_task and not load_test_task.done():
        load_test_task.cancel()
        try:
            await load_test_task
        except asyncio.CancelledError:
            pass

    logger.info("Load test stopped")
    return {
        "status": "stopped",
        "ticks_sent": load_test_state["ticks_sent"],
    }


@app.get("/api/load-test/status")
async def load_test_status():
    return {
        "running": load_test_state["running"],
        "rate": load_test_state["rate"],
        "symbols": load_test_state["symbols"],
        "started_at": load_test_state["started_at"],
        "ticks_sent": load_test_state["ticks_sent"],
        "actual_tps": load_test_state["actual_tps"],
        "last_cycle_sent": load_test_state["last_cycle_sent"],
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=Config.API_PORT)
