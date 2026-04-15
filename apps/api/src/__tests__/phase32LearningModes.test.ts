import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import {
  createFeedbackRecord,
  createInMemoryFeedbackStore,
  createInMemoryUsageLedgerStore
} from '@prompt-compiler/core';
import { createServer } from '../server';
import { createSqliteFeedbackStore } from '../sqliteFeedbackStore';
import { createInMemoryHostedProfileLibraryStore } from '../profileLibraryStore';
import { createSqliteHostedProfileLibraryStore } from '../sqliteProfileLibraryStore';

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
}

// ---------------------------------------------------------------------------
// P32-1: LearningMode persistence
// ---------------------------------------------------------------------------

test('phase32: in-memory store persists learningMode through upsert', () => {
  const store = createInMemoryHostedProfileLibraryStore();
  const doc = store.upsert({
    accountId: 'acct-lm-1',
    profiles: [{ id: 'p1', brandName: 'Brand A', voice: 'bold', learningMode: 'scheduled' }]
  });
  const profile = doc.profiles.find((p) => p.id === 'p1');
  assert.ok(profile, 'profile should exist in returned doc');
  assert.equal((profile as { learningMode?: string }).learningMode, 'scheduled');

  const retrieved = store.list('acct-lm-1');
  assert.equal(retrieved.length, 1);
  const rProfile = retrieved[0].profiles.find((p) => p.id === 'p1');
  assert.ok(rProfile);
  assert.equal((rProfile as { learningMode?: string }).learningMode, 'scheduled');
});

test('phase32: in-memory store defaults learningMode to manual when not set', () => {
  const store = createInMemoryHostedProfileLibraryStore();
  const doc = store.upsert({
    accountId: 'acct-lm-2',
    profiles: [{ id: 'p2', brandName: 'Brand B', voice: 'soft' }]
  });
  const profile = doc.profiles.find((p) => p.id === 'p2');
  assert.ok(profile);
  assert.equal((profile as { learningMode?: string }).learningMode, 'manual');
});

test('phase32: in-memory store preserves existing learningMode on re-upsert without mode field', () => {
  const store = createInMemoryHostedProfileLibraryStore();
  store.upsert({
    accountId: 'acct-lm-3',
    profiles: [{ id: 'p3', brandName: 'Brand C', voice: 'calm', learningMode: 'responsive' }]
  });
  // Re-upsert without learningMode — should preserve 'responsive'
  const updated = store.upsert({
    accountId: 'acct-lm-3',
    profiles: [{ id: 'p3', brandName: 'Brand C Updated', voice: 'calm' }]
  });
  const profile = updated.profiles.find((p) => p.id === 'p3');
  assert.ok(profile);
  assert.equal((profile as { learningMode?: string }).learningMode, 'responsive');
});

test('phase32: in-memory store allows all valid learningMode values', () => {
  const store = createInMemoryHostedProfileLibraryStore();
  const modes = ['manual', 'manual-review', 'scheduled', 'responsive', 'autonomous'] as const;
  for (const mode of modes) {
    const doc = store.upsert({
      accountId: `acct-lm-modes-${mode}`,
      profiles: [{ id: `p-${mode}`, brandName: 'Test', voice: 'v', learningMode: mode }]
    });
    const profile = doc.profiles.find((p) => p.id === `p-${mode}`);
    assert.ok(profile);
    assert.equal((profile as { learningMode?: string }).learningMode, mode, `learningMode '${mode}' should round-trip`);
  }
});

test('phase32: SQLite store round-trips learningMode correctly', () => {
  const store = createSqliteHostedProfileLibraryStore(':memory:');
  try {
    const inserted = store.upsert({
      accountId: 'acct-lm-sqlite',
      workspaceId: 'ws-lm',
      profiles: [{ id: 'p-sqlite', brandName: 'SQLite Brand', voice: 'crisp', learningMode: 'autonomous' }]
    });
    const insertedProfile = inserted.profiles.find((p) => p.id === 'p-sqlite');
    assert.ok(insertedProfile);
    assert.equal((insertedProfile as { learningMode?: string }).learningMode, 'autonomous');

    // Retrieve and confirm persistence
    const retrieved = store.get('acct-lm-sqlite', 'ws-lm');
    assert.ok(retrieved);
    const retrievedProfile = retrieved.profiles.find((p) => p.id === 'p-sqlite');
    assert.ok(retrievedProfile);
    assert.equal((retrievedProfile as { learningMode?: string }).learningMode, 'autonomous');
  } finally {
    store.close();
  }
});

test('phase32: SQLite store preserves learningMode on second upsert without mode field', () => {
  const store = createSqliteHostedProfileLibraryStore(':memory:');
  try {
    store.upsert({
      accountId: 'acct-lm-sqlite2',
      workspaceId: 'ws-2',
      profiles: [{ id: 'p-s2', brandName: 'Brand', voice: 'v', learningMode: 'manual-review' }]
    });
    const updated = store.upsert({
      accountId: 'acct-lm-sqlite2',
      workspaceId: 'ws-2',
      profiles: [{ id: 'p-s2', brandName: 'Brand Updated', voice: 'v' }]
    });
    const profile = updated.profiles.find((p) => p.id === 'p-s2');
    assert.ok(profile);
    assert.equal((profile as { learningMode?: string }).learningMode, 'manual-review');
  } finally {
    store.close();
  }
});

// ---------------------------------------------------------------------------
// P32-2: POST /admin/learning/batch-recompute
// ---------------------------------------------------------------------------

test('phase32: POST /admin/learning/batch-recompute skips manual-mode profiles', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-manual-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-manual';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: 'p-manual', brandName: 'Manual Brand', voice: 'v', learningMode: 'manual' }]
  });

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: {
          recomputed: string[];
          skipped: Array<{ profileId: string; reason: string }>;
          summary: { total: number; recomputed: number; skipped: number };
        };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.recomputed.length, 0);
      assert.equal(payload.result.skipped.length, 1);
      assert.equal(payload.result.skipped[0].profileId, 'p-manual');
      assert.equal(payload.result.skipped[0].reason, 'manual_mode');
      assert.equal(payload.result.summary.total, 1);
      assert.equal(payload.result.summary.skipped, 1);
      assert.equal(payload.result.summary.recomputed, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute skips non-manual profiles with insufficient feedback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-smallfb-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-smallfb';
  const profileId = 'p-p32-sched-smallfb';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Sched Brand', voice: 'v', learningMode: 'scheduled' }]
  });

  // Only 2 feedback records — below MIN_SAMPLE_SIZE of 5
  for (let i = 0; i < 2; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-sfb-${i}`, profileId, target: 'suno', score: 4 }));
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { recomputed: string[]; skipped: Array<{ profileId: string; reason: string }> };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.recomputed.length, 0);
      const skippedEntry = payload.result.skipped.find((s) => s.profileId === profileId);
      assert.ok(skippedEntry, 'profile should appear in skipped array');
      assert.equal(skippedEntry.reason, 'insufficient_feedback');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute recomputes non-manual profiles with sufficient feedback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-recompute-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-recompute';
  const profileId = 'p-p32-sched-recompute';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Sched Brand', voice: 'v', learningMode: 'scheduled' }]
  });

  // 5 feedback records — meets MIN_SAMPLE_SIZE threshold
  for (let i = 0; i < 5; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-rc-${i}`, profileId, target: 'suno', score: 3 + (i % 3) }));
  }

  try {
    const server = createServer({
      authConfig: { bypassAuth: true },
      feedbackStore,
      usageLedgerStore,
      profileLibraryStore
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: {
          recomputed: string[];
          skipped: Array<{ profileId: string; reason: string }>;
          summary: { total: number; recomputed: number; skipped: number };
          computedAt: string;
        };
      };
      assert.equal(payload.ok, true);
      assert.ok(payload.result.recomputed.includes(profileId), 'profileId should be in recomputed array');
      assert.equal(payload.result.summary.recomputed, 1);
      assert.equal(payload.result.summary.skipped, 0);
      assert.equal(payload.result.summary.total, 1);
      assert.ok(payload.result.computedAt, 'computedAt timestamp should be returned');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute skips profiles with divergence alert', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-diverge-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-diverge';
  const profileId = 'p-p32-sched-diverge';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Diverge Brand', voice: 'v', learningMode: 'scheduled' }]
  });

  // 5 feedback records to pass feedbackCount check
  for (let i = 0; i < 5; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-div-${i}`, profileId, target: 'suno', score: 3 }));
  }

  // Seed a learningDivergenceDetected event to trigger divergenceAlert
  const seededDb = new DatabaseSync(dbPath);
  try {
    seededDb.prepare(`
      INSERT INTO learning_audit_events (profile_id, event_type, payload_json, created_at)
      VALUES (?, 'learningDivergenceDetected', ?, ?)
    `).run(profileId, JSON.stringify({ detected: true }), new Date().toISOString());
  } finally {
    seededDb.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { recomputed: string[]; skipped: Array<{ profileId: string; reason: string }> };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.recomputed.length, 0, 'diverged profile should not be recomputed');
      const skippedEntry = payload.result.skipped.find((s) => s.profileId === profileId);
      assert.ok(skippedEntry, 'profile should appear in skipped array');
      assert.equal(skippedEntry.reason, 'divergence_alert');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute returns 501 when learning store unavailable', async () => {
  const accountId = 'acct-p32-nostore';
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();
  // createInMemoryFeedbackStore has no getLearningSummary — not LearningAwareFeedbackStore
  const plainFeedbackStore = createInMemoryFeedbackStore();

  const server = createServer({
    authConfig: { bypassAuth: true },
    feedbackStore: plainFeedbackStore,
    profileLibraryStore
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
      body: JSON.stringify({ accountId })
    });
    assert.equal(res.status, 501);
    const payload = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'SERVER_ERROR');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('phase32: POST /admin/learning/batch-recompute returns 403 for non-owner', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-auth-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // x-account-id identifies requester as 'acct-requester'; body targets 'acct-owner' → FORBIDDEN
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': 'acct-requester'
        },
        body: JSON.stringify({ accountId: 'acct-owner' })
      });
      assert.equal(res.status, 403);
      const payload = (await res.json()) as { ok: boolean; error: { code: string } };
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, 'FORBIDDEN');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute returns 400 when accountId is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-noacct-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // No x-account-id header and no accountId in body
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 400);
      const payload = (await res.json()) as { ok: boolean; error: { code: string } };
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, 'BAD_REQUEST');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute correctly splits mixed manual and non-manual profiles', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-mixed-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-mixed';
  const manualProfileId = 'p-manual-mx';
  const schedProfileId = 'p-sched-mx';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [
      { id: manualProfileId, brandName: 'Manual', voice: 'v', learningMode: 'manual' },
      { id: schedProfileId, brandName: 'Scheduled', voice: 'v', learningMode: 'scheduled' }
    ]
  });

  // Only scheduled profile gets sufficient feedback
  for (let i = 0; i < 5; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-mx-${i}`, profileId: schedProfileId, target: 'suno', score: 3 }));
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: {
          recomputed: string[];
          skipped: Array<{ profileId: string; reason: string }>;
          summary: { total: number; recomputed: number; skipped: number };
        };
      };
      assert.equal(payload.ok, true);
      assert.ok(payload.result.recomputed.includes(schedProfileId), 'scheduled profile should be recomputed');
      const manualSkip = payload.result.skipped.find((s) => s.profileId === manualProfileId);
      assert.ok(manualSkip, 'manual profile should be skipped');
      assert.equal(manualSkip.reason, 'manual_mode');
      assert.equal(payload.result.summary.total, 2);
      assert.equal(payload.result.summary.recomputed, 1);
      assert.equal(payload.result.summary.skipped, 1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute meters recomputes in hosted mode', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-metered-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-metered';
  const profileId = 'p-p32-metered';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Metered Brand', voice: 'v', learningMode: 'autonomous' }]
  });

  for (let i = 0; i < 5; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-mt-${i}`, profileId, target: 'suno', score: 4 }));
  }

  try {
    const server = createServer({
      authConfig: { bypassAuth: true },
      feedbackStore,
      usageLedgerStore,
      profileLibraryStore
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId, plan: 'pro', mode: 'hosted' })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as { ok: boolean; result: { recomputed: string[] } };
      assert.equal(payload.ok, true);
      assert.ok(payload.result.recomputed.includes(profileId));

      // Hosted mode should record a metering event
      const usage = usageLedgerStore.summarizeAccount(accountId, { domain: 'learning', unit: 'request' });
      assert.ok(usage.totalsByDomain.learning >= 1, 'at least one learning metering event should be recorded');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /admin/learning/batch-recompute returns empty result for account with no profiles', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-empty-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-empty';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();
  // No profiles upserted for this account

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/batch-recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId })
      });
      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { recomputed: string[]; skipped: unknown[]; summary: { total: number } };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.recomputed.length, 0);
      assert.equal(payload.result.skipped.length, 0);
      assert.equal(payload.result.summary.total, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// P32-3: Responsive candidate creation on POST /feedback
// ---------------------------------------------------------------------------

test('phase32: POST /feedback does not trigger responsive derivation for manual-mode profile', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-3-manual-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-3-manual';
  const profileId = 'p-p32-3-manual';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Manual', voice: 'v', learningMode: 'manual' }]
  });

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, usageLedgerStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // Save 5 feedback records via the API
      for (let i = 0; i < 5; i++) {
        const r = await fetch(`http://127.0.0.1:${port}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
          body: JSON.stringify({ bundleId: `bundle-p32-3-m-${i}`, profileId, target: 'suno', score: 4 })
        });
        assert.equal(r.status, 201);
      }

      // Manual-mode profile → no candidateCreated event in usage ledger
      const allEvents = usageLedgerStore.listByAccount(accountId);
      const candidateEvents = allEvents.filter((e) => e.action === 'candidateCreated');
      assert.equal(candidateEvents.length, 0, 'manual-mode profile must not emit candidateCreated event');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /feedback triggers responsive derivation and emits candidateCreated for responsive profile with sufficient feedback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-3-responsive-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-3-resp';
  const profileId = 'p-p32-3-resp';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Responsive', voice: 'v', learningMode: 'responsive' }]
  });

  // Pre-seed 4 feedback records directly (below sample threshold) so the 5th via API triggers derivation
  for (let i = 0; i < 4; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-p32-3-r-pre-${i}`, profileId, target: 'suno', score: 4 }));
  }
  // Seed state: an existing active weight_version (so next derivation is a 'candidate')
  // and a stale weight_derivation (prior weights differ → deduplication gate passes).
  // The prior weights are set to all-zeros so derived weights (from real feedback) differ.
  const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
  const priorWeightsJson = JSON.stringify({ clarity: 0, specificity: 0, styleConsistency: 0, targetReadiness: 0 });
  const seededDb = new DatabaseSync(dbPath);
  try {
    seededDb.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(profileId, 1, priorWeightsJson, 'seed-hash-p32-3-resp', staleAt);
    seededDb.prepare(`
      INSERT INTO weight_derivations (profile_id, derived_at, input_record_count, prior_weights, new_weights, weight_changes, trigger_source)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(profileId, staleAt, 4, priorWeightsJson, JSON.stringify({}), 'seed');
  } finally {
    seededDb.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, usageLedgerStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // 5th feedback record — crosses sample threshold and triggers responsive derivation
      const res = await fetch(`http://127.0.0.1:${port}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ bundleId: 'bundle-p32-3-r-5th', profileId, target: 'suno', score: 5 })
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(body.ok, true);

      // A candidateCreated metering event should have been emitted
      const allEvents = usageLedgerStore.listByAccount(accountId);
      const candidateEvents = allEvents.filter((e) => e.action === 'candidateCreated');
      assert.ok(candidateEvents.length >= 1, 'responsive profile should emit candidateCreated event after threshold crossed');
      assert.equal(candidateEvents[0].profileId, profileId);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /feedback skips responsive derivation when cooldown has not elapsed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-3-cooldown-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-3-cool';
  const profileId = 'p-p32-3-cool';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Cooldown', voice: 'v', learningMode: 'responsive' }]
  });

  // Pre-seed 4 feedback records
  for (let i = 0; i < 4; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-p32-3-c-${i}`, profileId, target: 'suno', score: 4 }));
  }
  // Seed a RECENT derivation (30 minutes ago — within cooldown window)
  const seededDb2 = new DatabaseSync(dbPath);
  try {
    seededDb2.prepare(`
      INSERT INTO weight_derivations (profile_id, derived_at, input_record_count, prior_weights, new_weights, weight_changes, trigger_source)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(
      profileId,
      new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago — within 1h cooldown
      4,
      JSON.stringify({ clarity: 1, specificity: 1, styleConsistency: 1, targetReadiness: 1 }),
      JSON.stringify({ clarity: 0, specificity: 0, styleConsistency: 0, targetReadiness: 0 }),
      'seed'
    );
  } finally {
    seededDb2.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, usageLedgerStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ bundleId: 'bundle-p32-3-c-5th', profileId, target: 'suno', score: 5 })
      });
      assert.equal(res.status, 201);

      // Cooldown has NOT elapsed — no candidateCreated event
      const allEvents = usageLedgerStore.listByAccount(accountId);
      const candidateEvents = allEvents.filter((e) => e.action === 'candidateCreated');
      assert.equal(candidateEvents.length, 0, 'within-cooldown responsive profile must not emit candidateCreated');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: POST /feedback skips responsive derivation when divergenceAlert is active', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-3-divg-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-3-divg';
  const profileId = 'p-p32-3-divg';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Diverged', voice: 'v', learningMode: 'responsive' }]
  });

  // Pre-seed 5 feedback records and an old enough derivation
  for (let i = 0; i < 5; i++) {
    feedbackStore.save(createFeedbackRecord({ bundleId: `bundle-p32-3-d-${i}`, profileId, target: 'suno', score: 3 }));
  }
  const seededDb3 = new DatabaseSync(dbPath);
  try {
    seededDb3.prepare(`
      INSERT INTO weight_derivations (profile_id, derived_at, input_record_count, prior_weights, new_weights, weight_changes, trigger_source)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(
      profileId,
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      5,
      JSON.stringify({ clarity: 1, specificity: 1, styleConsistency: 1, targetReadiness: 1 }),
      JSON.stringify({ clarity: 0, specificity: 0, styleConsistency: 0, targetReadiness: 0 }),
      'seed'
    );
    // Seed a recent divergence event
    seededDb3.prepare(`
      INSERT INTO learning_audit_events (profile_id, event_type, payload_json, created_at)
      VALUES (?, 'learningDivergenceDetected', ?, ?)
    `).run(profileId, JSON.stringify({ detected: true }), new Date().toISOString());
  } finally {
    seededDb3.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, usageLedgerStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ bundleId: 'bundle-p32-3-d-6th', profileId, target: 'suno', score: 4 })
      });
      assert.equal(res.status, 201);

      // divergenceAlert is true — no candidateCreated event
      const allEvents = usageLedgerStore.listByAccount(accountId);
      const candidateEvents = allEvents.filter((e) => e.action === 'candidateCreated');
      assert.equal(candidateEvents.length, 0, 'diverged profile must not emit candidateCreated via responsive path');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// P32-4: Autonomous auto-promotion after shadow eval gates pass
// ---------------------------------------------------------------------------

test('phase32: shadow-evaluate auto-promotes candidate when learningMode is autonomous and eval passes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-4-autopromote-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-4-auto';
  const profileId = 'p-p32-4-auto';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const usageLedgerStore = createInMemoryUsageLedgerStore();
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'Autonomous', voice: 'v', learningMode: 'autonomous' }]
  });

  // Save 1 feedback record so getLearningSummary works
  feedbackStore.save(createFeedbackRecord({ bundleId: 'bundle-p32-4-a', profileId, target: 'suno', score: 5 }));
  feedbackStore.getLearningSummary(profileId); // triggers initial derivation → version 1 active

  // Seed two prior stable promotion cycles and then a candidate.
  // Stable cycles are inferred as non-candidate versions minus one baseline.
  const seededDb4 = new DatabaseSync(dbPath);
  try {
    seededDb4.prepare(`
      UPDATE weight_versions SET status = 'rolled_back' WHERE profile_id = ? AND version = 1
    `).run(profileId);
    seededDb4.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'rolled_back')
    `).run(
      profileId,
      2,
      JSON.stringify({ clarity: 1.05, specificity: 1.05, styleConsistency: 1.05, targetReadiness: 1.05 }),
      'seed-p32-4-stable-2',
      new Date().toISOString()
    );
    seededDb4.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(
      profileId,
      3,
      JSON.stringify({ clarity: 1.1, specificity: 1.1, styleConsistency: 1.1, targetReadiness: 1.1 }),
      'seed-p32-4-stable-3',
      new Date().toISOString()
    );
    seededDb4.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'candidate')
    `).run(
      profileId,
      4,
      JSON.stringify({ clarity: 1.1, specificity: 1.1, styleConsistency: 1.1, targetReadiness: 1.1 }),
      'seed-p32-4-candidate',
      new Date().toISOString()
    );
  } finally {
    seededDb4.close();
  }

  try {
    const server = createServer({
      authConfig: { bypassAuth: true },
      feedbackStore,
      usageLedgerStore,
      profileLibraryStore
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const referenceSet = Array.from({ length: 5 }, (_, i) => ({
        brief: {
          id: `brief-p32-4-${i}`,
          title: `Auto Eval ${i}`,
          concept: 'Autonomous auto-promotion test.',
          targets: ['suno'],
          genres: ['ambient'],
          mood: ['calm']
        },
        profile: {
          id: `ref-profile-p32-4-${i}`,
          brandName: 'Ref Brand',
          voice: 'precise'
        }
      }));

      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/shadow-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({
          accountId,
          profileId,
          candidateVersion: 4,
          referenceSet
        })
      });

      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: {
          passed: boolean;
          autoPromoted: boolean;
          autoPromotedVersion: number | null;
          failureReason: string | null;
        };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.passed, true);
      assert.equal(payload.result.autoPromoted, true, 'autonomous profile should be auto-promoted on pass');
      assert.equal(payload.result.autoPromotedVersion, 4);
      assert.equal(payload.result.failureReason, null);

      // Verify the candidate was actually promoted in the store
      const promoted = feedbackStore.listWeightVersions(profileId, 'active');
      assert.ok(promoted.some((v) => v.version === 4), 'version 4 should be active after auto-promotion');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: shadow-evaluate does NOT auto-promote autonomous profile when unlock criteria are not met', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-4-unlock-block-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-4-unlock-block';
  const profileId = 'p-p32-4-unlock-block';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'AutonomousBlocked', voice: 'v', learningMode: 'autonomous' }]
  });

  feedbackStore.save(createFeedbackRecord({ bundleId: 'bundle-p32-4-ub', profileId, target: 'suno', score: 5 }));
  feedbackStore.getLearningSummary(profileId); // version 1 active

  const seededDbUnlock = new DatabaseSync(dbPath);
  try {
    seededDbUnlock.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'candidate')
    `).run(
      profileId,
      2,
      JSON.stringify({ clarity: 1, specificity: 1, styleConsistency: 1, targetReadiness: 1 }),
      'seed-p32-4-unlock-candidate',
      new Date().toISOString()
    );
  } finally {
    seededDbUnlock.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const referenceSet = Array.from({ length: 5 }, (_, i) => ({
        brief: { id: `brief-p32-4-ub-${i}`, title: `Unlock Block ${i}`, concept: 'Unlock criteria block test.', targets: ['suno'], genres: ['ambient'], mood: ['calm'] },
        profile: { id: `ref-p32-4-ub-${i}`, brandName: 'Ref', voice: 'v' }
      }));

      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/shadow-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId, profileId, candidateVersion: 2, referenceSet })
      });

      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: {
          passed: boolean;
          autoPromoted: boolean;
          autoPromotedVersion: number | null;
          unlockCriteria: {
            eligible: boolean;
            stablePromotionCycles: number;
            requiredStablePromotionCycles: number;
          };
        };
      };

      assert.equal(payload.ok, true);
      assert.equal(payload.result.passed, true);
      assert.equal(payload.result.unlockCriteria.eligible, false);
      assert.equal(payload.result.unlockCriteria.stablePromotionCycles < payload.result.unlockCriteria.requiredStablePromotionCycles, true);
      assert.equal(payload.result.autoPromoted, false, 'autonomous mode should remain blocked until unlock criteria pass');
      assert.equal(payload.result.autoPromotedVersion, null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: shadow-evaluate does NOT auto-promote when learningMode is manual', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-4-manual-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-4-manual';
  const profileId = 'p-p32-4-manual';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'ManualEval', voice: 'v', learningMode: 'manual' }]
  });

  feedbackStore.save(createFeedbackRecord({ bundleId: 'bundle-p32-4-m', profileId, target: 'suno', score: 5 }));
  feedbackStore.getLearningSummary(profileId);

  const seededDb5 = new DatabaseSync(dbPath);
  try {
    seededDb5.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'candidate')
    `).run(
      profileId, 2,
      JSON.stringify({ clarity: 1, specificity: 1, styleConsistency: 1, targetReadiness: 1 }),
      'seed-p32-4-manual-candidate',
      new Date().toISOString()
    );
  } finally {
    seededDb5.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const referenceSet = Array.from({ length: 5 }, (_, i) => ({
        brief: { id: `brief-p32-4-m-${i}`, title: `Manual Eval ${i}`, concept: 'No auto-promote.', targets: ['suno'], genres: ['ambient'], mood: ['calm'] },
        profile: { id: `ref-p32-4-m-${i}`, brandName: 'Ref', voice: 'v' }
      }));

      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/shadow-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId, profileId, candidateVersion: 2, referenceSet })
      });

      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { passed: boolean; autoPromoted: boolean; autoPromotedVersion: number | null };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.passed, true);
      assert.equal(payload.result.autoPromoted, false, 'manual mode should never auto-promote');
      assert.equal(payload.result.autoPromotedVersion, null);

      // Candidate should still be in candidate state (not promoted)
      const candidates = feedbackStore.listWeightVersions(profileId, 'candidate');
      assert.ok(candidates.some((v) => v.version === 2), 'version 2 should remain as candidate for manual mode');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: shadow-evaluate does NOT auto-promote when eval fails (regression exceeded)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-4-failed-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-4-fail';
  const profileId = 'p-p32-4-fail';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  const profileLibraryStore = createInMemoryHostedProfileLibraryStore();

  profileLibraryStore.upsert({
    accountId,
    profiles: [{ id: profileId, brandName: 'AutoFail', voice: 'v', learningMode: 'autonomous' }]
  });

  feedbackStore.save(createFeedbackRecord({ bundleId: 'bundle-p32-4-f', profileId, target: 'suno', score: 5 }));
  feedbackStore.getLearningSummary(profileId);

  // Seed a candidate whose weights are identical to active — identical weights mean
  // compilePromptBundle will score them the same so regressionPercent = 0.
  // To test the regression path, seed a candidate with weights that will produce lower scores.
  // We do this by seeding an active version with very high weights and a candidate with very low weights.
  const seededDb6 = new DatabaseSync(dbPath);
  try {
    // Overwrite active version 1 to have very high weights (produces high baseline score)
    seededDb6.prepare(`
      UPDATE weight_versions SET weights = ? WHERE profile_id = ? AND version = ?
    `).run(
      JSON.stringify({ clarity: 10, specificity: 10, styleConsistency: 10, targetReadiness: 10 }),
      profileId, 1
    );
    // Seed candidate version 2 with very low weights (produces lower score → regression)
    seededDb6.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'candidate')
    `).run(
      profileId, 2,
      JSON.stringify({ clarity: 0.001, specificity: 0.001, styleConsistency: 0.001, targetReadiness: 0.001 }),
      'seed-p32-4-fail-candidate',
      new Date().toISOString()
    );
  } finally {
    seededDb6.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore, profileLibraryStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const referenceSet = Array.from({ length: 5 }, (_, i) => ({
        brief: { id: `brief-p32-4-f-${i}`, title: `Fail Eval ${i}`, concept: 'Regression test.', targets: ['suno'], genres: ['ambient'], mood: ['calm'] },
        profile: { id: `ref-p32-4-f-${i}`, brandName: 'Ref', voice: 'v' }
      }));

      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/shadow-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId, profileId, candidateVersion: 2, referenceSet })
      });

      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { passed: boolean; autoPromoted: boolean; failureReason: string | null };
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.result.passed, false);
      assert.equal(payload.result.autoPromoted, false, 'failed eval must not auto-promote');
      assert.equal(payload.result.failureReason, 'regression_exceeded');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase32: shadow-evaluate response always includes autoPromoted and autoPromotedVersion fields for non-autonomous modes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-p32-4-fields-'));
  const dbPath = path.join(tmpDir, 'feedback.db');
  const accountId = 'acct-p32-4-fields';
  const profileId = 'p-p32-4-fields';
  const feedbackStore = createSqliteFeedbackStore(dbPath);
  // No profileLibraryStore — defaults to empty in-memory store → no profile found → mode defaults to 'manual'

  feedbackStore.save(createFeedbackRecord({ bundleId: 'bundle-p32-4-fld', profileId, target: 'suno', score: 5 }));
  feedbackStore.getLearningSummary(profileId);

  const seededDb7 = new DatabaseSync(dbPath);
  try {
    seededDb7.prepare(`
      INSERT INTO weight_versions (profile_id, version, weights, derived_from_hash, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'candidate')
    `).run(
      profileId, 2,
      JSON.stringify({ clarity: 1, specificity: 1, styleConsistency: 1, targetReadiness: 1 }),
      'seed-p32-4-fields',
      new Date().toISOString()
    );
  } finally {
    seededDb7.close();
  }

  try {
    const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const referenceSet = Array.from({ length: 5 }, (_, i) => ({
        brief: { id: `brief-p32-4-fld-${i}`, title: `Fields Eval ${i}`, concept: 'Fields check.', targets: ['suno'], genres: ['ambient'], mood: ['calm'] },
        profile: { id: `ref-p32-4-fld-${i}`, brandName: 'Ref', voice: 'v' }
      }));

      const res = await fetch(`http://127.0.0.1:${port}/admin/learning/shadow-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({ accountId, profileId, candidateVersion: 2, referenceSet })
      });

      assert.equal(res.status, 200);
      const payload = (await res.json()) as {
        ok: boolean;
        result: { autoPromoted: boolean; autoPromotedVersion: null };
      };
      assert.equal(payload.ok, true);
      // autoPromoted field must always be present in response
      assert.equal(typeof payload.result.autoPromoted, 'boolean');
      assert.equal(payload.result.autoPromoted, false);
      assert.equal(payload.result.autoPromotedVersion, null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  } finally {
    feedbackStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
