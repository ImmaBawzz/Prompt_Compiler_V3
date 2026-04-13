import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUsageQuotaSnapshot,
  buildUsageAccountSummary,
  createInMemoryUsageLedgerStore,
  createUsageMeteringEvent,
  resolveUsageQuotaPlan
} from '../usage';

test('createUsageMeteringEvent applies defaults and validates required fields', () => {
  const event = createUsageMeteringEvent({
    accountId: 'acct-1',
    domain: 'execute',
    action: 'provider-call'
  });

  assert.ok(event.eventId);
  assert.equal(event.unit, 'request');
  assert.equal(event.unitsConsumed, 1);
  assert.equal(event.domain, 'execute');
});

test('createUsageMeteringEvent throws on invalid unit or non-positive units', () => {
  assert.throws(
    () =>
      createUsageMeteringEvent({
        accountId: 'acct-1',
        domain: 'publish',
        action: 'dispatch',
        unit: 'token',
        unitsConsumed: 0
      }),
    /unitsConsumed/
  );

  assert.throws(
    () =>
      createUsageMeteringEvent({
        accountId: 'acct-1',
        domain: 'publish',
        action: 'dispatch',
        unit: 'invalid' as never
      }),
    /unit must be request or token/
  );
});

test('buildUsageAccountSummary returns domain and unit totals', () => {
  const events = [
    createUsageMeteringEvent({
      accountId: 'acct-1',
      workspaceId: 'ws-1',
      domain: 'execute',
      action: 'dry-run',
      unitsConsumed: 1,
      unit: 'request',
      occurredAt: '2026-04-12T00:00:00.000Z'
    }),
    createUsageMeteringEvent({
      accountId: 'acct-1',
      workspaceId: 'ws-1',
      domain: 'execute',
      action: 'live-call',
      unitsConsumed: 120,
      unit: 'token',
      occurredAt: '2026-04-12T00:02:00.000Z'
    }),
    createUsageMeteringEvent({
      accountId: 'acct-1',
      workspaceId: 'ws-2',
      domain: 'marketplace-install',
      action: 'install',
      unitsConsumed: 1,
      unit: 'request',
      occurredAt: '2026-04-12T00:03:00.000Z'
    })
  ];

  const summary = buildUsageAccountSummary('acct-1', events);
  assert.equal(summary.totalEvents, 3);
  assert.equal(summary.totalsByDomain.execute, 121);
  assert.equal(summary.totalsByDomain['marketplace-install'], 1);
  assert.equal(summary.totalsByUnit.request, 2);
  assert.equal(summary.totalsByUnit.token, 120);
  assert.equal(summary.mostRecentEventAt, '2026-04-12T00:03:00.000Z');
});

test('createInMemoryUsageLedgerStore filters by account, workspace, and domain', () => {
  const store = createInMemoryUsageLedgerStore();
  store.append(
    createUsageMeteringEvent({
      accountId: 'acct-1',
      workspaceId: 'ws-1',
      domain: 'execute',
      action: 'provider-call',
      unitsConsumed: 10,
      unit: 'token',
      occurredAt: '2026-04-12T00:00:00.000Z'
    })
  );
  store.append(
    createUsageMeteringEvent({
      accountId: 'acct-1',
      workspaceId: 'ws-2',
      domain: 'publish',
      action: 'webhook',
      unitsConsumed: 1,
      unit: 'request',
      occurredAt: '2026-04-12T00:01:00.000Z'
    })
  );
  store.append(
    createUsageMeteringEvent({
      accountId: 'acct-2',
      workspaceId: 'ws-2',
      domain: 'publish',
      action: 'webhook',
      unitsConsumed: 1,
      unit: 'request',
      occurredAt: '2026-04-12T00:02:00.000Z'
    })
  );

  assert.equal(store.listByAccount('acct-1').length, 2);
  assert.equal(store.listByWorkspace('acct-1', 'ws-2').length, 1);
  assert.equal(store.listByAccount('acct-1', { domain: 'publish' }).length, 1);
  assert.equal(store.listByAccount('acct-1', { unit: 'token' }).length, 1);

  const summary = store.summarizeAccount('acct-1', { from: '2026-04-12T00:00:30.000Z' });
  assert.equal(summary.totalEvents, 1);
  assert.equal(summary.totalsByDomain.publish, 1);
});

test('resolveUsageQuotaPlan derives fallback plan from entitlements', () => {
  assert.equal(resolveUsageQuotaPlan(undefined, ['studio.team']), 'studio');
  assert.equal(resolveUsageQuotaPlan(undefined, ['credits.compute']), 'pro');
  assert.equal(resolveUsageQuotaPlan(undefined, ['free.local']), 'free');
});

test('buildUsageQuotaSnapshot returns per-domain limits and remaining usage', () => {
  const summary = buildUsageAccountSummary('acct-usage', [
    createUsageMeteringEvent({
      accountId: 'acct-usage',
      domain: 'execute',
      action: 'execute-compiled-output',
      unit: 'request',
      unitsConsumed: 2,
      occurredAt: '2026-04-13T00:00:00.000Z'
    }),
    createUsageMeteringEvent({
      accountId: 'acct-usage',
      domain: 'marketplace-install',
      action: 'install-listing',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: '2026-04-13T00:01:00.000Z'
    })
  ]);

  const quotas = buildUsageQuotaSnapshot(summary, 'pro');
  assert.equal(quotas.execute.limit, 2);
  assert.equal(quotas.execute.used, 2);
  assert.equal(quotas.execute.remaining, 0);
  assert.equal(quotas.execute.exhausted, true);
  assert.equal(quotas.publish.limit, 0);
  assert.equal(quotas.publish.exhausted, true);
  assert.equal(quotas['marketplace-install'].limit, 3);
  assert.equal(quotas['marketplace-install'].remaining, 2);
  // P30-4: learning domain should be included in quota snapshot
  assert.equal(quotas.learning.limit, 10);
  assert.equal(quotas.learning.used, 0);
  assert.equal(quotas.learning.remaining, 10);
  assert.equal(quotas.learning.exhausted, false);
});
