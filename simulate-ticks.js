const fs = require('fs');
const csv = require('csv-parser');
const { Kafka } = require('kafkajs');

// CONFIGURATION
const args = process.argv.slice(2);
const CSV_FILE = args[0] || './data/AAPL.csv';  // Path to your CSV file
const SYMBOL = args[1] || 'STOCK';  // Stock symbol
const KAFKA_BROKER = args[2] || 'localhost:9092';  // Kafka broker
const DELAY_MS = args[3] || 100;  // Wait 100ms between ticks (10 ticks per second)
const KAFKA_TOPIC = 'stock-ticks';  // Topic name

// Check if file exists
if (!fs.existsSync(CSV_FILE)) {
  console.error(`❌ Error: File not found: ${CSV_FILE}`);
  console.error(`\nUsage: node simulate-ticks.js <csv_file> [symbol] [kafka_broker] [delay_ms]`);
  console.error(`Example: node simulate-ticks.js "c:\\Users\\schek\\Downloads\\Apple.csv" AAPL localhost:9092 100`);
  process.exit(1);
}

console.log(`📊 Starting CSV playback to Kafka...`);
console.log(`   File: ${CSV_FILE}`);
console.log(`   Symbol: ${SYMBOL}`);
console.log(`   Kafka Broker: ${KAFKA_BROKER}`);
console.log(`   Topic: ${KAFKA_TOPIC}`);
console.log(`   Delay: ${DELAY_MS}ms between ticks\n`);

// Initialize Kafka producer
const kafka = new Kafka({
  clientId: 'stock-simulator',
  brokers: [KAFKA_BROKER]
});

const producer = kafka.producer();

let rowCount = 0;
let successCount = 0;
let errorCount = 0;

// Start producer and read CSV
(async () => {
  try {
    await producer.connect();
    console.log(`✅ Connected to Kafka broker: ${KAFKA_BROKER}\n`);

    // Read CSV and send each row as a tick
    const stream = fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', async (row) => {
        stream.pause();  // Pause stream to control flow
        rowCount++;
        
        // Map CSV columns to your tick format
        // Supports common column names: Date/date/timestamp, Close/close/price, Volume/volume
        const tick = {
          symbol: SYMBOL,
          price: parseFloat(row.Close) || parseFloat(row.close) || parseFloat(row.Price) || parseFloat(row.price) || 0,
          volume: parseInt(row.Volume) || parseInt(row.volume) || 1000,
          timestamp: row.Date || row.date || row.Timestamp || row.timestamp || new Date().toISOString()
        };
        
        // Validate tick data
        if (!tick.price || tick.price === 0) {
          console.warn(`⚠️  Row ${rowCount}: Skipped (no price data)`);
          stream.resume();
          return;
        }

        try {
          await producer.send({
            topic: KAFKA_TOPIC,
            messages: [
              {
                key: tick.symbol,
                value: JSON.stringify(tick),
                timestamp: Date.now().toString()
              }
            ]
          });
          successCount++;
          if (successCount % 10 === 0) {
            console.log(`✅ Sent ${successCount} ticks: ${tick.symbol} @ $${tick.price.toFixed(2)} | Volume: ${tick.volume}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Row ${rowCount} Failed: ${error.message}`);
        }
        
        // Wait before sending next tick
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        stream.resume();
      })
      .on('end', async () => {
        console.log(`\n📊 CSV playback complete!`);
        console.log(`   Total rows: ${rowCount}`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        
        await producer.disconnect();
        console.log(`\n✅ Disconnected from Kafka`);
        process.exit(0);
      })
      .on('error', (error) => {
        console.error(`❌ Error reading CSV: ${error.message}`);
        producer.disconnect();
        process.exit(1);
      });
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
})();
