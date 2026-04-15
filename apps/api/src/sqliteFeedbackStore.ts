import {
  buildFeedbackAggregate,
  FeedbackAggregate,
  FeedbackRecord,
  FeedbackStore,
  ScoreWeights
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

export interface LearningSummary {
  profileId: string;
  feedbackCount: number;
  lastDerivedAt: string | null;
  currentWeights: ScoreWeights;
  pendingCandidates: number;
  divergenceAlert: boolean;
}

export interface WeightVersion {
  version: number;
  weights: ScoreWeights;
  derivedFromHash: string | null;
  createdAt: string;
  status: 'candidate' | 'active' | 'archived';
}

export interface LearningAwareFeedbackStore extends FeedbackStore {
  getLearningSummary(profileId: string): LearningSummary;
  listWeightVersions(profileId: string, status?: 'candidate' | 'active' | 'archived'): WeightVersion[];
}

const SCHEMA_VERSION = 2;

const DDL = `
  CREATE TABLE IF NOT EXISTS feedback_records (
    feedback_id    TEXT PRIMARY KEY,
    bundle_id      TEXT NOT NULL,
    profile_id     TEXT NOT NULL,
    target         TEXT NOT NULL,
    score          INTEGER NOT NULL,
    notes          TEXT,
    accepted_at    TEXT,
    created_at     TEXT NOT NULL,
    record_json    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_records_profile_created
    ON feedback_records(profile_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_feedback_records_bundle_created
    ON feedback_records(bundle_id, created_at);

  CREATE TABLE IF NOT EXISTS weight_derivations (
    derivation_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id         TEXT NOT NULL,
    derived_at         TEXT NOT NULL,
    input_record_count INTEGER NOT NULL,
    prior_weights      TEXT,
    new_weights        TEXT NOT NULL,
    weight_changes     TEXT NOT NULL,
    trigger_source     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_weight_derivations_profile
    ON weight_derivations(profile_id, derived_at);

  CREATE TABLE IF NOT EXISTS weight_versions (
    profile_id         TEXT NOT NULL,
    version            INTEGER NOT NULL,
    weights            TEXT NOT NULL,
    derived_from_hash  TEXT,
    created_at         TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'candidate',
    PRIMARY KEY (profile_id, version)
  );

  CREATE INDEX IF NOT EXISTS idx_weight_versions_profile_status
    ON weight_versions(profile_id, status);
`;

const DEFAULT_WEIGHTS: ScoreWeights = {
  clarity: 1,
  specificity: 1,
  styleConsistency: 1,
  targetReadiness: 1
};

function parseScoreWeights(input: unknown): ScoreWeights | null {
  if (typeof input !== 'string' || input.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(input) as Partial<ScoreWeights>;
    if (
      typeof parsed.clarity === 'number' &&
      typeof parsed.specificity === 'number' &&
      typeof parsed.styleConsistency === 'number' &&
      typeof parsed.targetReadiness === 'number'
    ) {
      return {
        clarity: parsed.clarity,
        specificity: parsed.specificity,
        styleConsistency: parsed.styleConsistency,
        targetReadiness: parsed.targetReadiness
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseFeedbackRecord(row: Record<string, unknown>): FeedbackRecord | undefined {
  const recordJson = row['record_json'];
  if (typeof recordJson !== 'string' || recordJson.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(recordJson) as FeedbackRecord;
    if (!parsed.feedbackId || !parsed.bundleId || !parsed.profileId || !parsed.target || typeof parsed.score !== 'number' || !parsed.createdAt) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function computeWeightChanges(prior: ScoreWeights | null, next: ScoreWeights): Record<string, number> {
  return {
    clarity: Number((next.clarity - (prior?.clarity ?? DEFAULT_WEIGHTS.clarity)).toFixed(4)),
    specificity: Number((next.specificity - (prior?.specificity ?? DEFAULT_WEIGHTS.specificity)).toFixed(4)),
    styleConsistency: Number((next.styleConsistency - (prior?.styleConsistency ?? DEFAULT_WEIGHTS.styleConsistency)).toFixed(4)),
    targetReadiness: Number((next.targetReadiness - (prior?.targetReadiness ?? DEFAULT_WEIGHTS.targetReadiness)).toFixed(4))
  };
}

export function createSqliteFeedbackStore(dbPath: string): LearningAwareFeedbackStore & { close(): void } {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  if (!versionRow || versionRow.user_version !== SCHEMA_VERSION) {
    throw new Error(`Feedback schema version mismatch: expected ${SCHEMA_VERSION}, got ${versionRow?.user_version ?? 'unknown'}`);
  }

  const stmtInsertFeedback = db.prepare(`
    INSERT OR REPLACE INTO feedback_records (
      feedback_id, bundle_id, profile_id, target, score, notes, accepted_at, created_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtByProfile = db.prepare(`
    SELECT record_json
    FROM feedback_records
    WHERE profile_id = ?
    ORDER BY created_at ASC
  `);

  const stmtByBundle = db.prepare(`
    SELECT record_json
    FROM feedback_records
    WHERE bundle_id = ?
    ORDER BY created_at ASC
  `);

  const stmtCountProfile = db.prepare(`
    SELECT COUNT(*) AS count
    FROM feedback_records
    WHERE profile_id = ?
  `);

  const stmtLatestDerivation = db.prepare(`
    SELECT derived_at, new_weights
    FROM weight_derivations
    WHERE profile_id = ?
    ORDER BY derived_at DESC
    LIMIT 1
  `);

  const stmtInsertDerivation = db.prepare(`
    INSERT INTO weight_derivations (
      profile_id,
      derived_at,
      input_record_count,
      prior_weights,
      new_weights,
      weight_changes,
      trigger_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtInsertWeightVersion = db.prepare(`
    INSERT OR REPLACE INTO weight_versions (
      profile_id,
      version,
      weights,
      derived_from_hash,
      created_at,
      status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const stmtListWeightVersions = db.prepare(`
    SELECT version, weights, derived_from_hash, created_at, status
    FROM weight_versions
    WHERE profile_id = ?
    ORDER BY version DESC
  `);

  const stmtListWeightVersionsByStatus = db.prepare(`
    SELECT version, weights, derived_from_hash, created_at, status
    FROM weight_versions
    WHERE profile_id = ? AND status = ?
    ORDER BY version DESC
  `);

  const saveDerivationAudit = (profileId: string, aggregate: FeedbackAggregate, triggerSource: string): void => {
    const latest = stmtLatestDerivation.get(profileId);
    const priorWeights = latest ? parseScoreWeights(latest['new_weights']) : null;
    const changes = computeWeightChanges(priorWeights, aggregate.derivedWeights);
    const derivedAt = new Date().toISOString();

    stmtInsertDerivation.run(
      profileId,
      derivedAt,
      aggregate.totalRecords,
      priorWeights ? JSON.stringify(priorWeights) : null,
      JSON.stringify(aggregate.derivedWeights),
      JSON.stringify(changes),
      triggerSource
    );
  };

  const aggregateForProfile = (profileId: string, triggerSource: string): FeedbackAggregate => {
    const records = store.getByProfile(profileId);
    const aggregate = buildFeedbackAggregate(profileId, records);
    saveDerivationAudit(profileId, aggregate, triggerSource);
    return aggregate;
  };

  const store: LearningAwareFeedbackStore & { close(): void } = {
    save(record: FeedbackRecord): FeedbackRecord {
      stmtInsertFeedback.run(
        record.feedbackId,
        record.bundleId,
        record.profileId,
        record.target,
        record.score,
        record.notes ?? null,
        record.acceptedAt ?? null,
        record.createdAt,
        JSON.stringify(record)
      );
      return record;
    },

    getByProfile(profileId: string): FeedbackRecord[] {
      const rows = stmtByProfile.all(profileId);
      const records: FeedbackRecord[] = [];
      for (const row of rows) {
        const parsed = parseFeedbackRecord(row);
        if (parsed) {
          records.push(parsed);
        }
      }
      return records;
    },

    getByBundle(bundleId: string): FeedbackRecord[] {
      const rows = stmtByBundle.all(bundleId);
      const records: FeedbackRecord[] = [];
      for (const row of rows) {
        const parsed = parseFeedbackRecord(row);
        if (parsed) {
          records.push(parsed);
        }
      }
      return records;
    },

    getAggregate(profileId: string): FeedbackAggregate {
      return aggregateForProfile(profileId, 'aggregate-request');
    },

    getLearningSummary(profileId: string): LearningSummary {
      const countRow = stmtCountProfile.get(profileId) as { count?: number } | undefined;
      const aggregate = aggregateForProfile(profileId, 'bootstrap');
      const latest = stmtLatestDerivation.get(profileId);
      const lastDerivedAt = typeof latest?.['derived_at'] === 'string' ? latest['derived_at'] : null;
      return {
        profileId,
        feedbackCount: Number(countRow?.count ?? aggregate.totalRecords),
        lastDerivedAt,
        currentWeights: aggregate.derivedWeights,
        pendingCandidates: 0,
        divergenceAlert: false
      };
    },

    listWeightVersions(profileId: string, status?: 'candidate' | 'active' | 'archived'): WeightVersion[] {
      const rows = status
        ? (stmtListWeightVersionsByStatus.all(profileId, status) as Record<string, unknown>[])
        : (stmtListWeightVersions.all(profileId) as Record<string, unknown>[]);

      const versions: WeightVersion[] = [];
      for (const row of rows) {
        const version = Number(row['version']);
        const weightsStr = row['weights'];
        const status_value = row['status'];

        if (typeof weightsStr === 'string' && typeof status_value === 'string') {
          const weights = parseScoreWeights(weightsStr);
          if (weights) {
            versions.push({
              version,
              weights,
              derivedFromHash: typeof row['derived_from_hash'] === 'string' ? row['derived_from_hash'] : null,
              createdAt: typeof row['created_at'] === 'string' ? row['created_at'] : new Date().toISOString(),
              status: status_value as 'candidate' | 'active' | 'archived'
            });
          }
        }
      }
      return versions;
    },

    close(): void {
      db.close();
    }
  };

  return store;
}
