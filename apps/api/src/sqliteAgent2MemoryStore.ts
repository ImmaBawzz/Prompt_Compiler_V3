import {
  Agent2CycleResult,
  AgentAction,
  BehavioralWeight,
  LearningSignal
} from '@prompt-compiler/core';

// node:sqlite is experimental in Node 22/24 — suppress the warning when importing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDb };

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

const SCHEMA_VERSION = 1;

const DDL = `
  CREATE TABLE IF NOT EXISTS agent2_cycles (
    cycle_id         TEXT PRIMARY KEY,
    started_at       TEXT NOT NULL,
    completed_at     TEXT NOT NULL,
    dry_run          INTEGER NOT NULL,
    signals_consumed INTEGER NOT NULL,
    actions_planned  INTEGER NOT NULL,
    actions_applied  INTEGER NOT NULL,
    cycle_json       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_cycles_completed
    ON agent2_cycles(completed_at DESC);

  CREATE TABLE IF NOT EXISTS agent2_learning_signals (
    signal_id      TEXT PRIMARY KEY,
    cycle_id       TEXT NOT NULL,
    signal_type    TEXT NOT NULL,
    signal_source  TEXT NOT NULL,
    signal_outcome TEXT NOT NULL,
    signal_weight  REAL NOT NULL,
    captured_at    TEXT NOT NULL,
    signal_json    TEXT NOT NULL,
    FOREIGN KEY (cycle_id) REFERENCES agent2_cycles(cycle_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_signals_cycle
    ON agent2_learning_signals(cycle_id, captured_at DESC);

  CREATE TABLE IF NOT EXISTS agent2_behavioral_weights (
    dimension      TEXT PRIMARY KEY,
    current_value  REAL NOT NULL,
    candidate_value REAL,
    status         TEXT NOT NULL,
    sample_count   INTEGER NOT NULL,
    updated_at     TEXT NOT NULL,
    weight_json    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent2_adaptations (
    adaptation_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id       TEXT NOT NULL,
    action_type    TEXT NOT NULL,
    target         TEXT NOT NULL,
    confidence     REAL NOT NULL,
    summary        TEXT NOT NULL,
    action_json    TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (cycle_id) REFERENCES agent2_cycles(cycle_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_adaptations_cycle
    ON agent2_adaptations(cycle_id, created_at DESC);
`;

function parseCycle(row: Record<string, unknown>): Agent2CycleResult | undefined {
  const raw = row['cycle_json'];
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as Agent2CycleResult;
  } catch {
    return undefined;
  }
}

export interface Agent2MemoryStore {
  appendCycle(cycle: Agent2CycleResult): Agent2CycleResult;
  listRecentCycles(limit?: number): Agent2CycleResult[];
  appendSignals(cycleId: string, signals: LearningSignal[]): void;
  upsertBehavioralWeights(weights: BehavioralWeight[]): void;
  listBehavioralWeights(): BehavioralWeight[];
  appendAdaptations(cycleId: string, actions: AgentAction[]): void;
  getLastCompletedCycleAt(): string | null;
  close(): void;
}

export function createSqliteAgent2MemoryStore(dbPath: string): Agent2MemoryStore {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  if (!versionRow || versionRow.user_version !== SCHEMA_VERSION) {
    throw new Error(
      `Agent2 memory schema version mismatch: expected ${SCHEMA_VERSION}, got ${versionRow?.user_version ?? 'unknown'}`
    );
  }

  const stmtInsertCycle = db.prepare(`
    INSERT OR REPLACE INTO agent2_cycles (
      cycle_id, started_at, completed_at, dry_run, signals_consumed, actions_planned, actions_applied, cycle_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtListCycles = db.prepare(`
    SELECT cycle_json
    FROM agent2_cycles
    ORDER BY completed_at DESC
    LIMIT ?
  `);

  const stmtInsertSignal = db.prepare(`
    INSERT OR REPLACE INTO agent2_learning_signals (
      signal_id, cycle_id, signal_type, signal_source, signal_outcome, signal_weight, captured_at, signal_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtUpsertWeight = db.prepare(`
    INSERT INTO agent2_behavioral_weights (
      dimension, current_value, candidate_value, status, sample_count, updated_at, weight_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dimension) DO UPDATE SET
      current_value = excluded.current_value,
      candidate_value = excluded.candidate_value,
      status = excluded.status,
      sample_count = excluded.sample_count,
      updated_at = excluded.updated_at,
      weight_json = excluded.weight_json
  `);

  const stmtListWeights = db.prepare(`
    SELECT weight_json
    FROM agent2_behavioral_weights
    ORDER BY dimension ASC
  `);

  const stmtInsertAdaptation = db.prepare(`
    INSERT INTO agent2_adaptations (
      cycle_id, action_type, target, confidence, summary, action_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtLastCycle = db.prepare(`
    SELECT completed_at
    FROM agent2_cycles
    ORDER BY completed_at DESC
    LIMIT 1
  `);

  return {
    appendCycle(cycle: Agent2CycleResult): Agent2CycleResult {
      stmtInsertCycle.run(
        cycle.cycleId,
        cycle.startedAt,
        cycle.completedAt,
        cycle.dryRun ? 1 : 0,
        cycle.signalsConsumed,
        cycle.actionsPlanned,
        cycle.actionsApplied,
        JSON.stringify(cycle)
      );
      return cycle;
    },

    listRecentCycles(limit = 20): Agent2CycleResult[] {
      const rows = stmtListCycles.all(Math.max(1, limit));
      const cycles: Agent2CycleResult[] = [];
      for (const row of rows) {
        const parsed = parseCycle(row);
        if (parsed) {
          cycles.push(parsed);
        }
      }
      return cycles;
    },

    appendSignals(cycleId: string, signals: LearningSignal[]): void {
      for (const signal of signals) {
        stmtInsertSignal.run(
          signal.signalId,
          cycleId,
          signal.type,
          signal.source,
          signal.outcome,
          signal.weight,
          signal.capturedAt,
          JSON.stringify(signal)
        );
      }
    },

    upsertBehavioralWeights(weights: BehavioralWeight[]): void {
      for (const weight of weights) {
        stmtUpsertWeight.run(
          weight.dimension,
          weight.currentValue,
          weight.candidateValue ?? null,
          weight.status,
          weight.sampleCount,
          weight.updatedAt,
          JSON.stringify(weight)
        );
      }
    },

    listBehavioralWeights(): BehavioralWeight[] {
      const rows = stmtListWeights.all();
      const weights: BehavioralWeight[] = [];
      for (const row of rows) {
        const raw = row['weight_json'];
        if (typeof raw !== 'string') {
          continue;
        }
        try {
          weights.push(JSON.parse(raw) as BehavioralWeight);
        } catch {
          continue;
        }
      }
      return weights;
    },

    appendAdaptations(cycleId: string, actions: AgentAction[]): void {
      const now = new Date().toISOString();
      for (const action of actions) {
        stmtInsertAdaptation.run(
          cycleId,
          action.actionType,
          action.target,
          action.confidence,
          action.summary,
          JSON.stringify(action),
          now
        );
      }
    },

    getLastCompletedCycleAt(): string | null {
      const row = stmtLastCycle.get() as { completed_at?: string } | undefined;
      return typeof row?.completed_at === 'string' ? row.completed_at : null;
    },

    close(): void {
      db.close();
    }
  };
}
