import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { onValue, ref } from "firebase/database";
import { db, rtdb } from "./firebase";

const HISTORY_LIMIT = 40;
const TABLE_LIMIT = 20;

const CHART_COLORS = {
  tickRate: "#2ad8ff",
  queueDepth: "#ff9f4a",
  prediction: "#76f3a8",
  workers: "#ff6b6b",
  price: "#007cbf",
};

const COMPANY_LABELS = {
  AAPL: "Apple",
  GOLD: "Gold",
  BOD: "Botswana Diamonds",
  ENGBW: "Engen Botswana",
  FNBB: "First National Bank Botswana",
};

function formatTime(value) {
  if (!value) {
    return "-";
  }

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleTimeString();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "-";
    }

    return parsed.toLocaleTimeString();
  } catch {
    return "-";
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimestamp(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pushHistory(items, point) {
  return [...items.slice(-(HISTORY_LIMIT - 1)), point];
}

function SparklineCard({ title, points, color, unit }) {
  const width = 320;
  const height = 120;

  const coordinates = useMemo(() => {
    if (!points.length) {
      return "";
    }

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 1);

    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * (width - 8) + 4;
        const y =
          height - 10 - ((point.value - min) / spread) * (height - 20);
        return `${x},${y}`;
      })
      .join(" ");
  }, [points]);

  const latest = points.at(-1)?.value ?? 0;

  return (
    <article className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
        <p>
          {latest.toFixed(1)}
          {unit}
        </p>
      </div>
      {points.length < 2 ? (
        <div className="chart-empty">Waiting for enough data points...</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" role="img">
          <polyline points={coordinates} fill="none" stroke={color} strokeWidth="3" />
        </svg>
      )}
      <small>Last {HISTORY_LIMIT} samples</small>
    </article>
  );
}

function statusClass(state) {
  if (state === "online") return "online";
  if (state === "warning") return "warning";
  return "offline";
}

function formatEventIcon(type) {
  if (type === "SCALE_UP") return "⬆";
  if (type === "SCALE_DOWN") return "⬇";
  if (type === "WARNING") return "⚠";
  return "•";
}

function App() {
  const [ticks, setTicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({
    queue_depth: 0,
    worker_count: 2,
    tick_rate: 0,
  });
  const [prediction, setPrediction] = useState({
    predicted_load: 0,
    confidence: 0,
    suggested_workers: 2,
  });
  const [scalingEvents, setScalingEvents] = useState([]);
  const [decisionEvents, setDecisionEvents] = useState([
    {
      id: "boot",
      type: "INFO",
      message: "Dashboard connected and waiting for live stream",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chartSeries, setChartSeries] = useState({
    tickRate: [],
    queueDepth: [],
    predictedLoad: [],
    workerCount: [],
  });
  const [sortKey, setSortKey] = useState("processed_at");
  const [sortDirection, setSortDirection] = useState("desc");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [showOnlyAnomalies, setShowOnlyAnomalies] = useState(false);
  const [selectedTick, setSelectedTick] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [serviceHeartbeat, setServiceHeartbeat] = useState({
    kafka: 0,
    workers: 0,
    ai: 0,
    firebase: 0,
  });
  const [demoLoadRunning, setDemoLoadRunning] = useState(false);
  const [selectedCompanySymbol, setSelectedCompanySymbol] = useState("AAPL");

  const demoTimerRef = useRef(null);
  const previousPredictionRef = useRef(0);
  const previousWorkerCountRef = useRef(0);
  const previousQueueDepthRef = useRef(0);

  const stats = useMemo(() => {
    const totalTicks = ticks.slice(0, TABLE_LIMIT).length;
    const anomalies = ticks.filter((tick) => tick.analytics?.is_anomaly).length;
    const avgVolatility =
      totalTicks > 0
        ? (
            ticks.slice(0, TABLE_LIMIT).reduce(
              (sum, tick) => sum + toNumber(tick.analytics?.volatility_percent),
              0,
            ) / totalTicks
          ).toFixed(2)
        : "0.00";

    const averageLatencyMs =
      totalTicks > 0
        ? Math.round(
            ticks.slice(0, TABLE_LIMIT).reduce((sum, tick) => {
              const processed = parseTimestamp(tick.processed_at);
              const original = parseTimestamp(tick.original_timestamp);
              if (!processed || !original) {
                return sum;
              }
              return sum + Math.max(processed - original, 0);
            }, 0) / totalTicks,
          )
        : 0;

    const successRate = totalTicks > 0 ? (((totalTicks - anomalies) / totalTicks) * 100).toFixed(1) : "100.0";

    return {
      totalTicks,
      anomalies,
      avgVolatility,
      averageLatencyMs,
      successRate,
    };
  }, [ticks]);

  const aiTrend = useMemo(() => {
    const points = chartSeries.predictedLoad;
    if (points.length < 2) {
      return "Stable";
    }

    const current = points.at(-1)?.value ?? 0;
    const previous = points.at(-2)?.value ?? 0;
    if (current > previous + 2) return "Increasing";
    if (current < previous - 2) return "Decreasing";
    return "Stable";
  }, [chartSeries.predictedLoad]);

  const aiDecision = useMemo(() => {
    const predictedLoad = toNumber(prediction.predicted_load);
    const suggestedWorkers = toNumber(prediction.suggested_workers, metrics.worker_count);
    const workers = toNumber(metrics.worker_count, 1);

    if (predictedLoad >= 70 || suggestedWorkers > workers) return "Scaling Up";
    if (predictedLoad <= 35 && workers > 1) return "Scaling Down";
    return "No Action";
  }, [metrics.worker_count, prediction.predicted_load, prediction.suggested_workers]);

  const serviceStatus = useMemo(() => {
    const now = Date.now();
    const fresh = (value) => now - value < 20000;
    return {
      kafka: fresh(serviceHeartbeat.kafka) ? "online" : "offline",
      workers: ticks.length > 0 || fresh(serviceHeartbeat.workers) ? "online" : "warning",
      ai: fresh(serviceHeartbeat.ai) ? "online" : "warning",
      firebase: !error && (ticks.length > 0 || fresh(serviceHeartbeat.firebase)) ? "online" : "warning",
    };
  }, [error, serviceHeartbeat, ticks.length]);

  const mergedTimeline = useMemo(() => {
    const fromScaling = scalingEvents.map((event, index) => {
      const action = event.action || event.type || "UPDATE";
      const delta = event.workerCount ?? event.count ?? 0;
      const total = event.newTotal ?? event.totalWorkers ?? metrics.worker_count;

      return {
        id: event.id || `scale-${index}`,
        type: action,
        timestamp: event.timestamp || new Date().toISOString(),
        message: `${action}: ${delta >= 0 ? "+" : ""}${delta} worker(s), total ${total}`,
      };
    });

    return [...fromScaling, ...decisionEvents]
      .sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp))
      .slice(0, 25);
  }, [decisionEvents, metrics.worker_count, scalingEvents]);

  const availableSymbols = useMemo(() => {
    const symbols = new Set(ticks.map((tick) => String(tick.symbol || "").toUpperCase()).filter(Boolean));

    ["AAPL", "GOLD", "BOD", "ENGBW", "FNBB"].forEach((symbol) => symbols.add(symbol));

    return [...symbols].sort((left, right) => {
      const leftLabel = COMPANY_LABELS[left] || left;
      const rightLabel = COMPANY_LABELS[right] || right;
      return leftLabel.localeCompare(rightLabel);
    });
  }, [ticks]);

  const selectedCompanyPoints = useMemo(() => {
    const symbol = selectedCompanySymbol.toUpperCase();

    const points = ticks
      .filter((tick) => String(tick.symbol || "").toUpperCase() === symbol)
      .sort((left, right) => parseTimestamp(left.processed_at) - parseTimestamp(right.processed_at))
      .slice(-HISTORY_LIMIT)
      .map((tick) => ({
        timestamp: parseTimestamp(tick.processed_at),
        value: toNumber(tick.price),
      }))
      .filter((point) => point.value > 0);

    return points;
  }, [selectedCompanySymbol, ticks]);

  const selectedCompanyMovement = useMemo(() => {
    const points = selectedCompanyPoints;
    if (points.length < 2) {
      return {
        latestPrice: points.at(-1)?.value ?? 0,
        delta: 0,
        deltaPercent: 0,
      };
    }

    const first = points[0].value;
    const latest = points.at(-1)?.value ?? 0;
    const delta = latest - first;
    const deltaPercent = first > 0 ? (delta / first) * 100 : 0;

    return {
      latestPrice: latest,
      delta,
      deltaPercent,
    };
  }, [selectedCompanyPoints]);

  const tableRows = useMemo(() => {
    const normalizedFilter = symbolFilter.trim().toLowerCase();
    const filtered = ticks.filter((tick) => {
      const matchSymbol = normalizedFilter
        ? (tick.symbol || "").toLowerCase().includes(normalizedFilter)
        : true;
      const matchAnomaly = showOnlyAnomalies ? Boolean(tick.analytics?.is_anomaly) : true;
      return matchSymbol && matchAnomaly;
    });

    const sorted = [...filtered].sort((left, right) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "price") {
        return (toNumber(left.price) - toNumber(right.price)) * direction;
      }

      if (sortKey === "volatility") {
        return (
          (toNumber(left.analytics?.volatility_percent) -
            toNumber(right.analytics?.volatility_percent)) * direction
        );
      }

      if (sortKey === "symbol") {
        return (left.symbol || "").localeCompare(right.symbol || "") * direction;
      }

      return (parseTimestamp(left.processed_at) - parseTimestamp(right.processed_at)) * direction;
    });

    return sorted.slice(0, TABLE_LIMIT);
  }, [showOnlyAnomalies, sortDirection, sortKey, symbolFilter, ticks]);

  useEffect(() => {
    if (!availableSymbols.length) {
      return;
    }

    if (!availableSymbols.includes(selectedCompanySymbol)) {
      setSelectedCompanySymbol(availableSymbols[0]);
    }
  }, [availableSymbols, selectedCompanySymbol]);

  function appendDecisionEvent(type, message) {
    const newEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type,
      message,
      timestamp: new Date().toISOString(),
    };

    setDecisionEvents((prev) => [newEvent, ...prev].slice(0, 30));
  }

  function pushAlert(type, message) {
    const newAlert = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    setAlerts((prev) => [newAlert, ...prev].slice(0, 6));
  }

  function makeDemoTick(overrides = {}) {
    return {
      symbol: overrides.symbol || "AAPL",
      price: toNumber(overrides.price, 170 + Math.random() * 15),
      volume: Math.round(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString(),
    };
  }

  async function sendTick(tick) {
    try {
      await fetch("http://localhost:8000/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key-123",
        },
        body: JSON.stringify(tick),
      });
    } catch {
      pushAlert("WARNING", "Ingestion endpoint not reachable on localhost:8000");
    }
  }

  async function startLoadTest() {
    try {
      const response = await fetch("http://localhost:8000/api/load-test/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rate: 100,
          symbols: ["AAPL", "GOLD", "BOD", "ENGBW", "FNBB"],
        }),
      });

      if (!response.ok) {
        throw new Error(`Load test start failed (${response.status})`);
      }

      const payload = await response.json();
      setDemoLoadRunning(true);
      appendDecisionEvent(
        "INFO",
        `Load test started at ${payload.rate || 100} ticks/sec`,
      );
    } catch (loadError) {
      pushAlert("WARNING", "Unable to start load test on localhost:8000");
      appendDecisionEvent("WARNING", `Load test start failed: ${loadError.message}`);
    }
  }

  async function stopLoadTest() {
    try {
      await fetch("http://localhost:8000/api/load-test/stop", {
        method: "POST",
      });
    } catch {
      // Ignore stop errors and still reset UI state.
    }

    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }

    setDemoLoadRunning(false);
    appendDecisionEvent("INFO", "Load test stopped");
  }

  function simulateSpike() {
    appendDecisionEvent("WARNING", "Simulated traffic spike pushed to ingestion API");
    for (let i = 0; i < 8; i += 1) {
      sendTick(makeDemoTick({ price: 185 + Math.random() * 8, symbol: "TSLA" }));
    }
  }

  function resetDashboardView() {
    setChartSeries({
      tickRate: [],
      queueDepth: [],
      predictedLoad: [],
      workerCount: [],
    });
    setAlerts([]);
    setDecisionEvents([
      {
        id: "reset",
        type: "INFO",
        message: "Dashboard view reset",
        timestamp: new Date().toISOString(),
      },
    ]);
    setSelectedTick(null);
    setSymbolFilter("");
    setShowOnlyAnomalies(false);
  }

  useEffect(() => {
    const ticksQuery = query(
      collection(db, "processed_ticks"),
      orderBy("processed_at", "desc"),
      limit(120),
    );

    const unsubscribeTicks = onSnapshot(
      ticksQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setTicks(rows);
        setLoading(false);
        setError(null);
        setServiceHeartbeat((prev) => ({
          ...prev,
          firebase: Date.now(),
          workers: Date.now(),
        }));
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      },
    );

    const unsubscribeMetrics = onValue(ref(rtdb, "system/metrics"), (snap) => {
      const value = snap.val();
      if (value) {
        setMetrics((prev) => ({
          ...prev,
          ...value,
        }));
        setServiceHeartbeat((prev) => ({
          ...prev,
          kafka: Date.now(),
          workers: Date.now(),
        }));
      }
    });

    const unsubscribePrediction = onValue(
      ref(rtdb, "system/prediction"),
      (snap) => {
        const value = snap.val();
        if (value) {
          setPrediction((prev) => ({
            ...prev,
            ...value,
          }));
          setServiceHeartbeat((prev) => ({
            ...prev,
            ai: Date.now(),
          }));
        }
      },
    );

    const unsubscribeScaling = onValue(
      ref(rtdb, "system/scaling_events"),
      (snap) => {
        const value = snap.val();
        if (!value) {
          setScalingEvents([]);
          return;
        }

        const normalized = Array.isArray(value)
          ? value.filter(Boolean)
          : Object.entries(value).map(([id, payload]) => ({ id, ...payload }));

        normalized.sort(
          (a, b) =>
            new Date(b.timestamp || 0).getTime() -
            new Date(a.timestamp || 0).getTime(),
        );

        setScalingEvents(normalized.slice(0, 20));
      },
    );

    return () => {
      unsubscribeTicks();
      unsubscribeMetrics();
      unsubscribePrediction();
      unsubscribeScaling();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshHealth = async () => {
      const endpoints = [
        { key: "kafka", url: "http://localhost:8000/health" },
        { key: "ai", url: "http://localhost:8001/health" },
      ];

      await Promise.all(
        endpoints.map(async ({ key, url }) => {
          try {
            const response = await fetch(url, { cache: "no-store" });
            if (!cancelled && response.ok) {
              setServiceHeartbeat((prev) => ({
                ...prev,
                [key]: Date.now(),
              }));
            }
          } catch {
            // Keep the last known good state so transient network blips do not
            // immediately flip the badge offline.
          }
        }),
      );
    };

    refreshHealth();
    const intervalId = setInterval(refreshHealth, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshIngestionMetrics = async () => {
      try {
        const response = await fetch("http://localhost:8000/metrics", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        const ingestionTickRate = toNumber(payload.tickRatePerSecond, 0);
        if (!cancelled && ingestionTickRate > 0) {
          setMetrics((prev) => ({
            ...prev,
            tick_rate: Math.max(toNumber(prev.tick_rate, 0), ingestionTickRate),
          }));
        }
      } catch {
        // Ignore transient polling failures.
      }
    };

    const refreshLoadTestStatus = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/load-test/status", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setDemoLoadRunning(Boolean(payload.running));
          const actualTps = toNumber(payload.actual_tps, 0);
          if (actualTps > 0) {
            setMetrics((prev) => ({
              ...prev,
              tick_rate: Math.max(toNumber(prev.tick_rate, 0), actualTps),
            }));
          }
        }
      } catch {
        // Keep current UI state if status endpoint is temporarily unreachable.
      }
    };

    refreshIngestionMetrics();
    refreshLoadTestStatus();
    const metricsIntervalId = setInterval(refreshIngestionMetrics, 3000);
    const intervalId = setInterval(refreshLoadTestStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(metricsIntervalId);
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const queueDepth = toNumber(metrics.queue_depth);
    const tickRate = toNumber(metrics.tick_rate);
    const workerCount = toNumber(metrics.worker_count, 1);
    const predictedLoad = toNumber(prediction.predicted_load);

    setChartSeries((prev) => ({
      tickRate: pushHistory(prev.tickRate, { timestamp: now, value: tickRate }),
      queueDepth: pushHistory(prev.queueDepth, { timestamp: now, value: queueDepth }),
      predictedLoad: pushHistory(prev.predictedLoad, {
        timestamp: now,
        value: predictedLoad,
      }),
      workerCount: pushHistory(prev.workerCount, {
        timestamp: now,
        value: workerCount,
      }),
    }));

    if (queueDepth > 500 && previousQueueDepthRef.current <= 500) {
      pushAlert("WARNING", "Queue backlog increasing above 500");
      appendDecisionEvent("WARNING", `Queue depth warning at ${queueDepth}`);
    }

    if (
      predictedLoad > previousPredictionRef.current + 8 &&
      predictedLoad >= 70
    ) {
      appendDecisionEvent(
        "INFO",
        `AI predicted ${predictedLoad.toFixed(1)}% load. Decision: ${aiDecision}`,
      );
    }

    if (
      workerCount > 0 &&
      previousWorkerCountRef.current > 0 &&
      workerCount !== previousWorkerCountRef.current
    ) {
      const movement = workerCount > previousWorkerCountRef.current ? "SCALE_UP" : "SCALE_DOWN";
      const delta = Math.abs(workerCount - previousWorkerCountRef.current);
      appendDecisionEvent(
        movement,
        `${movement}: ${movement === "SCALE_UP" ? "+" : "-"}${delta} worker(s), total ${workerCount}`,
      );
    }

    previousPredictionRef.current = predictedLoad;
    previousWorkerCountRef.current = workerCount;
    previousQueueDepthRef.current = queueDepth;
  }, [
    aiDecision,
    metrics.queue_depth,
    metrics.tick_rate,
    metrics.worker_count,
    prediction.predicted_load,
  ]);

  useEffect(() => {
    const latest = ticks[0];
    if (!latest) {
      return;
    }

    const volatility = toNumber(latest.analytics?.volatility_percent);
    if (volatility > 2.5) {
      pushAlert("WARNING", `${latest.symbol} volatility high (${volatility.toFixed(2)}%)`);
    }

    if (latest.analytics?.is_anomaly) {
      pushAlert("WARNING", `Anomaly detected for ${latest.symbol}`);
    }
  }, [ticks]);

  function setSort(column) {
    if (sortKey === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection("desc");
  }

  function volatilityClass(value) {
    if (value >= 2.5) return "high";
    if (value >= 1.4) return "mid";
    return "low";
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="dashboard">
      <header className="hero">
        <div className="hero-copy">
          <h1>MarketVision Dashboard</h1>
          <p>
            Ingestion to autoscaling observability: spike, prediction, scaling,
            recovery.
          </p>
        </div>
        <div className="top-actions">
          <button type="button" className="refresh" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </header>

      <section className="status-row">
        <div className={`status-pill ${statusClass(serviceStatus.kafka)}`}>
          <span className="status-dot" /> Kafka: {serviceStatus.kafka}
        </div>
        <div className={`status-pill ${statusClass(serviceStatus.workers)}`}>
          <span className="status-dot" /> Workers: {serviceStatus.workers}
        </div>
        <div className={`status-pill ${statusClass(serviceStatus.ai)}`}>
          <span className="status-dot" /> AI Engine: {serviceStatus.ai}
        </div>
        <div className={`status-pill ${statusClass(serviceStatus.firebase)}`}>
          <span className="status-dot" /> Firebase: {serviceStatus.firebase}
        </div>
      </section>

      <section className="controls-panel">
        <h2>Demo Mode Controls</h2>
        <div className="control-buttons">
          <button type="button" onClick={startLoadTest} disabled={demoLoadRunning}>
            Start Load Test
          </button>
          <button type="button" onClick={stopLoadTest} disabled={!demoLoadRunning}>
            Stop Load Test
          </button>
          <button type="button" onClick={simulateSpike}>Simulate Spike</button>
          <button type="button" onClick={resetDashboardView}>Reset View</button>
        </div>
      </section>

      {!!alerts.length && (
        <section className="alerts-panel">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert ${alert.type?.toLowerCase()}`}>
              <span>{formatEventIcon("WARNING")}</span>
              <p>{alert.message}</p>
              <small>{formatTime(alert.timestamp)}</small>
            </div>
          ))}
        </section>
      )}

      <section className="stats-grid emphasis-grid">
        <article className={`stat-card heat ${toNumber(metrics.queue_depth) > 500 ? "danger-heat" : ""}`}>
          <h2>Queue Depth</h2>
          <p className="stat-value primary">{toNumber(metrics.queue_depth)}</p>
        </article>
        <article className={`stat-card heat ${toNumber(metrics.worker_count) > 8 ? "warn-heat" : ""}`}>
          <h2>Worker Count</h2>
          <p className="stat-value primary">{toNumber(metrics.worker_count, 2)}</p>
        </article>
        <article className="stat-card">
          <h2>Predicted Load</h2>
          <p className="stat-value">{toNumber(prediction.predicted_load).toFixed(1)}%</p>
        </article>
        <article className="stat-card">
          <h2>Tick Rate / sec</h2>
          <p className="stat-value">{toNumber(metrics.tick_rate).toFixed(1)}</p>
        </article>
      </section>

      <section className="stats-grid secondary">
        <article className="stat-card">
          <h2>Total Ticks ({TABLE_LIMIT} max)</h2>
          <p className="stat-value">{stats.totalTicks}</p>
        </article>
        <article className="stat-card">
          <h2>Anomalies</h2>
          <p className="stat-value danger">{stats.anomalies}</p>
        </article>
        <article className="stat-card">
          <h2>Avg Volatility</h2>
          <p className="stat-value">{stats.avgVolatility}%</p>
        </article>
        <article className="stat-card">
          <h2>Success Rate</h2>
          <p className="stat-value">{stats.successRate}%</p>
        </article>
      </section>

      <section className="graphs-grid">
        <SparklineCard
          title="Tick Rate Trend"
          points={chartSeries.tickRate}
          color={CHART_COLORS.tickRate}
          unit="/s"
        />
        <SparklineCard
          title="Queue Depth Trend"
          points={chartSeries.queueDepth}
          color={CHART_COLORS.queueDepth}
          unit=""
        />
        <SparklineCard
          title="AI Predicted Load"
          points={chartSeries.predictedLoad}
          color={CHART_COLORS.prediction}
          unit="%"
        />
        <SparklineCard
          title="Worker Count Trend"
          points={chartSeries.workerCount}
          color={CHART_COLORS.workers}
          unit=""
        />
      </section>

      <section className="panel company-movement-panel">
        <div className="company-movement-header">
          <h3>Company Price Movement</h3>
          <label className="company-picker">
            <span>Company</span>
            <select
              value={selectedCompanySymbol}
              onChange={(event) => setSelectedCompanySymbol(event.target.value)}
            >
              {availableSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {COMPANY_LABELS[symbol] || symbol} ({symbol})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="company-movement-stats">
          <p>
            Latest: <strong>${selectedCompanyMovement.latestPrice.toFixed(2)}</strong>
          </p>
          <p className={selectedCompanyMovement.delta >= 0 ? "movement-up" : "movement-down"}>
            Movement: {selectedCompanyMovement.delta >= 0 ? "+" : ""}
            {selectedCompanyMovement.delta.toFixed(2)} ({selectedCompanyMovement.deltaPercent.toFixed(2)}%)
          </p>
        </div>

        <SparklineCard
          title={`${COMPANY_LABELS[selectedCompanySymbol] || selectedCompanySymbol} (${selectedCompanySymbol})`}
          points={selectedCompanyPoints}
          color={CHART_COLORS.price}
          unit=""
        />
      </section>

      <section className="system-flow panel">
        <h3>System Flow</h3>
        <div className="flow-grid">
          <div className="flow-node">
            <h4>Ingestion API</h4>
            <p>Incoming ticks/sec: {toNumber(metrics.tick_rate).toFixed(1)}</p>
          </div>
          <div className="flow-link" />
          <div className="flow-node">
            <h4>Kafka Queue</h4>
            <p>Queue depth: {toNumber(metrics.queue_depth)}</p>
          </div>
          <div className="flow-link" />
          <div className="flow-node">
            <h4>Workers</h4>
            <p>Workers active: {toNumber(metrics.worker_count, 2)}</p>
          </div>
          <div className="flow-link" />
          <div className="flow-node">
            <h4>Firebase</h4>
            <p>Collection: processed_ticks</p>
          </div>
          <div className="flow-link" />
          <div className="flow-node">
            <h4>Dashboard</h4>
            <p>Live sync: active</p>
          </div>
        </div>
      </section>

      <section className="panel ai-decision-panel">
        <h3>AI Decision Panel</h3>
        <div className="decision-grid">
          <div>
            <span>Predicted load</span>
            <p>{toNumber(prediction.predicted_load).toFixed(1)}%</p>
          </div>
          <div>
            <span>Trend</span>
            <p>{aiTrend}</p>
          </div>
          <div>
            <span>Confidence</span>
            <p>{(toNumber(prediction.confidence) * 100).toFixed(0)}%</p>
          </div>
          <div>
            <span>Decision</span>
            <p className="decision-value">{aiDecision}</p>
          </div>
          <div>
            <span>Suggested workers</span>
            <p>{toNumber(prediction.suggested_workers, metrics.worker_count)}</p>
          </div>
          <div>
            <span>Avg latency</span>
            <p>{stats.averageLatencyMs} ms</p>
          </div>
        </div>
      </section>

      <div className="panel-grid">
        <section className="panel">
          <h3>Processed Ticks</h3>
          <div className="table-controls">
            <input
              value={symbolFilter}
              onChange={(event) => setSymbolFilter(event.target.value)}
              placeholder="Filter by symbol"
            />
            <label>
              <input
                type="checkbox"
                checked={showOnlyAnomalies}
                onChange={(event) => setShowOnlyAnomalies(event.target.checked)}
              />
              Anomalies only
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => setSort("symbol")}>Symbol</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => setSort("price")}>Price</button>
                  </th>
                  <th>Volume</th>
                  <th>Moving Avg</th>
                  <th>
                    <button type="button" onClick={() => setSort("volatility")}>Volatility</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => setSort("processed_at")}>Processed</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((tick) => {
                  const volatility = toNumber(tick.analytics?.volatility_percent);
                  return (
                  <tr
                    key={tick.id}
                    className={`${tick.analytics?.is_anomaly ? "anomaly" : ""} ${selectedTick?.id === tick.id ? "selected" : ""}`}
                    onClick={() => setSelectedTick(tick)}
                  >
                    <td>{tick.symbol || "-"}</td>
                    <td>${toNumber(tick.price).toFixed(2)}</td>
                    <td>{toNumber(tick.volume)}</td>
                    <td>${toNumber(tick.analytics?.moving_average_5s).toFixed(2)}</td>
                    <td className={`volatility ${volatilityClass(volatility)}`}>
                      {volatility.toFixed(2)}%
                    </td>
                    <td>{formatTime(tick.processed_at)}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          {selectedTick && (
            <div className="tick-details">
              <h4>Selected Tick Analytics</h4>
              <p>Symbol: {selectedTick.symbol}</p>
              <p>Tick # {toNumber(selectedTick.analytics?.tick_number)}</p>
              <p>Processing rate: {toNumber(selectedTick.analytics?.processing_rate)} ticks/sec</p>
              <p>Anomaly: {selectedTick.analytics?.is_anomaly ? "Yes" : "No"}</p>
            </div>
          )}
        </section>

        <section className="panel timeline">
          <h3>Auto-scaling Timeline</h3>
          {mergedTimeline.length === 0 ? (
            <p className="empty">No scaling events yet.</p>
          ) : (
            <ul>
              {mergedTimeline.map((event, index) => {
                return (
                  <li key={event.id || `event-${index}`}>
                    <span className={`dot ${String(event.type || "info").toLowerCase()}`} />
                    <div>
                      <p>
                        <strong>{formatEventIcon(event.type)}</strong> {event.message}
                      </p>
                      <small>{formatTime(event.timestamp)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
