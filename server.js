require('dotenv').config(); // MUST be the first line
const express = require('express');
const { Kafka } = require('kafkajs'); // New dependency
const { swaggerUi, specs } = require('./swagger');
const orchestratorRoutes = require('./src/routes/orchestratorRoutes');
const { orchestrationLoop } = require('./src/services/orchestratorService');

const app = express();
const PORT = process.env.PORT || 3001;

// --- 1. KAFKA CONFIGURATION ---
const kafka = new Kafka({
    clientId: 'marketvision-processor',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});
const consumer = kafka.consumer({ groupId: 'processor-group' });

// --- 2. KAFKA PROCESSOR LOGIC (Senatla + Kemo Bridge) ---
const startKafkaConsumer = async () => {
    try {
        await consumer.connect();
        console.log("✅ Kafka Consumer: Connected to Broker");

        // Logic: Using Senatla's topic from your .env
        await consumer.subscribe({ topic: process.env.KAFKA_TOPIC, fromBeginning: true });

        await consumer.run({
            eachMessage: async ({ message }) => {
                // Logic: Parse the JSON structure Senatla provided
                const stock = JSON.parse(message.value.toString());
                console.log(`[DATA IN] Received ${stock.symbol}: $${stock.price}`);

                // --- THE KEMO BRIDGE ---
                if (process.env.DB_CONNECTION_URL === 'pending_kemo_input') {
                    console.log(`[MOCK STORAGE] Data for ${stock.symbol} is ready, but Kemo's DB is pending.`);
                } else {
                    // This is where Kemo's future DB save logic will be injected
                    console.log(`[REAL STORAGE] Saving ${stock.symbol} to ${process.env.DB_CONNECTION_URL}`);
                }
            },
        });
    } catch (err) {
        console.error("❌ Kafka Error:", err);
    }
};

// --- 3. MIDDLEWARE & ROUTES ---
app.use(express.json());

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API Routes
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
    res.status(404).json({ error: `Path ${req.originalUrl} not found on this server.` });
});

// --- 4. START SERVER & LOOPS ---
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Orchestrator running on port ${PORT}`);
    console.log(`📖 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`-----------------------------------------`);
    
    // Start the existing orchestration loop
    orchestrationLoop(); 

    // Start the new Kafka consumer for Senatla's data
    startKafkaConsumer();
});