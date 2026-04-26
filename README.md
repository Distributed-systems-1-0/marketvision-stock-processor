# MarketVision – AI-Powered Stock Market Tick Processor

## 📌 Overview

MarketVision is a **distributed system** that ingests real-time stock market ticks, processes them with parallel workers, and uses **AI to predict system load** and trigger **auto-scaling before performance degrades**.

The system demonstrates proactive, AI-driven scalability – instead of reacting to overload, it predicts future demand and provisions resources in advance.

---

## 👥 Team Members

| Role | Name |
|------|------|
| Project Manager | Maano Dikgang |
| AI/ML Engineer | Kemo Mawala |
| Backend Lead | Motheo Letsatle |
| Data Ingestion Lead | Senatla Lekang |
| Processing Worker Lead | Boipuso Rante |
| Frontend Lead | Bakang Otukile |
| Quality Assurance Lead | Ogorogile Leswape |

---

## 🏗️ System Architecture
CSV Files → Simulator → Ingestion API → Kafka → Worker → Firebase → Dashboard
↑ ↑
Orchestrator ← AI Engine ←───┘

text

| Component | Technology | Purpose |
|-----------|------------|---------|
| Data Source | CSV files (Yahoo Finance) | Historical stock data |
| Ingestion API | FastAPI (Python) | Receives ticks, publishes to Kafka |
| Message Queue | Apache Kafka (Docker) | Buffers ticks, decouples services |
| Worker | Node.js | Consumes ticks, calculates analytics |
| AI Engine | FastAPI + Prophet | Predicts future system load |
| Orchestrator | Node.js | Monitors metrics, triggers scaling |
| Database | Firebase Firestore + Realtime DB | Stores processed ticks + metrics |
| Dashboard | React | Real-time visualization |

---

## 🚀 Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Docker Desktop | Latest | Runs Kafka |
| Node.js | 18+ | Runs worker, orchestrator, dashboard |
| Python | 3.10+ | Runs ingestion API, AI engine |

---

## 📦 Installation (One-Time Setup)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/marketvision-stock-processor.git
cd marketvision-stock-processor
▶️ Running the System
You need 7 terminal windows. Keep them all open.

Terminal 1: Start Kafka
bash
cd data-ingestion-service\docker
docker compose up -d
Wait 10 seconds, then create the topic:

bash
docker exec kafka kafka-topics --create --if-not-exists --topic stock-ticks --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
Terminal 2: Start Ingestion API
bash
cd data-ingestion-service
.\.venv\Scripts\activate   # Windows
# source .venv/bin/activate # Mac/Linux
python -m src.main
Terminal 3: Start AI Engine
bash
cd ai-engine
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # Mac/Linux
python -m uvicorn main:app --host 0.0.0.0 --port 8001
Terminal 4: Start Worker
bash
cd worker
npm start
Terminal 5: Start Orchestrator
bash
cd C:\Users\schek\OneDrive\Desktop\Distr Sys Project\marketvision-stock-processor
npm start
Terminal 6: Start Dashboard
bash
cd dashboard
npm start
Terminal 7: Send CSV Data
bash
node simulate-ticks.js .\data http://localhost:8000/ingest test-api-key-123 100
The last number (100) is delay in milliseconds. Lower = faster ticks.

🌐 Access the System
Service	URL
Dashboard	http://localhost:3001
Ingestion API Docs	http://localhost:8000/docs
AI Engine Health	http://localhost:8001/health
Kafka UI	http://localhost:8080