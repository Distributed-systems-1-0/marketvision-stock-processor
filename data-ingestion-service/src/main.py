from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from src.models import IngestData, HealthResponse, MetricsResponse
from src.kafka_producer import KafkaProducerWrapper
from src.metrics import metrics
from src.config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global producer instance
kafka_producer = KafkaProducerWrapper()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("Starting Data Ingestion Service...")
    await kafka_producer.start()
    logger.info("Service started successfully")
    yield
    logger.info("Shutting down...")
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
        message = data.dict()
        success = await kafka_producer.send_message(Config.KAFKA_TOPIC, message)
        if success:
            metrics.record_message()
            logger.info(f"Ingested message {message['message_id']} from {message['client_id']}")
            return {
                "status": "success",
                "message_id": message['message_id'],
                "timestamp": message['timestamp']
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
        message = msg.dict()
        success = await kafka_producer.send_message(Config.KAFKA_TOPIC, message)
        if success:
            metrics.record_message()
            results.append({"message_id": message['message_id'], "status": "success"})
        else:
            results.append({"message_id": message['message_id'], "status": "failed"})
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
    return MetricsResponse(
        total_messages=metrics.total_messages,
        messages_last_minute=metrics.get_messages_last_minute(),
        messages_per_second=metrics.get_messages_per_second(),
        kafka_status="connected" if kafka_producer.connected else "disconnected"
    )

@app.get("/")
async def root():
    return {
        "service": "Data Ingestion Service",
        "version": "1.0.0",
        "endpoints": ["/ingest", "/ingest/batch", "/health", "/metrics"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=Config.API_PORT)
