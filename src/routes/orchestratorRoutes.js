// src/routes/orchestratorRoutes.js
const express = require('express');
const router = express.Router();
const { getCurrentMetrics, activeWorkers, scaleUp, scaleDown } = require('../services/orchestratorService');

// GET /api/metrics - For dashboard to show system health
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getCurrentMetrics();
        res.json({
            success: true,
            data: {
                ...metrics,
                workers: activeWorkers.map(w => ({
                    id: w.id,
                    startedAt: w.startedAt,
                    status: 'running'
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/workers - List all active workers
router.get('/workers', (req, res) => {
    res.json({
        success: true,
        count: activeWorkers.length,
        workers: activeWorkers
    });
});

// POST /api/scale/up - Manual scale up (for testing)
router.post('/scale/up', async (req, res) => {
    const count = req.body.count || 1;
    const result = await scaleUp(count);
    res.json({ success: result, message: result ? 'Scale up initiated' : 'Scale up failed' });
});

// POST /api/scale/down - Manual scale down (for testing)
router.post('/scale/down', async (req, res) => {
    const count = req.body.count || 1;
    const result = await scaleDown(count);
    res.json({ success: result, message: result ? 'Scale down initiated' : 'Scale down failed' });
});

module.exports = router;