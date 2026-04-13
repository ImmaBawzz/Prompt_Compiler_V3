import {
  buildUsageAccountSummary,
  EntitlementKey,
  isEntitlementKey,
  UsageAccountSummary,
  UsageLedgerStore,
  UsageMeteringEvent,
  UsageMeteringEventFilter
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
  CREATE TABLE IF NOT EXISTS usage_metering_events (
    event_id        TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL,
    workspace_id    TEXT,
    domain          TEXT NOT NULL,
    action          TEXT NOT NULL,
    units_consumed  REAL NOT NULL,
    unit            TEXT NOT NULL,
    bundle_id       TEXT,
    profile_id      TEXT,
    listing_id      TEXT,
    plan            TEXT,
    mode            TEXT,
    entitlements    TEXT,
    occurred_at     TEXT NOT NULL,
    metadata        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_usage_metering_events_account
    ON usage_metering_events(account_id, occurred_at);

  CREATE INDEX IF NOT EXISTS idx_usage_metering_events_workspace
    ON usage_metering_events(account_id, workspace_id, occurred_at);
`;

function parseJsonObject(input: unknown): Record<string, string | number | boolean> | undefined {
  if (typeof input !== 'string' || input.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const asRecord = parsed as Record<string, unknown>;
      const normalized: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(asRecord)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          normalized[key] = value;
        }
      }
      return normalized;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseJsonStringArray(input: unknown): EntitlementKey[] | undefined {
  if (typeof input !== 'string' || input.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(input) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string' && isEntitlementKey(item))) {
      return parsed as EntitlementKey[];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function rowToEvent(row: Record<string, unknown>): UsageMeteringEvent | undefined {
  const eventId = row['event_id'];
  const accountId = row['account_id'];
  const domain = row['domain'];
  const action = row['action'];
  const unitsConsumed = row['units_consumed'];
  const unit = row['unit'];
  const occurredAt = row['occurred_at'];

  if (
    typeof eventId !== 'string' ||
    typeof accountId !== 'string' ||
    typeof domain !== 'string' ||
    typeof action !== 'string' ||
    typeof unit !== 'string' ||
    typeof occurredAt !== 'string'
  ) {
    return undefined;
  }

  const consumed = Number(unitsConsumed);
  if (!Number.isFinite(consumed) || consumed <= 0) {
    return undefined;
  }

  return {
    eventId,
    accountId,
    workspaceId: typeof row['workspace_id'] === 'string' ? row['workspace_id'] : undefined,
    domain: domain as UsageMeteringEvent['domain'],
    action,
    unitsConsumed: consumed,
    unit: unit as UsageMeteringEvent['unit'],
    bundleId: typeof row['bundle_id'] === 'string' ? row['bundle_id'] : undefined,
    profileId: typeof row['profile_id'] === 'string' ? row['profile_id'] : undefined,
    listingId: typeof row['listing_id'] === 'string' ? row['listing_id'] : undefined,
    plan: typeof row['plan'] === 'string' ? (row['plan'] as UsageMeteringEvent['plan']) : undefined,
    mode: typeof row['mode'] === 'string' ? (row['mode'] as UsageMeteringEvent['mode']) : undefined,
    entitlements: parseJsonStringArray(row['entitlements']),
    occurredAt,
    metadata: parseJsonObject(row['metadata'])
  };
}

function buildWhereClause(accountId: string, filter?: UsageMeteringEventFilter): {
  whereSql: string;
  params: unknown[];
} {
  const clauses = ['account_id = ?'];
  const params: unknown[] = [accountId];

  if (filter?.workspaceId) {
    clauses.push('workspace_id = ?');
    params.push(filter.workspaceId);
  }

  if (filter?.domain) {
    clauses.push('domain = ?');
    params.push(filter.domain);
  }

  if (filter?.unit) {
    clauses.push('unit = ?');
    params.push(filter.unit);
  }

  if (filter?.from) {
    clauses.push('occurred_at >= ?');
    params.push(filter.from);
  }

  if (filter?.to) {
    clauses.push('occurred_at <= ?');
    params.push(filter.to);
  }

  return {
    whereSql: clauses.join(' AND '),
    params
  };
}

/**
 * SQLite-backed usage metering ledger.
 *
 * Uses Node.js built-in node:sqlite (Node 22.5+).
 * Pass ':memory:' for ephemeral tests or a file path for durable metering.
 */
export function createSqliteUsageLedgerStore(dbPath: string): UsageLedgerStore & { close(): void } {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  // P29-8: Set and verify schema version.
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  if (!versionRow || versionRow.user_version !== SCHEMA_VERSION) {
    throw new Error(`Usage ledger schema version mismatch: expected ${SCHEMA_VERSION}, got ${versionRow?.user_version ?? 'unknown'}`);
  }

  const stmtAppend = db.prepare(`
    INSERT INTO usage_metering_events (
      event_id, account_id, workspace_id, domain, action, units_consumed, unit,
      bundle_id, profile_id, listing_id, plan, mode, entitlements, occurred_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    append(event: UsageMeteringEvent): UsageMeteringEvent {
      stmtAppend.run(
        event.eventId,
        event.accountId,
        event.workspaceId ?? null,
        event.domain,
        event.action,
        event.unitsConsumed,
        event.unit,
        event.bundleId ?? null,
        event.profileId ?? null,
        event.listingId ?? null,
        event.plan ?? null,
        event.mode ?? null,
        event.entitlements ? JSON.stringify(event.entitlements) : null,
        event.occurredAt,
        event.metadata ? JSON.stringify(event.metadata) : null
      );
      return event;
    },

    listByAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageMeteringEvent[] {
      const { whereSql, params } = buildWhereClause(accountId, filter);
      const statement = db.prepare(`
        SELECT *
        FROM usage_metering_events
        WHERE ${whereSql}
        ORDER BY occurred_at ASC
      `);
      const rows = statement.all(...params);
      const events: UsageMeteringEvent[] = [];
      for (const row of rows) {
        const event = rowToEvent(row);
        if (event) {
          events.push(event);
        }
      }
      return events;
    },

    listByWorkspace(accountId: string, workspaceId: string): UsageMeteringEvent[] {
      return this.listByAccount(accountId, { workspaceId });
    },

    summarizeAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageAccountSummary {
      const events = this.listByAccount(accountId, filter);
      return buildUsageAccountSummary(accountId, events);
    },

    close(): void {
      db.close();
    }
  };
}
