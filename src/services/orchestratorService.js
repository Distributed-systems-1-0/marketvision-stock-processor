const axios = require('axios');
const workerManager = require('./workerManagerService');

// Configuration from .env
const MAX_WORKERS = parseInt(process.env.MAX_WORKERS) || 10;
const MIN_WORKERS = parseInt(process.env.MIN_WORKERS) || 2;
const SCALE_UP_THRESHOLD = parseInt(process.env.SCALE_UP_THRESHOLD) || 70;
const SCALE_DOWN_THRESHOLD = parseInt(process.env.SCALE_DOWN_THRESHOLD) || 30;
const AI_API_URL = process.env.AI_PREDICTION_API;

// Track status
let scalingInProgress = false;

async function getCurrentMetrics() {
    try {
        const metricsUrl = process.env.KAFKA_METRICS_URL;
        const kafkaResponse = await axios.get(metricsUrl);
        
        return {
            queueDepth: kafkaResponse.data.queueDepth,
            activeWorkerCount: workerManager.getAllWorkers().length,
            avgCpuPercentage: 0, 
            tickRate: kafkaResponse.data.tickRatePerSecond || 0,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.log("⚠️ Kafka Service (Senatla) not found. Using internal mock data...");
        return {
            queueDepth: 500, // Triggering high load for testing
            activeWorkerCount: workerManager.getAllWorkers().length,
            avgCpuPercentage: 45,
            tickRate: 150,
            timestamp: new Date().toISOString()
        };
    }
}

async function getAIPrediction(metrics) {
    try {
        const response = await axios.post(AI_API_URL, {
            queue_depth: metrics.queueDepth,
            worker_count: metrics.activeWorkerCount,
            avg_cpu: metrics.avgCpuPercentage,
            tick_rate: metrics.tickRate,
            timestamp: metrics.timestamp
        });
        
        return {
            predictedLoad: response.data.predictedLoad,
            confidence: response.data.confidence
        };
    } catch (error) {
        console.error('AI prediction failed:', error.message);
        // Fallback calculation: (Current Queue / 1000) * 100
        const fallbackLoad = Math.min(100, (metrics.queueDepth / 1000) * 100);
        return { predictedLoad: fallbackLoad, confidence: 0.5 };
    }
}

async function scaleUp(count = 1) {
    if (scalingInProgress) return false;
    
    const currentWorkers = workerManager.getAllWorkers();
    if (currentWorkers.length + count > MAX_WORKERS) {
        console.log(`Cannot scale up: MAX_WORKERS reached.`);
        return false;
    }
    
    scalingInProgress = true;
    console.log(`🟢 SCALING UP: Adding ${count} worker(s)...`);
    
    for (let i = 0; i < count; i++) {
        const workerId = `worker-${Date.now()}-${i}`;
        const worker = await workerManager.spawnWorker(workerId);
        if (!worker) console.error(`Failed to start ${workerId}`);
    }
    
    await logScalingEvent('SCALE_UP', count, workerManager.getAllWorkers().length);
    scalingInProgress = false;
    return true;
}

async function scaleDown(count = 1) {
    if (scalingInProgress) return false;
    
    const currentWorkers = workerManager.getAllWorkers();
    if (currentWorkers.length - count < MIN_WORKERS) {
        console.log(`Cannot scale down: MIN_WORKERS required.`);
        return false;
    }
    
    scalingInProgress = true;
    console.log(`🔴 SCALING DOWN: Removing ${count} worker(s)...`);
    
    const workersToRemove = currentWorkers.slice(-count);
    for (const worker of workersToRemove) {
        await workerManager.killWorker(worker.id);
    }
    
    await logScalingEvent('SCALE_DOWN', count, workerManager.getAllWorkers().length);
    scalingInProgress = false;
    return true;
}

async function logScalingEvent(action, count, newTotal) {
    const event = {
        id: `${Date.now()}`,
        action: action,
        workerCount: count,
        newTotal: newTotal,
        timestamp: new Date().toISOString(),
        reason: `Load logic triggered ${action}`
    };
    console.log('📊 Scaling event logged:', event);
    return event;
}

async function orchestrationLoop() {
    const interval = parseInt(process.env.CHECK_INTERVAL_MS) || 10000;
    console.log(`🔄 Orchestration loop started. Checking every ${interval} ms`);
    
    setInterval(async () => {
        try {
            const metrics = await getCurrentMetrics();
            console.log('📊 Metrics:', metrics);
            
            const prediction = await getAIPrediction(metrics);
            console.log('🤖 AI Prediction:', prediction);
            
            const activeCount = workerManager.getAllWorkers().length;

            if (prediction.predictedLoad > SCALE_UP_THRESHOLD && activeCount < MAX_WORKERS) {
                await scaleUp(1);
            } 
            else if (prediction.predictedLoad < SCALE_DOWN_THRESHOLD && activeCount > MIN_WORKERS) {
                await scaleDown(1);
            }
            else {
                console.log(`✅ Load ${prediction.predictedLoad}% stable. No scaling needed.`);
            }
        } catch (error) {
            console.error('❌ Orchestration loop error:', error.message);
        }
    }, interval);
}

module.exports = {
    orchestrationLoop,
    getCurrentMetrics,
    scaleUp,
    scaleDown
};