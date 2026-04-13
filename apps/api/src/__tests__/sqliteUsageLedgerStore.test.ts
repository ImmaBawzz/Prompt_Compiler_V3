import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createUsageMeteringEvent
} from '@prompt-compiler/core';
import { createSqliteUsageLedgerStore } from '../sqliteUsageLedgerStore';

test('SQLite usage ledger appends/lists/summarizes with filters', () => {
  const store = createSqliteUsageLedgerStore(':memory:');
  try {
    store.append(
      createUsageMeteringEvent({
        eventId: 'evt-1',
        accountId: 'acct-usage',
        workspaceId: 'ws-a',
        domain: 'execute',
        action: 'execute-compiled-output',
        unit: 'request',
        unitsConsumed: 1,
        occurredAt: '2026-04-12T00:00:00.000Z'
      })
    );
    store.append(
      createUsageMeteringEvent({
        eventId: 'evt-2',
        accountId: 'acct-usage',
        workspaceId: 'ws-a',
        domain: 'publish',
        action: 'publish-bundle',
        unit: 'request',
        unitsConsumed: 2,
        occurredAt: '2026-04-12T00:01:00.000Z'
      })
    );
    store.append(
      createUsageMeteringEvent({
        eventId: 'evt-3',
        accountId: 'acct-other',
        workspaceId: 'ws-b',
        domain: 'marketplace-install',
        action: 'install-listing',
        unit: 'request',
        unitsConsumed: 1,
        occurredAt: '2026-04-12T00:02:00.000Z'
      })
    );

    const all = store.listByAccount('acct-usage');
    assert.equal(all.length, 2);

    const executeOnly = store.listByAccount('acct-usage', { domain: 'execute' });
    assert.equal(executeOnly.length, 1);
    assert.equal(executeOnly[0].eventId, 'evt-1');

    const summary = store.summarizeAccount('acct-usage');
    assert.equal(summary.totalEvents, 2);
    assert.equal(summary.totalsByDomain.execute, 1);
    assert.equal(summary.totalsByDomain.publish, 2);
    assert.equal(summary.totalsByDomain['marketplace-install'], 0);
    assert.equal(summary.totalsByUnit.request, 3);
  } finally {
    store.close();
  }
});

test('SQLite usage ledger persists across reopen for the same db file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-usage-ledger-'));
  const dbPath = path.join(tmpDir, 'usage-ledger.db');

  const writer = createSqliteUsageLedgerStore(dbPath);
  writer.append(
    createUsageMeteringEvent({
      eventId: 'evt-persist-1',
      accountId: 'acct-persist',
      workspaceId: 'ws-1',
      domain: 'execute',
      action: 'execute-compiled-output',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: '2026-04-12T00:03:00.000Z'
    })
  );
  writer.close();

  const reader = createSqliteUsageLedgerStore(dbPath);
  try {
    const events = reader.listByAccount('acct-persist');
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, 'evt-persist-1');

    const summary = reader.summarizeAccount('acct-persist');
    assert.equal(summary.totalEvents, 1);
    assert.equal(summary.totalsByDomain.execute, 1);
  } finally {
    reader.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});
