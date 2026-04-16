import time
from collections import deque
from datetime import datetime

class IngestionMetrics:
    def __init__(self):
        self.total_messages = 0
        self.message_timestamps = deque(maxlen=10000)  # Keep last 10k timestamps
        self.start_time = datetime.utcnow()
        
    def record_message(self):
        """Record a new ingested message"""
        self.total_messages += 1
        self.message_timestamps.append(time.time())
        
    def get_messages_last_minute(self):
        """Count messages in last 60 seconds"""
        current_time = time.time()
        cutoff = current_time - 60
        return sum(1 for ts in self.message_timestamps if ts > cutoff)
    
    def get_messages_per_second(self):
        """Calculate average messages per second over last minute"""
        count = self.get_messages_last_minute()
        return count / 60.0
    
    def get_uptime_seconds(self):
        """Get service uptime"""
        return (datetime.utcnow() - self.start_time).total_seconds()
    
    def get_metrics_dict(self, kafka_status: str):
        """Return metrics as dictionary for API response"""
        return {
            "total_messages": self.total_messages,
            "messages_last_minute": self.get_messages_last_minute(),
            "messages_per_second": round(self.get_messages_per_second(), 2),
            "uptime_seconds": round(self.get_uptime_seconds(), 2),
            "kafka_status": kafka_status
        }

# Global metrics instance
metrics = IngestionMetrics()
