# Data Ingestion Service

## Quick Start

### 1. Start Kafka
```bash
cd docker
docker-compose up -d
```

### 2. Create Topics
```bash
chmod +x scripts/create_topic.sh
./scripts/create_topic.sh
```

### 3. Install Dependencies
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Set Environment Variables
```bash
cp .env.example .env
# Edit .env with your settings
```

### 5. Run Ingestion Service
```bash
python -m src.main
```

### 6. Test
```bash
# API docs available at http://localhost:8000/docs

# Run load simulation
python scripts/simulate_clients.py

# Run tests
pytest tests/
```

## API Endpoints
- `POST /ingest` - Ingest single message
- `POST /ingest/batch` - Ingest multiple messages
- `GET /health` - Health check
- `GET /metrics` - Performance metrics
