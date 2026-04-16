import pytest
from src.kafka_producer import KafkaProducerWrapper
from src.config import Config

@pytest.mark.asyncio
async def test_kafka_producer_send_message(monkeypatch):
    class DummyProducer:
        def __init__(self):
            self.sent = []

        async def start(self):
            pass

        async def stop(self):
            pass

        async def send(self, topic, message):
            self.sent.append((topic, message))
            return True

    producer = KafkaProducerWrapper()
    producer.producer = DummyProducer()
    producer.connected = True

    result = await producer.send_message(Config.KAFKA_TOPIC, {"message_id": "test"})

    assert result is True
    assert producer.producer.sent[0][0] == Config.KAFKA_TOPIC
    assert producer.producer.sent[0][1]["message_id"] == "test"
