const express = require('express');
const app = express();
require('dotenv').config();

// 1. Documentation Setup (Importing from swagger.js)
const { swaggerUi, specs } = require('./swagger');

// 2. Import Routes & Services
const orchestratorRoutes = require('./src/routes/orchestratorRoutes');
const { orchestrationLoop } = require('./src/services/orchestratorService');

const PORT = process.env.PORT || 3001;

// 3. Middleware
app.use(express.json());

// 4. Mount Routes
// This creates the http://localhost:3001/api-docs page
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
// This prefixes all your routes with /api (e.g., /api/metrics)
app.use('/api', orchestratorRoutes);

// 5. Basic Health Checks
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ message: 'MarketVision Orchestrator is running!' });
});

// 6. Start Server and the "Brain" Loop
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Orchestrator running on port ${PORT}`);
    console.log(`📖 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🔄 Starting orchestration loop...`);
    console.log(`-----------------------------------------`);
    
    // This starts the 10-second timer for auto-scaling
    orchestrationLoop(); 
});