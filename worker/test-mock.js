const priceHistory = {};

function calculateMovingAverage(symbol, price) {
  if (!priceHistory[symbol]) {
    priceHistory[symbol] = [];
  }

  priceHistory[symbol].push(price);

  if (priceHistory[symbol].length > 5) {
    priceHistory[symbol].shift();
  }

  const sum = priceHistory[symbol].reduce((accumulator, value) => accumulator + value, 0);
  return Math.round((sum / priceHistory[symbol].length) * 100) / 100;
}

function calculateVolatility(symbol, price) {
  if (!priceHistory[symbol] || priceHistory[symbol].length < 2) {
    return 0;
  }

  const prices = priceHistory[symbol];
  let totalChange = 0;

  for (let index = 1; index < prices.length; index++) {
    totalChange += Math.abs((prices[index] - prices[index - 1]) / prices[index - 1]) * 100;
  }

  return Math.round((totalChange / (prices.length - 1)) * 100) / 100;
}

function detectAnomaly(symbol, price) {
  if (!priceHistory[symbol] || priceHistory[symbol].length < 3) {
    return false;
  }

  const recentPrices = priceHistory[symbol].slice(-3);
  const averagePrice = recentPrices.reduce((accumulator, value) => accumulator + value, 0) / recentPrices.length;
  const changePercent = Math.abs((price - averagePrice) / averagePrice) * 100;

  return changePercent > 3;
}

const testPrices = [175.0, 175.5, 176.0, 175.75, 176.25, 180.0];

testPrices.forEach((price, index) => {
  const symbol = 'AAPL';
  const movingAverage = calculateMovingAverage(symbol, price);
  const volatility = calculateVolatility(symbol, price);
  const anomaly = detectAnomaly(symbol, price);
  const marker = anomaly ? ' ⚠️ ANOMALY!' : '';

  console.log(`Tick ${index + 1}: $${price} | MA: $${movingAverage} | Vol: ${volatility}%${marker}`);
});