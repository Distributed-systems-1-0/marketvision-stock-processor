const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');

const args = process.argv.slice(2);
const INPUT_PATH = args[0] || './data';
const API_URL = args[1] || process.env.INGEST_API_URL || 'http://localhost:8000/ingest';
const API_KEY = args[2] || process.env.API_KEY || 'test-api-key-123';
const DELAY_MS = Number(args[3] || 100);
const LOOP_MODE = args.includes('--loop') || args.includes('-l');

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node simulate-ticks.js [input_path] [api_url] [api_key] [delay_ms] [--loop]');
  console.log('Examples:');
  console.log('  node simulate-ticks.js');
  console.log('  node simulate-ticks.js ./data http://localhost:8000/ingest test-api-key-123 100');
  console.log('  node simulate-ticks.js ./data http://localhost:8000/ingest test-api-key-123 20 --loop');
  process.exit(0);
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`Error: path not found: ${INPUT_PATH}`);
  process.exit(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumeric(value) {
  if (value === undefined || value === null) {
    return NaN;
  }
  const cleaned = String(value).replace(/,/g, '').trim();
  return Number.parseFloat(cleaned);
}

function parsePrice(row) {
  return (
    parseNumeric(row.Close) ||
    parseNumeric(row.close) ||
    parseNumeric(row.Price) ||
    parseNumeric(row.price) ||
    parseNumeric(row.Last) ||
    parseNumeric(row.last) ||
    0
  );
}

function parseVolume(row) {
  return (
    Number.parseInt(String(row.Volume || '').replace(/,/g, ''), 10) ||
    Number.parseInt(String(row.volume || '').replace(/,/g, ''), 10) ||
    Number.parseInt(String(row.Qty || '').replace(/,/g, ''), 10) ||
    Number.parseInt(String(row.qty || '').replace(/,/g, ''), 10) ||
    1000
  );
}

function parseTimestamp(row) {
  const raw =
    row.Date ||
    row.date ||
    row.Timestamp ||
    row.timestamp ||
    row.Datetime ||
    row.datetime;

  if (!raw) {
    return new Date().toISOString();
  }

  const value = String(raw).trim();

  const usDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const month = usDate[1].padStart(2, '0');
    const day = usDate[2].padStart(2, '0');
    const year = usDate[3];
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function getCsvFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    return [inputPath];
  }

  return fs
    .readdirSync(inputPath)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(inputPath, name));
}

function symbolFromFilename(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();

  if (baseName.includes('botswana diamonds')) return 'BOD';
  if (baseName.includes('engen botswana')) return 'ENGBW';
  if (baseName.includes('first national bank botswana')) return 'FNBB';
  if (baseName.includes('gold')) return 'GOLD';
  if (baseName.includes('apple')) return 'AAPL';

  return path.basename(filePath, path.extname(filePath)).toUpperCase();
}

async function loadRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function sendTick(tick) {
  await axios.post(API_URL, tick, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    timeout: 15000,
  });
}

async function run() {
  const csvFiles = getCsvFiles(INPUT_PATH);
  if (!csvFiles.length) {
    console.error(`No CSV files found in ${INPUT_PATH}`);
    process.exit(1);
  }

  let totalRows = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  console.log('Starting CSV playback to Ingestion API');
  console.log(`Input: ${INPUT_PATH}`);
  console.log(`API: ${API_URL}`);
  console.log(`Delay: ${DELAY_MS} ms`);
  console.log(`CSV files: ${csvFiles.length}`);

  let cycle = 0;

  while (true) {
    cycle += 1;
    console.log(`\nCycle ${cycle}${LOOP_MODE ? ' (continuous mode)' : ''}`);

    for (const filePath of csvFiles) {
      const symbol = symbolFromFilename(filePath);
      const rows = await loadRows(filePath);
      console.log(`Processing ${path.basename(filePath)} as symbol ${symbol} (${rows.length} rows)`);

      for (const row of rows) {
        totalRows += 1;
        const tick = {
          symbol,
          price: parsePrice(row),
          volume: parseVolume(row),
          timestamp: parseTimestamp(row),
        };

        if (!tick.price || tick.price <= 0) {
          skipped += 1;
          continue;
        }

        try {
          await sendTick(tick);
          sent += 1;
          if (sent % 25 === 0) {
            console.log(`Sent ${sent} ticks (latest ${tick.symbol} @ ${tick.price.toFixed(2)})`);
          }
        } catch (error) {
          failed += 1;
          const status = error.response?.status;
          const detail = error.response?.data?.detail;
          console.error(`Failed row ${totalRows} (${tick.symbol}): ${status || ''} ${detail || error.message}`);
        }

        if (DELAY_MS > 0) {
          await wait(DELAY_MS);
        }
      }
    }

    if (!LOOP_MODE) {
      break;
    }
  }

  console.log('\nDone');
  console.log(`Total rows: ${totalRows}`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(`Simulator failed: ${error.message}`);
  process.exit(1);
});
