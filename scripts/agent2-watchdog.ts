const https = require('node:https');
const path = require('node:path');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

function getDbPath() {
  return process.env.AGENT2_MEMORY_DB_PATH || path.resolve(process.cwd(), '.agent2', 'agent2-memory.db');
}

function postWebhook(url, payload) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = https.request(
        {
          method: 'POST',
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          headers: {
            'Content-Type': 'application/json'
          }
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', () => resolve(0));
      req.write(JSON.stringify(payload));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

function readLastCycleTimestamp(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent2_cycles (
        cycle_id         TEXT PRIMARY KEY,
        started_at       TEXT NOT NULL,
        completed_at     TEXT NOT NULL,
        dry_run          INTEGER NOT NULL,
        signals_consumed INTEGER NOT NULL,
        actions_planned  INTEGER NOT NULL,
        actions_applied  INTEGER NOT NULL,
        cycle_json       TEXT NOT NULL
      )
    `);

    const row = db
      .prepare(
        `
        SELECT completed_at
        FROM agent2_cycles
        ORDER BY completed_at DESC
        LIMIT 1
      `
      )
      .get();

    return typeof row?.completed_at === 'string' ? row.completed_at : null;
  } finally {
    db.close();
  }
}

async function runWatchdog() {
  const intervalMs = Number(process.env.AGENT2_CYCLE_INTERVAL_MS ?? 20 * 60 * 1000);
  const staleThresholdMs = 2 * intervalMs;
  const dbPath = getDbPath();
  const lastCycleAt = readLastCycleTimestamp(dbPath);

  if (!lastCycleAt) {
    console.log('agent2-watchdog: no cycle recorded yet');
    return;
  }

  const ageMs = Date.now() - new Date(lastCycleAt).getTime();
  const isStale = ageMs > staleThresholdMs;

  if (!isStale) {
    console.log('agent2-watchdog: healthy', JSON.stringify({ lastCycleAt, ageMs, staleThresholdMs }));
    return;
  }

  const payload = {
    source: 'agent2-watchdog',
    level: 'warning',
    message: 'Agent2 cycle is stale',
    lastCycleAt,
    ageMs,
    staleThresholdMs
  };

  console.warn('agent2-watchdog: stale', JSON.stringify(payload));
  const webhook = process.env.AGENT2_ALERT_WEBHOOK_URL;
  if (webhook) {
    const status = await postWebhook(webhook, payload);
    console.log(`agent2-watchdog: webhook status=${status}`);
  }
}

runWatchdog().catch((error) => {
  console.error('agent2-watchdog: failed', error);
  process.exitCode = 1;
});
