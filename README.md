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
2. Install Node.js dependencies
bash
npm install
cd worker && npm install
cd ../dashboard && npm install
cd ..
3. Set up Python virtual environment
bash
cd data-ingestion-service
python -m venv .venv

# Windows:
.\.venv\Scripts\activate

# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cd ..
4. Set up AI Engine environment
bash
cd ai-engine
python -m venv venv

# Windows:
.\venv\Scripts\activate

# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..
5. Configure Firebase
Create a Firebase project

Enable Firestore and Realtime Database

Download serviceAccountKey.json and place in project root

Copy Firebase web config to dashboard/src/firebase.js

6. Prepare CSV data
Place your stock CSV files in the data/ folder. Expected columns:

Date (or date, timestamp)

Close (or close, price)

Volume (or volume)

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
🛑 Stopping the System
Step 1: Stop each terminal
Press Ctrl + C in Terminals 2 through 7.

Step 2: Stop Kafka
bash
cd data-ingestion-service\docker
docker compose down
🧪 Running Load Tests
bash
cd tests

# Normal load: 100 ticks at 50/sec
npm run test:normal

# High load: 200 ticks at 200/sec
npm run test:high

# Spike load: 500 ticks at 500/sec (triggers auto-scaling)
npm run test:spike
📊 Dashboard Features
Feature	Description
Live tick table	Shows symbol, price, volume, moving average, volatility
System metrics	Queue depth, worker count, predicted load, tick rate
Trend graphs	Tick rate, queue depth, AI predictions, worker count
Auto-scaling timeline	Shows when workers were added/removed
Demo controls	Start/Stop Load Test, Simulate Spike, Reset View
🤖 How AI Auto-Scaling Works
Orchestrator reads queue depth from Kafka every 10 seconds

AI Engine receives last 5 queue depths and predicts future load (0-100%)

If predicted load > 70% → SCALE UP (add workers)

If predicted load < 30% → SCALE DOWN (remove workers)

Otherwise → maintain current workers

The AI predicts 30 seconds into the future, enabling proactive scaling.