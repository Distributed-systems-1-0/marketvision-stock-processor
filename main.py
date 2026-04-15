from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from datetime import datetime

app = FastAPI(title="MarketVision AI Engine")

class LoadMetrics(BaseModel):
    timestamp: str
    queue_depth: int
    tick_rate: int
    worker_count: int
    avg_worker_cpu: float

class StockTick(BaseModel):
    price: float
    volume: int
    timestamp: str

class PriceRequest(BaseModel):
    symbol: str
    ticks: List[StockTick]
    context: dict

@app.get("/health")
def health_check():
    return {"status": "AI Engine is running!", "timestamp": datetime.now().isoformat()}

@app.post("/predict/load")
def predict_load(metrics: LoadMetrics):
    queue_score = min(100, metrics.queue_depth / 2000 * 100)
    tick_score = min(100, metrics.tick_rate / 500 * 100)
    cpu_score = metrics.avg_worker_cpu
    predicted_load = (queue_score * 0.4 + tick_score * 0.3 + cpu_score * 0.3)
    
    if predicted_load > 70:
        recommended = max(2, int(predicted_load / 20))
    elif predicted_load < 30:
        recommended = max(1, int(predicted_load / 15))
    else:
        recommended = 3
    
    return {
        "predicted_load": round(predicted_load, 1),
        "recommended_workers": recommended,
        "reasoning": f"Queue: {metrics.queue_depth}, Tick rate: {metrics.tick_rate}/sec, CPU: {metrics.avg_worker_cpu}%"
    }

@app.post("/predict/price")
def predict_price(request: PriceRequest):
    if not request.ticks:
        return {"error": "No ticks provided"}
    
    prices = [t.price for t in request.ticks]
    current_price = prices[-1]
    
    if len(prices) >= 2:
        if prices[-1] > prices[-2]:
            direction = "up"
            target = current_price * 1.005
        else:
            direction = "down"
            target = current_price * 0.995
    else:
        direction = "neutral"
        target = current_price
    
    return {
        "symbol": request.symbol,
        "prediction_timestamp": datetime.now().isoformat(),
        "direction": direction,
        "confidence": 70,
        "target_price": round(target, 2),
        "time_horizon_seconds": 300,
        "reasoning": f"Price changed from {prices[0]} to {current_price}",
        "ai_model": "simple_predictor"
    }

if __name__ == "__main__":
    print("\n" + "="*50)
    print("🤖 MarketVision AI Engine")
    print("="*50)
    print("\n✅ Health check: http://localhost:8000/health")
    print("✅ Load prediction: POST /predict/load")
    print("✅ Price prediction: POST /predict/price")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)