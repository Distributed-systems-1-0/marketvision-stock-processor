import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
    KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'raw_data_stream')
    KAFKA_DLQ_TOPIC = os.getenv('KAFKA_DLQ_TOPIC', 'dead_letter_queue')
    API_PORT = int(os.getenv('API_PORT', 8000))
    API_KEY = os.getenv('API_KEY', 'test-api-key-123')
    MAX_RETRIES = int(os.getenv('MAX_RETRIES', 3))
    RETRY_DELAY_SECONDS = int(os.getenv('RETRY_DELAY_SECONDS', 1))
