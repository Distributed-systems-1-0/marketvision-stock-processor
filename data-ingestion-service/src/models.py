from pydantic import BaseModel, Field, validator
from datetime import datetime
import uuid

class IngestData(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=100)
    stream_type: str = Field(..., regex='^(social_media|iot|financial)$')
    payload: dict = Field(..., description="The actual data payload")
    
    # Optional fields (will be auto-generated if missing)
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('payload')
    def payload_not_empty(cls, v):
        if not v:
            raise ValueError('Payload cannot be empty')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "client_id": "client_001",
                "stream_type": "iot",
                "payload": {"temperature": 23.5, "humidity": 65}
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
