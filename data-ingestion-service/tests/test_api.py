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
        "symbol": "AAPL",
        "price": 175.5,
        "volume": 1000
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 201
    assert response.json()["status"] == "success"


def test_ingest_invalid_api_key():
    headers = {"X-API-Key": "wrong-key"}
    data = {
        "symbol": "AAPL",
        "price": 175.5,
        "volume": 1000
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 401


def test_ingest_invalid_data():
    headers = {"X-API-Key": Config.API_KEY}
    data = {
        "symbol": "",
        "price": -1,
        "volume": -3
    }
    response = client.post("/ingest", json=data, headers=headers)
    assert response.status_code == 422


def test_metrics_endpoint():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "total_messages" in response.json()
    assert "queueDepth" in response.json()
    assert "tickRatePerSecond" in response.json()
