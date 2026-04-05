require('dotenv').config(); // MUST be the first line
const express = require('express');
const { swaggerUi, specs } = require('./swagger');
const orchestratorRoutes = require('./src/routes/orchestratorRoutes');
const { orchestrationLoop } = require('./src/services/orchestratorService');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Middleware
app.use(express.json());

// 2. Route Mounting
// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API Routes (Note: This matches your curl path)
app.use('/api/orchestrator', orchestratorRoutes);

// 3. Health Checks
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ message: 'MarketVision Orchestrator is live!' });
});

// 4. Global 404 Handler (Helps catch route typos)
app.use((req, res) => {
    res.status(404).json({ error: `Path ${req.originalUrl} not found on this server.` });
});

// 5. Start Server and the "Brain" Loop
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Orchestrator running on port ${PORT}`);
    console.log(`📖 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`-----------------------------------------`);
    
    // Start the orchestration logic
    orchestrationLoop(); 
});