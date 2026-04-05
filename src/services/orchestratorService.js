// src/services/orchestratorService.js
const axios = require('axios');
const Docker = require('dockerode');
const docker = new Docker();

// Configuration
const MAX_WORKERS = parseInt(process.env.MAX_WORKERS) || 10;
const MIN_WORKERS = parseInt(process.env.MIN_WORKERS) || 2;
const SCALE_UP_THRESHOLD = parseInt(process.env.SCALE_UP_THRESHOLD) || 70;
const SCALE_DOWN_THRESHOLD = parseInt(process.env.SCALE_DOWN_THRESHOLD) || 30;
const AI_API_URL = process.env.AI_PREDICTION_API;

// Track current workers
let activeWorkers = [];
let scalingInProgress = false;

async function getCurrentMetrics() {
    try {
        // 1. Get the URL from your .env file
        const metricsUrl = process.env.KAFKA_METRICS_URL;
        
        // 2. Try to call Senatla's service
        const kafkaResponse = await axios.get(metricsUrl);
        
        return {
            queueDepth: kafkaResponse.data.queueDepth,
            activeWorkerCount: activeWorkers.length,
            avgCpuPercentage: 0, // Placeholder for now
            tickRate: kafkaResponse.data.tickRatePerSecond || 0,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        // 3. THE SAFETY NET: If Senatla is offline, use fake data so the loop continues
        console.log("⚠️ Kafka Service (Senatla) not found. Using internal mock data...");
        
        return {
            queueDepth: 500, // A "safe" number that won't trigger massive scaling
            activeWorkerCount: activeWorkers.length,
            avgCpuPercentage: 45,
            tickRate: 150,
            timestamp: new Date().toISOString()
        };
    }
}

async function getAIPrediction(metrics) {
    // PAUSE HERE: Coordinate with Kemo (AI/ML Engineer)
    // Ask Kemo: "What format does your prediction API expect? What does it return?"
    // Kemo should provide: POST /predict with body containing metrics
    // Response: { predictedLoad: 75, confidence: 0.85 }
    
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
        // Fallback: use simple threshold based on queue depth
        const fallbackLoad = Math.min(100, (metrics.queueDepth / 1000) * 100);
        return { predictedLoad: fallbackLoad, confidence: 0.5 };
    }
}

async function scaleUp(count = 1) {
    if (scalingInProgress) {
        console.log('Scaling already in progress, skipping...');
        return false;
    }
    
    const newWorkerCount = activeWorkers.length + count;
    if (newWorkerCount > MAX_WORKERS) {
        console.log(`Cannot scale up: would exceed MAX_WORKERS (${MAX_WORKERS})`);
        return false;
    }
    
    scalingInProgress = true;
    console.log(`🟢 SCALING UP: Adding ${count} worker(s)...`);
    
    // PAUSE HERE: Coordinate with Boipuso (Processing Worker Lead)
    // Ask Boipuso: "How do I start a new worker instance?"
    // Options:
    // Option A: Docker container - docker.run()
    // Option B: Cloud Run - Google Cloud Run API
    // Option C: Child process - spawn('node', ['worker.js'])
    
    for (let i = 0; i < count; i++) {
        const workerId = `worker-${Date.now()}-${i}`;
        
        // EXAMPLE: Using Docker (you'll need Docker installed)
        try {
            const container = await docker.createContainer({
                Image: 'marketvision-worker:latest',
                name: workerId,
                Env: [`WORKER_ID=${workerId}`, `KAFKA_BROKER=${process.env.KAFKA_BROKER}`],
                HostConfig: {
                    NetworkMode: 'host'
                }
            });
            await container.start();
            
            activeWorkers.push({
                id: workerId,
                containerId: container.id,
                ip: 'localhost',
                startedAt: new Date().toISOString()
            });
            
            console.log(`✅ Worker ${workerId} started`);
        } catch (error) {
            console.error(`Failed to start worker ${workerId}:`, error.message);
        }
    }
    
    // Log the scaling event to Firebase (for dashboard)
    await logScalingEvent('SCALE_UP', count, activeWorkers.length);
    
    scalingInProgress = false;
    return true;
}

async function scaleDown(count = 1) {
    if (scalingInProgress) {
        console.log('Scaling already in progress, skipping...');
        return false;
    }
    
    const newWorkerCount = activeWorkers.length - count;
    if (newWorkerCount < MIN_WORKERS) {
        console.log(`Cannot scale down: would go below MIN_WORKERS (${MIN_WORKERS})`);
        return false;
    }
    
    scalingInProgress = true;
    console.log(`🔴 SCALING DOWN: Removing ${count} worker(s)...`);
    
    // Remove the oldest/idle workers first
    const workersToRemove = activeWorkers.slice(-count);
    
    for (const worker of workersToRemove) {
        try {
            // Stop Docker container
            const container = docker.getContainer(worker.containerId);
            await container.stop();
            await container.remove();
            
            console.log(`✅ Worker ${worker.id} stopped and removed`);
        } catch (error) {
            console.error(`Failed to stop worker ${worker.id}:`, error.message);
        }
    }
    
    // Update active workers list
    activeWorkers = activeWorkers.filter(w => !workersToRemove.includes(w));
    
    // Log the scaling event
    await logScalingEvent('SCALE_DOWN', count, activeWorkers.length);
    
    scalingInProgress = false;
    return true;
}

async function logScalingEvent(action, count, newTotal) {
    // PAUSE HERE: Coordinate with Bakang (Frontend Lead)
    // Ask Bakang: "Where should I store scaling events for the dashboard to read?"
    // Bakang will likely say: "Write to Firebase Realtime Database at /scaling-events"
    
    const event = {
        id: `${Date.now()}`,
        action: action,  // 'SCALE_UP' or 'SCALE_DOWN'
        workerCount: count,
        newTotal: newTotal,
        timestamp: new Date().toISOString(),
        reason: `Predicted load ${action === 'SCALE_UP' ? 'exceeded' : 'fell below'} threshold`
    };
    
    // Example: Write to Firebase (you'll need Firebase Admin SDK)
    // const admin = require('firebase-admin');
    // await admin.database().ref('/scaling-events').push(event);
    
    console.log('📊 Scaling event logged:', event);
    return event;
}

async function orchestrationLoop() {
    console.log('🔄 Orchestration loop started. Checking every', process.env.CHECK_INTERVAL_MS, 'ms');
    
    setInterval(async () => {
        try {
            // Step 1: Get current system metrics
            const metrics = await getCurrentMetrics();
            console.log('📊 Metrics:', metrics);
            
            // Step 2: Ask AI for load prediction
            const prediction = await getAIPrediction(metrics);
            console.log('🤖 AI Prediction:', prediction);
            
            // Step 3: Make scaling decision
            if (prediction.predictedLoad > SCALE_UP_THRESHOLD && activeWorkers.length < MAX_WORKERS) {
                console.log(`⚠️ Predicted load ${prediction.predictedLoad}% > ${SCALE_UP_THRESHOLD}%. Scaling UP...`);
                await scaleUp(1);
            } 
            else if (prediction.predictedLoad < SCALE_DOWN_THRESHOLD && activeWorkers.length > MIN_WORKERS) {
                console.log(`ℹ️ Predicted load ${prediction.predictedLoad}% < ${SCALE_DOWN_THRESHOLD}%. Scaling DOWN...`);
                await scaleDown(1);
            }
            else {
                console.log(`✅ Load ${prediction.predictedLoad}% within thresholds. No scaling needed.`);
            }
            
        } catch (error) {
            console.error('❌ Orchestration loop error:', error.message);
        }
    }, parseInt(process.env.CHECK_INTERVAL_MS) || 10000);
}

module.exports = {
    orchestrationLoop,
    getCurrentMetrics,
    scaleUp,
    scaleDown,
    activeWorkers
};