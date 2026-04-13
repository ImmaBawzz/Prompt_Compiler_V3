import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { signWebhookPayload } from '@prompt-compiler/core';
import { createInMemoryBillingAccountStore } from '../billingAccountStore';
import { createServer } from '../server';

const STRIPE_SECRET = 'stripe-test-secret';

async function withBillingServer(
  fn: (ctx: { port: number; billingStore: ReturnType<typeof createInMemoryBillingAccountStore> }) => Promise<void>
): Promise<void> {
  const billingStore = createInMemoryBillingAccountStore();
  const server = createServer({
    authConfig: { bypassAuth: true },
    billingAccountStore: billingStore,
    stripeWebhookSecret: STRIPE_SECRET
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn({ port, billingStore });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('phase27 billing: checkout creates a pending Stripe session and stores pending plan', async () => {
  await withBillingServer(async ({ port, billingStore }) => {
    const response = await fetch(`http://127.0.0.1:${port}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-billing' },
      body: JSON.stringify({
        accountId: 'acct-billing',
        plan: 'pro',
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel'
      })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      ok: boolean;
      result: { provider: string; sessionId: string; checkoutUrl: string; targetPlan: string; status: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.result.provider, 'stripe');
    assert.equal(body.result.targetPlan, 'pro');
    assert.match(body.result.sessionId, /^cs_test_/);
    assert.match(body.result.checkoutUrl, /^https:\/\/checkout\.stripe\.com\/pay\//);

    const account = billingStore.get('acct-billing');
    assert.ok(account);
    assert.equal(account.pendingPlan, 'pro');
    assert.equal(account.subscriptionStatus, 'checkout_pending');
  });
});

test('phase27 billing: webhook rejects invalid signature', async () => {
  await withBillingServer(async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'bad-signature' },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_invalid', customer: 'cus_invalid', metadata: { accountId: 'acct-billing', targetPlan: 'pro' } } }
      })
    });

    assert.equal(response.status, 401);
  });
});

test('phase27 billing: webhook activates plan and bootstrap reflects stored billing state', async () => {
  await withBillingServer(async ({ port, billingStore }) => {
    billingStore.upsert({
      accountId: 'acct-upgrade',
      pendingPlan: 'studio',
      subscriptionStatus: 'checkout_pending',
      stripeCheckoutSessionId: 'cs_test_upgrade'
    });

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: {
            accountId: 'acct-upgrade',
            targetPlan: 'studio'
          },
          creditBalance: 99
        }
      }
    };
    const raw = JSON.stringify(event);
    const signature = signWebhookPayload(raw, STRIPE_SECRET);

    const webhookResponse = await fetch(`http://127.0.0.1:${port}/billing/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
      body: raw
    });

    assert.equal(webhookResponse.status, 200);
    const stored = billingStore.get('acct-upgrade');
    assert.ok(stored);
    assert.equal(stored.plan, 'studio');
    assert.equal(stored.subscriptionStatus, 'active');
    assert.equal(stored.stripeCustomerId, 'cus_123');
    assert.equal(stored.creditBalance, 99);

    const bootstrapResponse = await fetch(`http://127.0.0.1:${port}/session/bootstrap?accountId=acct-upgrade&mode=hosted`);
    assert.equal(bootstrapResponse.status, 200);
    const bootstrapBody = (await bootstrapResponse.json()) as {
      ok: boolean;
      result: {
        account: { plan: string };
        entitlements: { entitlements: string[]; creditBalance: number | null };
        usage?: { creditsRemaining: number | null };
      };
    };

    assert.equal(bootstrapBody.ok, true);
    assert.equal(bootstrapBody.result.account.plan, 'studio');
    assert.deepEqual(bootstrapBody.result.entitlements.entitlements, ['free.local', 'pro.creator', 'studio.team']);
    assert.equal(bootstrapBody.result.entitlements.creditBalance, 99);
    assert.equal(bootstrapBody.result.usage?.creditsRemaining, 99);
  });
});

test('phase27 billing: portal returns Stripe customer portal URL for known customer', async () => {
  await withBillingServer(async ({ port, billingStore }) => {
    billingStore.upsert({
      accountId: 'acct-portal',
      plan: 'pro',
      stripeCustomerId: 'cus_portal',
      subscriptionStatus: 'active',
      portalEnabled: true
    });

    const response = await fetch(`http://127.0.0.1:${port}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-portal' },
      body: JSON.stringify({ accountId: 'acct-portal', returnUrl: 'http://localhost/account' })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      result: { portalUrl: string; accountId: string; provider: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.result.accountId, 'acct-portal');
    assert.equal(body.result.provider, 'stripe');
    assert.match(body.result.portalUrl, /cus_portal/);
  });
});
