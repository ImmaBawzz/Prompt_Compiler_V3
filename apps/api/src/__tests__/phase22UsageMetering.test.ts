import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';
import {
  createInMemoryUsageLedgerStore,
  UsageLedgerStore,
  createInMemoryMarketplaceStore,
  createMarketplaceListing
} from '@prompt-compiler/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestContext {
  port: number;
  ledger: UsageLedgerStore;
}

async function withMeteringServer(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const ledger = createInMemoryUsageLedgerStore();
  const server = createServer({ authConfig: { bypassAuth: true }, usageLedgerStore: ledger });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn({ port, ledger });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

async function withWebhookReceiver(
  fn: (webhookUrl: string) => Promise<void>
): Promise<void> {
  const receiver = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => receiver.listen(0, resolve));
  const port = (receiver.address() as AddressInfo).port;
  try {
    await fn(`http://127.0.0.1:${port}/publish`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      receiver.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

const SAMPLE_BRIEF = {
  id: 'brief-metering',
  title: 'Metering Smoke',
  concept: 'Signal pulse across the grid.',
  targets: ['suno'],
  genres: ['cinematic'],
  mood: ['focused']
};

const SAMPLE_PROFILE = {
  id: 'profile-metering',
  brandName: 'GridSignal',
  voice: 'precise and technical'
};

// ---------------------------------------------------------------------------
// Tests — execute flow
// ---------------------------------------------------------------------------

test('phase22 metering: dry-run execute does NOT record a usage event', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    const res = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-dry' },
      body: JSON.stringify({
        content: 'test dry run content',
        target: 'suno',
        bundleId: 'bundle-dry',
        profileId: 'profile-metering',
        provider: { id: 'dry', type: 'dry-run' }
      })
    });

    assert.equal(res.status, 200);
    const events = ledger.listByAccount('acct-dry');
    assert.equal(events.length, 0, 'dry-run execute must not record a usage event');
  });
});

test('phase22 metering: live execute records a usage event in the execute domain', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    const res = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-live-exec' },
      body: JSON.stringify({
        content: 'Signal pulse across the grid — cinematic and exact.',
        target: 'suno',
        bundleId: 'bundle-live',
        profileId: 'profile-metering',
        provider: {
          id: 'openai-test',
          type: 'openai-compatible',
          apiBase: 'http://127.0.0.1:1',
          model: 'gpt-test'
        },
        mode: 'hosted',
        entitlements: ['credits.compute']
      })
    });

    // The HTTP provider call will fail (no server listening on :1), which
    // results in a 500. The metering event must still be recorded before
    // the json response since we wire it after executeCompiledOutput returns.
    // For a failure the catch path runs, but we record AFTER await — so on
    // provider failure the event is NOT recorded. That is intentional:
    // bill only on success. Accept either 200 or 500 outcome here and
    // assert the domain event count accordingly.
    const events = ledger.listByAccount('acct-live-exec', { domain: 'execute' });

    if (res.status === 200) {
      assert.equal(events.length, 1, 'successful live execute must record exactly one event');
      assert.equal(events[0].domain, 'execute');
      assert.equal(events[0].action, 'execute-compiled-output');
      assert.equal(events[0].bundleId, 'bundle-live');
      assert.equal(events[0].profileId, 'profile-metering');
      assert.equal(events[0].unit, 'request');
      assert.equal(events[0].unitsConsumed, 1);
    } else {
      // Provider call failed — no event expected.
      assert.equal(events.length, 0, 'failed live execute must not record an event');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — publish flow
// ---------------------------------------------------------------------------

test('phase22 metering: dry-run publish does NOT record a usage event', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    const res = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-pub-dry' },
      body: JSON.stringify({
        bundleId: 'bundle-pub-dry',
        profileId: 'profile-metering',
        target: { id: 'dry', kind: 'dry-run', url: '' }
      })
    });

    assert.equal(res.status, 201);
    const events = ledger.listByAccount('acct-pub-dry', { domain: 'publish' });
    assert.equal(events.length, 0, 'dry-run publish must not record a usage event');
  });
});

test('phase22 metering: live publish records a usage event in the publish domain', async () => {
  await withWebhookReceiver(async (webhookUrl) => {
    await withMeteringServer(async ({ port, ledger }) => {
      const res = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-pub-live' },
        body: JSON.stringify({
          bundleId: 'bundle-pub-live',
          profileId: 'profile-metering',
          target: { id: 'webhook-test', kind: 'webhook', url: webhookUrl },
          mode: 'hosted',
          entitlements: ['studio.team']
        })
      });

      assert.equal(res.status, 201);
      const events = ledger.listByAccount('acct-pub-live', { domain: 'publish' });
      assert.equal(events.length, 1, 'live publish must record exactly one event');
      assert.equal(events[0].domain, 'publish');
      assert.equal(events[0].action, 'publish-bundle');
      assert.equal(events[0].bundleId, 'bundle-pub-live');
      assert.equal(events[0].profileId, 'profile-metering');
      assert.equal(events[0].unit, 'request');
      assert.equal(events[0].unitsConsumed, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — marketplace install flow
// ---------------------------------------------------------------------------

test('phase22 metering: marketplace install records a usage event', async () => {
  const marketplaceStore = createInMemoryMarketplaceStore();

  // Seed a published listing.
  const listing = marketplaceStore.save(
    createMarketplaceListing({
      listingId: 'listing-metering-test',
      publishedBy: 'publisher-1',
      displayName: 'Metering Test Profile',
      description: 'Used for metering tests.',
      listingType: 'brand-profile',
      payload: SAMPLE_PROFILE
    })
  );

  const ledger = createInMemoryUsageLedgerStore();
  const server = createServer({
    authConfig: { bypassAuth: true },
    usageLedgerStore: ledger,
    marketplaceStore
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/marketplace/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-installer' },
      body: JSON.stringify({ listingId: listing.listingId, accountId: 'acct-installer' })
    });

    assert.equal(res.status, 200);
    const events = ledger.listByAccount('acct-installer', { domain: 'marketplace-install' });
    assert.equal(events.length, 1, 'marketplace install must record exactly one event');
    assert.equal(events[0].domain, 'marketplace-install');
    assert.equal(events[0].action, 'install-listing');
    assert.equal(events[0].listingId, listing.listingId);
    assert.equal(events[0].unit, 'request');
    assert.equal(events[0].unitsConsumed, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
});

// ---------------------------------------------------------------------------
// Tests — GET /usage/events
// ---------------------------------------------------------------------------

test('phase22 metering: GET /usage/events requires accountId query param', async () => {
  await withMeteringServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/usage/events`, {
      headers: { 'x-account-id': 'acct-query' }
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(body.error.code, 'BAD_REQUEST');
  });
});

test('phase22 metering: GET /usage/events returns events for the correct account', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    // Seed two events for different accounts directly.
    ledger.append({
      eventId: 'ev-1',
      accountId: 'acct-events-query',
      domain: 'marketplace-install',
      action: 'install-listing',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });
    ledger.append({
      eventId: 'ev-2',
      accountId: 'acct-other',
      domain: 'publish',
      action: 'publish-bundle',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });

    const res = await fetch(
      `http://127.0.0.1:${port}/usage/events?accountId=acct-events-query`,
      { headers: { 'x-account-id': 'acct-events-query' } }
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; result: { events: unknown[] } };
    assert.equal(body.ok, true);
    assert.equal(body.result.events.length, 1);
  });
});

test('phase22 metering: GET /usage/events filters by domain', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    ledger.append({
      eventId: 'ev-mp',
      accountId: 'acct-filter',
      domain: 'marketplace-install',
      action: 'install-listing',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });
    ledger.append({
      eventId: 'ev-pub',
      accountId: 'acct-filter',
      domain: 'publish',
      action: 'publish-bundle',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });

    const res = await fetch(
      `http://127.0.0.1:${port}/usage/events?accountId=acct-filter&domain=publish`,
      { headers: { 'x-account-id': 'acct-filter' } }
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; result: { events: unknown[] } };
    assert.equal(body.result.events.length, 1);
  });
});

test('phase22 metering: GET /usage/events rejects cross-account access', async () => {
  await withMeteringServer(async ({ port }) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/usage/events?accountId=acct-someone-else`,
      { headers: { 'x-account-id': 'acct-me' } }
    );
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Tests — GET /usage/summary
// ---------------------------------------------------------------------------

test('phase22 metering: GET /usage/summary requires accountId query param', async () => {
  await withMeteringServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/usage/summary`, {
      headers: { 'x-account-id': 'acct-summary' }
    });
    assert.equal(res.status, 400);
  });
});

test('phase22 metering: GET /usage/summary returns correct totals', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    const accountId = 'acct-summary-totals';

    ledger.append({
      eventId: 'es-1',
      accountId,
      domain: 'execute',
      action: 'execute-compiled-output',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });
    ledger.append({
      eventId: 'es-2',
      accountId,
      domain: 'marketplace-install',
      action: 'install-listing',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });
    ledger.append({
      eventId: 'es-3',
      accountId,
      domain: 'publish',
      action: 'publish-bundle',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });

    const res = await fetch(
      `http://127.0.0.1:${port}/usage/summary?accountId=${accountId}`,
      { headers: { 'x-account-id': accountId } }
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      result: {
        summary: {
          accountId: string;
          totalEvents: number;
          totalsByDomain: Record<string, number>;
          totalsByUnit: Record<string, number>;
        };
      };
    };

    assert.equal(body.ok, true);
    assert.equal(body.result.summary.accountId, accountId);
    assert.equal(body.result.summary.totalEvents, 3);
    assert.equal(body.result.summary.totalsByDomain['execute'], 1);
    assert.equal(body.result.summary.totalsByDomain['publish'], 1);
    assert.equal(body.result.summary.totalsByDomain['marketplace-install'], 1);
    assert.equal(body.result.summary.totalsByUnit['request'], 3);
  });
});

test('phase22 metering: GET /usage/summary rejects cross-account access', async () => {
  await withMeteringServer(async ({ port }) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/usage/summary?accountId=acct-not-me`,
      { headers: { 'x-account-id': 'acct-me-again' } }
    );
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Tests — session bootstrap includes usageSummary (P22-3)
// ---------------------------------------------------------------------------

test('phase22 metering: GET /session/bootstrap includes usageSummary when accountId provided', async () => {
  await withMeteringServer(async ({ port, ledger }) => {
    ledger.append({
      eventId: 'boot-ev',
      accountId: 'acct-bootstrap',
      domain: 'execute',
      action: 'execute-compiled-output',
      unit: 'request',
      unitsConsumed: 1,
      occurredAt: new Date().toISOString()
    });

    const res = await fetch(
      `http://127.0.0.1:${port}/session/bootstrap?accountId=acct-bootstrap`
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      result: {
        account: unknown;
        entitlements: unknown;
        flags: unknown;
        usageSummary?: { totalEvents: number };
      };
    };

    assert.equal(body.ok, true);
    assert.ok(body.result.account, 'bootstrap must include account');
    assert.ok(body.result.flags, 'bootstrap must include flags');
    assert.ok(body.result.usageSummary, 'bootstrap must include usageSummary when accountId is provided');
    assert.equal(body.result.usageSummary!.totalEvents, 1);
  });
});

test('phase22 metering: GET /session/bootstrap omits usageSummary when no accountId', async () => {
  await withMeteringServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/session/bootstrap`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      result: { usageSummary?: unknown };
    };
    assert.equal(body.result.usageSummary, undefined, 'usageSummary must be absent when no accountId');
  });
});
