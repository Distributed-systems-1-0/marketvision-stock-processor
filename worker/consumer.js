const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const admin = require("firebase-admin");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// ============================================================
// FIREBASE SETUP (Motheo provides serviceAccountKey.json)
// ============================================================
let db = null;
let firebaseConnected = false;

const firebaseServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.resolve(__dirname, "../serviceAccountKey.json");

const firebaseCollectionName =
  process.env.FIREBASE_COLLECTION || "processed_ticks";

try {
  if (!fs.existsSync(firebaseServiceAccountPath)) {
    throw new Error(
      `Firebase service account file not found at ${firebaseServiceAccountPath}`,
    );
  }

  const serviceAccount = require(firebaseServiceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
  firebaseConnected = true;
  console.log(`✅ Firebase connected using ${firebaseServiceAccountPath}`);
} catch (error) {
  console.log("⚠️ Firebase not configured yet - will log to console only");
  console.log(`   ${error.message}`);
  console.log(
    "   Set FIREBASE_SERVICE_ACCOUNT_PATH in .env or place serviceAccountKey.json in project root",
  );
}

// ============================================================
// KAFKA SETUP
// ============================================================
const kafkaBrokers = process.env.KAFKA_BROKERS
  ? process.env.KAFKA_BROKERS.split(",").map((s) => s.trim())
  : ["localhost:9092"];
const kafkaTopic = process.env.KAFKA_TOPIC || "stock-ticks";

const kafka = new Kafka({
  clientId: "worker",
  brokers: kafkaBrokers,
});

const consumer = kafka.consumer({ groupId: "stock-workers" });

// ============================================================
// ANALYTICS ENGINE
// ============================================================
const priceHistory = {};
let totalProcessed = 0;
let startTime = Date.now();

function calculateMovingAverage(symbol, currentPrice) {
  if (!priceHistory[symbol]) {
    priceHistory[symbol] = [];
  }

  priceHistory[symbol].push(currentPrice);

  if (priceHistory[symbol].length > 5) {
    priceHistory[symbol].shift();
  }

  const sum = priceHistory[symbol].reduce((a, b) => a + b, 0);
  return Math.round((sum / priceHistory[symbol].length) * 100) / 100;
}

function calculateVolatility(symbol, currentPrice) {
  if (!priceHistory[symbol] || priceHistory[symbol].length < 2) {
    return 0;
  }

  const prices = priceHistory[symbol];
  let totalChange = 0;

  for (let i = 1; i < prices.length; i++) {
    const changePercent =
      Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
    totalChange += changePercent;
  }

  return Math.round((totalChange / (prices.length - 1)) * 100) / 100;
}

function detectAnomaly(symbol, currentPrice) {
  if (!priceHistory[symbol] || priceHistory[symbol].length < 3) {
    return false;
  }

  const recentPrices = priceHistory[symbol].slice(-3);
  const avgPrice =
    recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const changePercent = Math.abs((currentPrice - avgPrice) / avgPrice) * 100;

  return changePercent > 3;
}

async function saveToFirebase(processedTick) {
  if (!firebaseConnected || !db) {
    console.log(`💾 [MOCK] Would save to Firebase: ${processedTick.symbol}`);
    return;
  }

  try {
    await db.collection(firebaseCollectionName).add(processedTick);
    console.log(`💾 Saved to Firestore: ${processedTick.symbol}`);
  } catch (error) {
    console.error("❌ Firebase save error:", error.message);
  }
}

// ============================================================
// MAIN WORKER LOOP
// ============================================================
async function run() {
  await consumer.connect();
  console.log("✅ Worker connected to Kafka");

  await consumer.subscribe({
    topic: kafkaTopic,
    fromBeginning: false,
  });

  console.log("📡 Waiting for ticks...\n");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const tick = JSON.parse(message.value.toString());
      totalProcessed++;

      // Calculate analytics
      const movingAvg = calculateMovingAverage(tick.symbol, tick.price);
      const volatility = calculateVolatility(tick.symbol, tick.price);
      const isAnomaly = detectAnomaly(tick.symbol, tick.price);

      // Calculate processing rate every 10 ticks
      let rate = 0;
      if (totalProcessed % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        rate = Math.round(totalProcessed / elapsed);
        console.log(`📊 Rate: ${rate} ticks/sec | Total: ${totalProcessed}`);
      }

      const anomalyMarker = isAnomaly ? "⚠️ ANOMALY! " : "";
      console.log(
        `🔧 [${totalProcessed}] ${anomalyMarker}${tick.symbol}: $${tick.price} | MA: $${movingAvg} | Vol: ${volatility}%`,
      );

      // Prepare result for Firebase
      const processedResult = {
        symbol: tick.symbol,
        price: tick.price,
        volume: tick.volume,
        original_timestamp: tick.timestamp,
        processed_at: new Date().toISOString(),
        analytics: {
          moving_average_5s: movingAvg,
          volatility_percent: volatility,
          is_anomaly: isAnomaly,
          tick_number: totalProcessed,
          processing_rate: rate,
        },
      };

      // Save to Firebase
      await saveToFirebase(processedResult);
    },
  });
}

run().catch(console.error);

console.log("📈 MarketVision Worker Starting...");
