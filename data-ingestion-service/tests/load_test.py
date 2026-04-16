import asyncio
import aiohttp
import random
from datetime import datetime
from src.config import Config

API_URL = f"http://localhost:{Config.API_PORT}/ingest"
API_KEY = Config.API_KEY

async def send_message(session, client_id, msg_num):
    data = {
        "client_id": client_id,
        "stream_type": random.choice(["social_media", "iot", "financial"]),
        "payload": {
            "value": msg_num,
            "timestamp": datetime.utcnow().isoformat(),
            "random_data": random.randint(1, 1000)
        }
    }
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    async with session.post(API_URL, json=data, headers=headers) as resp:
        return resp.status == 201

async def run_load_test(num_clients=5, messages_per_client=50):
    async with aiohttp.ClientSession() as session:
        tasks = []
        for client_id in range(num_clients):
            for msg_num in range(messages_per_client):
                tasks.append(send_message(session, f"client_{client_id}", msg_num))
        results = await asyncio.gather(*tasks)
        success_count = sum(results)
        print(f"\n✅ Sent {success_count}/{len(tasks)} messages successfully")

if __name__ == "__main__":
    asyncio.run(run_load_test())
