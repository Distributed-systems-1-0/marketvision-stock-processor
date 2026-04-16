#!/usr/bin/env python3
import asyncio
import aiohttp
import random
from datetime import datetime

API_URL = "http://localhost:8000/ingest"
API_KEY = "test-api-key-123"

async def send_message(session, client_id, msg_num):
    """Send a single message"""
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
    try:
        async with session.post(API_URL, json=data, headers=headers) as resp:
            if resp.status == 201:
                return True
            else:
                print(f"Failed: {resp.status}")
                return False
    except Exception as e:
        print(f"Error: {e}")
        return False

async def simulate_clients(num_clients=10, messages_per_client=100):
    """Simulate multiple clients sending data"""
    async with aiohttp.ClientSession() as session:
        tasks = []
        for client_id in range(num_clients):
            for msg_num in range(messages_per_client):
                tasks.append(send_message(session, f"client_{client_id}", msg_num))
        results = await asyncio.gather(*tasks)
        success_count = sum(results)
        print(f"\n✅ Sent {success_count}/{len(tasks)} messages successfully")

if __name__ == "__main__":
    print("Starting load simulation...")
    asyncio.run(simulate_clients(num_clients=5, messages_per_client=50))
