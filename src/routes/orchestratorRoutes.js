const express = require('express');
const router = express.Router();
const workerManager = require('../services/workerManagerService');

// POST /api/orchestrator/spawn
router.post('/spawn', async (req, res) => {
    const { workerId } = req.body;
    const worker = await workerManager.spawnWorker(workerId || `worker-${Date.now()}`);
    
    if (worker) {
        res.status(201).json({ message: 'Worker spawned successfully', worker });
    } else {
        res.status(500).json({ error: 'Failed to spawn worker' });
    }
});

// GET /api/orchestrator/workers
router.get('/workers', (req, res) => {
    const workers = workerManager.getAllWorkers();
    res.json(workers);
});

// DELETE /api/orchestrator/kill/:id
router.delete('/kill/:id', async (req, res) => {
    const success = await workerManager.killWorker(req.params.id);
    if (success) {
        res.json({ message: `Worker ${req.params.id} terminated` });
    } else {
        res.status(404).json({ error: 'Worker not found' });
    }
});

module.exports = router;