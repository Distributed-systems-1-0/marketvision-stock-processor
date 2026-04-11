require('dotenv').config(); // MUST be the first line
const express = require('express');
const { Kafka } = require('kafkajs');
const { swaggerUi, specs } = require('./swagger');
const orchestratorRoutes = require('./src/routes/orchestratorRoutes');
const { orchestrationLoop, scaleUp } = require('./src/services/orchestratorService');

const app = express();
const PORT = process.env.PORT || 3001;

// --- 1. KAFKA CONFIGURATION ---
// IMPORTANT: process.env.KAFKA_BROKER must be Senatla's IP (e.g., 5.4.X.X:9092)
const kafka = new Kafka({
    clientId: 'marketvision-processor',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});
const consumer = kafka.consumer({ groupId: 'processor-group' });

// --- 2. KAFKA PROCESSOR LOGIC (Senatla + Kemo Bridge) ---
const startKafkaConsumer = async () => {
    try {
        await consumer.connect();
        console.log("✅ Kafka Consumer: Connected to Senatla's Broker");

        // Logic: Using Senatla's topic 'stock-ticks' from your .env
        await consumer.subscribe({ topic: process.env.KAFKA_TOPIC || 'stock-ticks', fromBeginning: true });

        await consumer.run({
            eachMessage: async ({ message }) => {
                // Parse the JSON structure from Senatla's screenshot
                const stock = JSON.parse(message.value.toString());
                console.log(`[DATA IN] Received ${stock.symbol}: $${stock.price} | Volume: ${stock.volume}`);

                // The bridge is now active via the orchestrationLoop talking to Kemo's AI
            },
        });
    } catch (err) {
        console.error("❌ Kafka Error: Ensure Senatla's IP is correct in .env", err.message);
    }
};

// --- 3. MIDDLEWARE & ROUTES ---
app.use(express.json());

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API Routes (Includes Bakang's history endpoint)
app.use('/api/orchestrator', orchestratorRoutes);

// Health Checks
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ message: 'MarketVision Orchestrator is live!' });
});

// Global 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: `Path ${req.originalUrl} not found.` });
});

// --- 4. START SERVER & LOOPS ---
app.listen(PORT, async () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Orchestrator running on port ${PORT}`);
    console.log(`📖 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`-----------------------------------------`);
    
    // PHASE 5 FIX: Spawn the "Minimum 2 Workers" immediately at startup
    console.log("🛠️ Initializing minimum worker pool...");
    await scaleUp(2); 

    // Start the orchestration loop (Talks to Kemo at 5.4.18.50)
    orchestrationLoop(); 

    // Start the Kafka consumer (Talks to Senatla)
    startKafkaConsumer();
});