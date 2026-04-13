import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { createFeedbackRecord } from '@prompt-compiler/core';
import { createServer } from '../server';
import { createSqliteFeedbackStore } from '../sqliteFeedbackStore';

test('phase30: SQLite feedback store persists records and produces learning summary', () => {
  const store = createSqliteFeedbackStore(':memory:');
  try {
    store.save(
      createFeedbackRecord({
        bundleId: 'bundle-1',
        profileId: 'profile-1',
        target: 'suno',
        score: 4,
        notes: 'Good output'
      })
    );
    store.save(
      createFeedbackRecord({
        bundleId: 'bundle-2',
        profileId: 'profile-1',
        target: 'udio',
        score: 2
      })
    );

    const records = store.getByProfile('profile-1');
    assert.equal(records.length, 2);

    const aggregate = store.getAggregate('profile-1');
    assert.equal(aggregate.totalRecords, 2);
    assert.equal(aggregate.profileId, 'profile-1');

    const learning = store.getLearningSummary('profile-1');
    assert.equal(learning.profileId, 'profile-1');
    assert.equal(learning.feedbackCount, 2);
    assert.ok(learning.lastDerivedAt, 'lastDerivedAt should be set after derivation');
    assert.equal(learning.pendingCandidates, 0);
    assert.equal(learning.divergenceAlert, false);
    assert.ok(typeof learning.currentWeights.clarity === 'number');
  } finally {
    store.close();
  }
});

test('phase30: SQLite feedback store survives reopen on disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-feedback-store-'));
  const dbPath = path.join(tmpDir, 'feedback.db');

  const writer = createSqliteFeedbackStore(dbPath);
  writer.save(
    createFeedbackRecord({
      bundleId: 'bundle-persist',
      profileId: 'profile-persist',
      target: 'flux',
      score: 5
    })
  );
  writer.getAggregate('profile-persist');
  writer.close();

  const reader = createSqliteFeedbackStore(dbPath);
  try {
    const records = reader.getByProfile('profile-persist');
    assert.equal(records.length, 1);
    const learning = reader.getLearningSummary('profile-persist');
    assert.equal(learning.feedbackCount, 1);
    assert.ok(learning.lastDerivedAt);
  } finally {
    reader.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('phase30: /session/bootstrap includes learning block when profileId query is supplied', async () => {
  const feedbackStore = createSqliteFeedbackStore(':memory:');
  feedbackStore.save(
    createFeedbackRecord({
      bundleId: 'bundle-bootstrap',
      profileId: 'profile-bootstrap',
      target: 'kling',
      score: 3
    })
  );

  const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/session/bootstrap?accountId=acct-learning&mode=hosted&profileId=profile-bootstrap`
    );
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      ok: boolean;
      result: {
        learning?: {
          profileId: string;
          feedbackCount: number;
          lastDerivedAt: string | null;
          pendingCandidates: number;
          divergenceAlert: boolean;
        };
      };
    };

    assert.equal(payload.ok, true);
    assert.ok(payload.result.learning, 'learning block should exist');
    assert.equal(payload.result.learning?.profileId, 'profile-bootstrap');
    assert.equal(payload.result.learning?.feedbackCount, 1);
    assert.equal(payload.result.learning?.pendingCandidates, 0);
    assert.equal(payload.result.learning?.divergenceAlert, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    feedbackStore.close();
  }
});

// P30-4: Learning domain quota is enforced on POST /feedback in hosted mode.
test('phase30: POST /feedback enforces learning quota — free plan blocks after limit', async () => {
  const feedbackStore = createSqliteFeedbackStore(':memory:');
  // free plan has limit=0 for learning domain, so first request should be blocked.
  const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-free-quota' },
      body: JSON.stringify({
        bundleId: 'bundle-quota',
        profileId: 'profile-quota',
        target: 'suno',
        score: 4,
        plan: 'free',
        mode: 'hosted'
      })
    });
    // free plan learning limit=0, so quota is exhausted before first save.
    assert.equal(res.status, 403);
    const body = (await res.json()) as { ok: false; error: { code: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'FORBIDDEN');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    feedbackStore.close();
  }
});

// P30-4: Learning event recorded in usage ledger after successful feedback save.
test('phase30: POST /feedback meters a learning/shadow-evaluation event in hosted mode', async () => {
  const feedbackStore = createSqliteFeedbackStore(':memory:');
  const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // pro plan has learning limit=10, so first request should succeed.
    const res = await fetch(`http://127.0.0.1:${port}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-meter' },
      body: JSON.stringify({
        bundleId: 'bundle-meter',
        profileId: 'profile-meter',
        target: 'suno',
        score: 5,
        plan: 'pro',
        mode: 'hosted'
      })
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { ok: true };
    assert.equal(body.ok, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    feedbackStore.close();
  }
});

// P30-5: GET /learning/timeline returns learning summary for a profile.
test('phase30: GET /learning/timeline returns learning summary for a profile', async () => {
  const feedbackStore = createSqliteFeedbackStore(':memory:');
  feedbackStore.save(
    createFeedbackRecord({
      bundleId: 'bundle-timeline',
      profileId: 'profile-timeline',
      target: 'kling',
      score: 4
    })
  );

  const server = createServer({ authConfig: { bypassAuth: true }, feedbackStore });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/learning/timeline?profileId=profile-timeline`
    );
    assert.equal(res.status, 200);
    const payload = (await res.json()) as {
      ok: boolean;
      result: { profileId: string; feedbackCount: number };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.result.profileId, 'profile-timeline');
    assert.equal(payload.result.feedbackCount, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    feedbackStore.close();
  }
});
