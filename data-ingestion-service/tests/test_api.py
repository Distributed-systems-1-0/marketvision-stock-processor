import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.config import Config

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] in ["healthy", "degraded"]


def test_ingest_valid_data():
    headers = {"X-API-Key": Config.API_KEY}
    data = {
        "client_id": "test_client",
        "stream_type": "iot",
        "payload": {"temp": 25}
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 201
    assert response.json()["status"] == "success"


def test_ingest_invalid_api_key():
    headers = {"X-API-Key": "wrong-key"}
    data = {
        "client_id": "test_client",
        "stream_type": "iot",
        "payload": {"temp": 25}
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 401


def test_ingest_invalid_data():
    headers = {"X-API-Key": Config.API_KEY}
    data = {
        "client_id": "",
        "stream_type": "invalid_type",
        "payload": {}
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 422


def test_metrics_endpoint():
    headers = {"X-API-Key": Config.API_KEY}
    response = client.get("/metrics", headers=headers)
    assert response.status_code == 200
    assert "total_messages" in response.json()
