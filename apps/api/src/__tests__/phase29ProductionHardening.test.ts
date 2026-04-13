/**
 * Phase 29 — Production Hardening tests.
 *
 * Covers:
 *  P29-3: /execute/stream completed event includes unified provider telemetry shape
 *  P29-4: Streaming smoke — malformed body returns an error event, not a crash
 *  P29-5: Stripe webhook idempotency — duplicate event ID returns alreadyProcessed
 *  P29-5: Stripe webhook bad signature returns 401
 *  P29-6: Execute quota pre-guard fires 403 before dispatching to provider (non-dry-run)
 *  P29-6: Publish quota pre-guard fires 403 before dispatching (non-dry-run)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';
import {
  createInMemoryUsageLedgerStore,
  signWebhookPayload
} from '@prompt-compiler/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SseEvent {
  event: string;
  data: unknown;
}

function parseSseEvents(body: string): SseEvent[] {
  const blocks = body
    .split('\n\n')
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.flatMap<SseEvent>((block) => {
    const lines = block.split('\n');
    const eventLine = lines.find((l) => l.startsWith('event:'));
    const dataLine = lines.find((l) => l.startsWith('data:'));
    if (!eventLine || !dataLine) return [];
    const event = eventLine.slice('event:'.length).trim();
    const rawData = dataLine.slice('data:'.length).trim();
    let data: unknown = rawData;
    try { data = JSON.parse(rawData); } catch { /* leave as string */ }
    return [{ event, data }];
  });
}

async function withServer(
  fn: (port: number) => Promise<void>,
  serverOptions: Parameters<typeof createServer>[0] = {}
): Promise<void> {
  const server = createServer({ authConfig: { bypassAuth: true }, ...serverOptions });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function makeStripeWebhookBody(eventId: string, type: string): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: {
      object: {
        id: 'cs_test_123',
        customer: 'cus_test_123',
        metadata: { accountId: 'acct-test', targetPlan: 'pro' }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// P29-3: Unified provider telemetry on completed SSE event
// ---------------------------------------------------------------------------

test('phase29 P29-3: /execute/stream completed event includes telemetry shape', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'test stream telemetry',
        target: 'suno',
        bundleId: 'bundle-telemetry-test',
        profileId: 'profile-test',
        provider: { id: 'dry-test', type: 'dry-run' }
      })
    });

    assert.equal(response.status, 200);
    const body = await response.text();
    const events = parseSseEvents(body);

    const completed = events.find((e) => e.event === 'completed');
    assert.ok(completed, 'completed event must be present');

    const data = completed!.data as {
      result?: unknown;
      telemetry?: {
        provider?: string;
        isDryRun?: boolean;
        latencyMs?: number | null;
        estimatedTokens?: number | null;
        completedAt?: string;
      };
    };

    assert.ok(data.telemetry, 'completed event must include telemetry');
    assert.equal(data.telemetry!.provider, 'dry-run', 'telemetry.provider must match request provider type');
    assert.equal(data.telemetry!.isDryRun, true, 'telemetry.isDryRun must be true for dry-run provider');
    assert.ok(typeof data.telemetry!.completedAt === 'string', 'telemetry.completedAt must be a string');
  });
});

// ---------------------------------------------------------------------------
// P29-4: Malformed JSON body for /execute/stream returns error event (no crash)
// ---------------------------------------------------------------------------

test('phase29 P29-4: /execute/stream with malformed JSON body returns 400', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'NOT VALID JSON{'
    });

    // Malformed JSON before headers are written → 400 error response (not SSE).
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error?.code, 'BAD_REQUEST');
  });
});

test('phase29 P29-4: /execute/stream with missing required fields returns 400', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleId: 'only-bundle-id-no-content-no-provider' })
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.ok(payload.error?.code === 'VALIDATION_ERROR' || payload.error?.code === 'BAD_REQUEST');
  });
});

// ---------------------------------------------------------------------------
// P29-5: Stripe webhook idempotency
// ---------------------------------------------------------------------------

test('phase29 P29-5: Stripe webhook duplicate event ID returns alreadyProcessed', async () => {
  await withServer(async (port) => {
    const eventId = 'evt_idempotency_test_001';
    const body = makeStripeWebhookBody(eventId, 'checkout.session.completed');
    const signature = signWebhookPayload(body, 'stripe-dev-secret');

    const headers = {
      'Content-Type': 'application/json',
      'stripe-signature': signature
    };

    // First call — should be processed normally.
    const first = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers,
      body
    });
    assert.equal(first.status, 200, 'first webhook call must succeed');
    const firstPayload = (await first.json()) as { ok?: boolean; result?: { alreadyProcessed?: boolean } };
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.result?.alreadyProcessed, undefined, 'first call must not be flagged alreadyProcessed');

    // Second call with same event ID — must return alreadyProcessed.
    const second = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers,
      body
    });
    assert.equal(second.status, 200, 'duplicate webhook must return 200 (ack)');
    const secondPayload = (await second.json()) as { ok?: boolean; result?: { alreadyProcessed?: boolean; eventId?: string } };
    assert.equal(secondPayload.ok, true);
    assert.equal(secondPayload.result?.alreadyProcessed, true, 'duplicate call must be flagged alreadyProcessed');
    assert.equal(secondPayload.result?.eventId, eventId, 'alreadyProcessed response must echo the event ID');
  });
});

test('phase29 P29-5: Stripe webhook bad signature returns 401', async () => {
  await withServer(async (port) => {
    const body = makeStripeWebhookBody('evt_bad_sig', 'checkout.session.completed');

    const response = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'invalid-signature-value'
      },
      body
    });

    assert.equal(response.status, 401);
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error?.code, 'UNAUTHORIZED');
  });
});

test('phase29 P29-5: Stripe webhook missing signature returns 401', async () => {
  await withServer(async (port) => {
    const body = makeStripeWebhookBody('evt_no_sig', 'checkout.session.completed');

    const response = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    assert.equal(response.status, 401);
  });
});

// ---------------------------------------------------------------------------
// P29-6: Quota pre-guard for /execute/stream and /execute
// ---------------------------------------------------------------------------

test('phase29 P29-6: /execute/stream quota check fires 403 for free plan non-dry-run', async () => {
  // execute.free = 0, so any hosted-mode non-dry-run request on free plan must be denied.
  const usageLedgerStore = createInMemoryUsageLedgerStore();

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-account-id': 'acct-quota-test'
      },
      body: JSON.stringify({
        content: 'quota test stream',
        target: 'suno',
        bundleId: 'bundle-quota',
        profileId: 'profile-quota',
        provider: { id: 'openai-test', type: 'openai-compatible', baseUrl: 'http://127.0.0.1:9999', model: 'gpt-test', apiKey: 'test' },
        plan: 'free',
        mode: 'hosted',
        entitlements: ['free.local']
      })
    });

    // Must be denied before dispatching to any provider.
    assert.equal(response.status, 403, 'free plan + hosted mode must hit quota/entitlement guard');
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.ok(
      payload.error?.code === 'FORBIDDEN' || payload.error?.code === 'UNAUTHORIZED',
      `expected FORBIDDEN or UNAUTHORIZED, got ${payload.error?.code}`
    );
  }, { usageLedgerStore });
});

test('phase29 P29-6: /execute (non-stream) quota check fires 403 for free plan non-dry-run', async () => {
  const usageLedgerStore = createInMemoryUsageLedgerStore();

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-account-id': 'acct-quota-test'
      },
      body: JSON.stringify({
        content: 'quota test execute',
        target: 'suno',
        bundleId: 'bundle-quota-2',
        profileId: 'profile-quota',
        provider: { id: 'openai-test', type: 'openai-compatible', baseUrl: 'http://127.0.0.1:9999', model: 'gpt-test', apiKey: 'test' },
        plan: 'free',
        mode: 'hosted',
        entitlements: ['free.local']
      })
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.ok(
      payload.error?.code === 'FORBIDDEN' || payload.error?.code === 'UNAUTHORIZED',
      `expected FORBIDDEN or UNAUTHORIZED, got ${payload.error?.code}`
    );
  }, { usageLedgerStore });
});

test('phase29 P29-6: /publish/jobs quota check fires 403 for free plan', async () => {
  const usageLedgerStore = createInMemoryUsageLedgerStore();

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-account-id': 'acct-quota-test'
      },
      body: JSON.stringify({
        bundleId: 'bundle-publish-quota',
        profileId: 'profile-quota',
        target: { id: 'webhook-target', kind: 'webhook', url: 'http://127.0.0.1:9999', secret: 'sec' },
        plan: 'free',
        mode: 'hosted',
        entitlements: ['free.local']
      })
    });

    // publish.free = 0, so any hosted-mode publish on free plan must be denied.
    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };
    assert.equal(payload.ok, false);
    assert.ok(
      payload.error?.code === 'FORBIDDEN' || payload.error?.code === 'UNAUTHORIZED',
      `expected FORBIDDEN or UNAUTHORIZED, got ${payload.error?.code}`
    );
  }, { usageLedgerStore });
});

// ---------------------------------------------------------------------------
// P29-3: Repeated streaming run — both events arrive in order
// ---------------------------------------------------------------------------

test('phase29 P29-3: /execute/stream dry-run emits started, progress, completed in order with telemetry', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'event order telemetry check',
        target: 'udio',
        bundleId: 'bundle-order-test',
        profileId: 'profile-order',
        provider: { id: 'dry-order', type: 'dry-run' }
      })
    });

    assert.equal(response.status, 200);
    const body = await response.text();
    const events = parseSseEvents(body);
    const names = events.map((e) => e.event);

    assert.ok(names.includes('started'), 'must include started event');
    assert.ok(names.includes('completed'), 'must include completed event');

    const startedIdx = names.indexOf('started');
    const completedIdx = names.lastIndexOf('completed');
    assert.ok(startedIdx < completedIdx, 'started must precede completed');

    const completed = events[completedIdx];
    const completedData = completed.data as { telemetry?: { provider?: string; completedAt?: string } };
    assert.ok(completedData.telemetry?.completedAt, 'completedAt must be set');
  });
});
