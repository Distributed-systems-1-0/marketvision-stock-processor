from pydantic import BaseModel, Field
from datetime import datetime

class IngestData(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    price: float = Field(..., gt=0)
    volume: int = Field(..., ge=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "symbol": "AAPL",
                "price": 175.5,
                "volume": 1000,
                "timestamp": "2026-04-16T12:00:00Z"
            }
        }

class HealthResponse(BaseModel):
    status: str
    kafka_connected: bool
    messages_ingested_total: int

class MetricsResponse(BaseModel):
    total_messages: int
    messages_last_minute: int
    messages_per_second: float
    kafka_status: str
    queueDepth: int
    tickRatePerSecond: float
    cpuUsage: float
