import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteBillingAccountStore } from '../sqliteBillingAccountStore';

test('SQLite billing account store upserts and looks up accounts by id and Stripe customer', () => {
  const store = createSqliteBillingAccountStore(':memory:');
  try {
    store.upsert({
      accountId: 'acct-billing',
      plan: 'pro',
      pendingPlan: 'studio',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      stripeCheckoutSessionId: 'cs_123',
      subscriptionStatus: 'checkout_pending',
      creditBalance: 17,
      portalEnabled: true,
      updatedAt: '2026-04-13T00:00:00.000Z'
    });

    store.upsert({
      accountId: 'acct-billing',
      subscriptionStatus: 'active',
      pendingPlan: undefined,
      plan: 'studio',
      creditBalance: 42,
      updatedAt: '2026-04-13T00:05:00.000Z'
    });

    const account = store.get('acct-billing');
    assert.ok(account);
    assert.equal(account.plan, 'studio');
    assert.equal(account.pendingPlan, 'studio');
    assert.equal(account.subscriptionStatus, 'active');
    assert.equal(account.stripeCustomerId, 'cus_123');
    assert.equal(account.creditBalance, 42);
    assert.equal(account.portalEnabled, true);

    const byCustomer = store.getByStripeCustomerId('cus_123');
    assert.deepEqual(byCustomer, account);
  } finally {
    store.close();
  }
});

test('SQLite billing account store persists across reopen for the same db file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-billing-store-'));
  const dbPath = path.join(tmpDir, 'billing-accounts.db');

  const writer = createSqliteBillingAccountStore(dbPath);
  writer.upsert({
    accountId: 'acct-persist',
    plan: 'pro',
    stripeCustomerId: 'cus_persist',
    stripeSubscriptionId: 'sub_persist',
    subscriptionStatus: 'active',
    creditBalance: 88,
    portalEnabled: true,
    updatedAt: '2026-04-13T00:10:00.000Z'
  });
  writer.close();

  const reader = createSqliteBillingAccountStore(dbPath);
  try {
    const account = reader.get('acct-persist');
    assert.ok(account);
    assert.equal(account.plan, 'pro');
    assert.equal(account.creditBalance, 88);
    assert.equal(account.subscriptionStatus, 'active');

    const byCustomer = reader.getByStripeCustomerId('cus_persist');
    assert.ok(byCustomer);
    assert.equal(byCustomer.accountId, 'acct-persist');
    assert.equal(byCustomer.portalEnabled, true);
  } finally {
    reader.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});
