const axios = require("axios");
const workerManager = require("./workerManagerService");

// Configuration from .env
const MAX_WORKERS = parseInt(process.env.MAX_WORKERS) || 10;
const MIN_WORKERS = parseInt(process.env.MIN_WORKERS) || 2;
const SCALE_UP_THRESHOLD = parseInt(process.env.SCALE_UP_THRESHOLD) || 70;
const SCALE_DOWN_THRESHOLD = parseInt(process.env.SCALE_DOWN_THRESHOLD) || 30;
const AI_API_URL = process.env.AI_PREDICTION_API;

// Phase 5 Refinement: Cooldown & History
let lastScaleTime = Date.now();
const COOLDOWN_MS = 30000; // 30 seconds between scaling actions
let scalingHistory = []; // Data for Bakang's Dashboard (Phase 6)
let scalingInProgress = false;

async function getCurrentMetrics() {
  try {
    const metricsUrl = process.env.KAFKA_METRICS_URL;
    const kafkaResponse = await axios.get(metricsUrl);

    return {
      queueDepth: kafkaResponse.data.queueDepth,
      activeWorkerCount: workerManager.getAllWorkers().length,
      avgCpuPercentage: kafkaResponse.data.cpuUsage || 0,
      tickRate: kafkaResponse.data.tickRatePerSecond || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.log(
      "⚠️ Kafka Service (Senatla) not found. Using internal mock data...",
    );
    return {
      queueDepth: 500,
      activeWorkerCount: workerManager.getAllWorkers().length,
      avgCpuPercentage: 45.5,
      tickRate: 150,
      timestamp: new Date().toISOString(),
    };
  }
}

async function getAIPrediction(metrics) {
  try {
    const response = await axios.post(AI_API_URL, {
      timestamp: metrics.timestamp,
      queue_depth: metrics.queueDepth,
      tick_rate: metrics.tickRate,
      worker_count: metrics.activeWorkerCount,
      avg_worker_cpu: metrics.avgCpuPercentage,
    });

    return {
      predictedLoad:
        response.data.predicted_load || response.data.predictedLoad,
      confidence: response.data.confidence || 1.0,
      suggestedWorkers: response.data.suggested_workers,
    };
  } catch (error) {
    console.error("AI prediction failed:", error.message);
    const fallbackLoad = Math.min(100, (metrics.queueDepth / 1000) * 100);
    return {
      predictedLoad: fallbackLoad,
      confidence: 0.5,
      suggestedWorkers: null,
    };
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
    await workerManager.spawnWorker(workerId);
  }

  const event = await logScalingEvent(
    "SCALE_UP",
    count,
    workerManager.getAllWorkers().length,
  );
  scalingHistory.push(event);

  lastScaleTime = Date.now(); // Reset cooldown
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

  const event = await logScalingEvent(
    "SCALE_DOWN",
    count,
    workerManager.getAllWorkers().length,
  );
  scalingHistory.push(event);

  lastScaleTime = Date.now(); // Reset cooldown
  scalingInProgress = false;
  return true;
}

async function logScalingEvent(action, count, newTotal) {
  return {
    id: `${Date.now()}`,
    action,
    workerCount: count,
    newTotal,
    timestamp: new Date().toISOString(),
    reason: `AI optimized workload management`,
  };
}

// Added for Phase 6 Dashboard Integration
function getScalingHistory() {
  return scalingHistory;
}

async function orchestrationLoop() {
  const interval = parseInt(process.env.CHECK_INTERVAL_MS) || 10000;
  console.log(`🔄 Loop active. Cooldown set to ${COOLDOWN_MS / 1000}s.`);

  setInterval(async () => {
    try {
      const metrics = await getCurrentMetrics();
      const prediction = await getAIPrediction(metrics);
      const activeCount = workerManager.getAllWorkers().length;

      console.log(
        `📊 [${new Date().toLocaleTimeString()}] Load: ${prediction.predictedLoad}% | Workers: ${activeCount}`,
      );

      // Step 6.2: Check Cooldown
      const timeSinceLastScale = Date.now() - lastScaleTime;
      const isScaleNeeded =
        prediction.suggestedWorkers > activeCount ||
        prediction.predictedLoad > SCALE_UP_THRESHOLD ||
        prediction.suggestedWorkers < activeCount ||
        prediction.predictedLoad < SCALE_DOWN_THRESHOLD;

      if (isScaleNeeded && timeSinceLastScale < COOLDOWN_MS) {
        console.log(
          `⏳ Scaling postponed: Cooldown active (${Math.round((COOLDOWN_MS - timeSinceLastScale) / 1000)}s left)`,
        );
        return;
      }

      // Scaling Decisions
      if (
        (prediction.suggestedWorkers > activeCount ||
          prediction.predictedLoad > SCALE_UP_THRESHOLD) &&
        activeCount < MAX_WORKERS
      ) {
        // Step 6.1: Proportional Scaling
        let workersToAdd = 1;
        if (prediction.predictedLoad > 90) workersToAdd = 2;
        await scaleUp(workersToAdd);
      } else if (
        (prediction.suggestedWorkers < activeCount ||
          prediction.predictedLoad < SCALE_DOWN_THRESHOLD) &&
        activeCount > MIN_WORKERS
      ) {
        await scaleDown(1);
      }
    } catch (error) {
      console.error("❌ Loop error:", error.message);
    }
  }, interval);
}

module.exports = {
  orchestrationLoop,
  getScalingHistory,
  getCurrentMetrics,
  scaleUp,
};
