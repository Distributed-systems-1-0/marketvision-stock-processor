import asyncio
import json
import logging
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError
from src.config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class KafkaProducerWrapper:
    def __init__(self):
        self.producer = None
        self.connected = False
        
    async def start(self):
        """Initialize and start Kafka producer"""
        self.producer = AIOKafkaProducer(
            bootstrap_servers=Config.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
            acks='all'  # Wait for all replicas to acknowledge
        )
        await self.producer.start()
        self.connected = True
        logger.info(f"Kafka producer connected to {Config.KAFKA_BOOTSTRAP_SERVERS}")
        
    async def stop(self):
        """Gracefully stop producer"""
        if self.producer:
            await self.producer.stop()
            self.connected = False
            logger.info("Kafka producer stopped")
            
    async def send_message(self, topic: str, message: dict, retry_count: int = 0):
        """Send message with retry logic"""
        try:
            await self.producer.send(topic, message)
            logger.debug(f"Message sent to {topic}: {message.get('message_id')}")
            return True
        except KafkaError as e:
            logger.error(f"Kafka error: {e}")
            if retry_count < Config.MAX_RETRIES:
                await asyncio.sleep(Config.RETRY_DELAY_SECONDS)
                return await self.send_message(topic, message, retry_count + 1)
            else:
                # Send to Dead Letter Queue
                await self.send_to_dlq(message, str(e))
                return False
                
    async def send_to_dlq(self, original_message: dict, error: str):
        """Send failed messages to dead letter queue"""
        dlq_message = {
            "original_message": original_message,
            "error": error,
            "failed_at": str(asyncio.get_event_loop().time())
        }
        try:
            await self.producer.send(Config.KAFKA_DLQ_TOPIC, dlq_message)
            logger.warning(f"Message sent to DLQ: {original_message.get('message_id')}")
        except Exception as e:
            logger.error(f"Failed to send to DLQ: {e}")
