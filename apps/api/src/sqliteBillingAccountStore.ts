import { AccountPlan, isAccountPlan } from '@prompt-compiler/core';
import {
  BillingAccountRecord,
  BillingAccountStore,
  BillingProvider,
  BillingSubscriptionStatus,
  UpsertBillingAccountInput
} from './billingAccountStore';

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

const DDL = `
  CREATE TABLE IF NOT EXISTS billing_accounts (
    account_id                  TEXT PRIMARY KEY,
    provider                    TEXT NOT NULL,
    plan                        TEXT NOT NULL,
    pending_plan                TEXT,
    stripe_customer_id          TEXT,
    stripe_subscription_id      TEXT,
    stripe_checkout_session_id  TEXT,
    subscription_status         TEXT NOT NULL,
    credit_balance              REAL,
    portal_enabled              INTEGER NOT NULL,
    updated_at                  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_billing_accounts_customer
    ON billing_accounts(stripe_customer_id);
`;

const VALID_SUBSCRIPTION_STATUSES: BillingSubscriptionStatus[] = [
  'inactive',
  'checkout_pending',
  'active',
  'past_due',
  'canceled'
];

function isBillingProvider(value: unknown): value is BillingProvider {
  return value === 'stripe';
}

function isBillingSubscriptionStatus(value: unknown): value is BillingSubscriptionStatus {
  return typeof value === 'string' && VALID_SUBSCRIPTION_STATUSES.includes(value as BillingSubscriptionStatus);
}

function readOptionalPlan(value: unknown): AccountPlan | undefined {
  return typeof value === 'string' && isAccountPlan(value) ? value : undefined;
}

function rowToBillingAccount(row: Record<string, unknown> | undefined): BillingAccountRecord | undefined {
  if (!row) {
    return undefined;
  }

  const accountId = row['account_id'];
  const provider = row['provider'];
  const plan = row['plan'];
  const subscriptionStatus = row['subscription_status'];
  const updatedAt = row['updated_at'];

  if (
    typeof accountId !== 'string' ||
    !isBillingProvider(provider) ||
    typeof plan !== 'string' ||
    !isAccountPlan(plan) ||
    !isBillingSubscriptionStatus(subscriptionStatus) ||
    typeof updatedAt !== 'string'
  ) {
    return undefined;
  }

  const creditBalanceValue = row['credit_balance'];
  const creditBalance =
    typeof creditBalanceValue === 'number'
      ? creditBalanceValue
      : creditBalanceValue === null || creditBalanceValue === undefined
        ? null
        : Number.isFinite(Number(creditBalanceValue))
          ? Number(creditBalanceValue)
          : null;

  return {
    accountId,
    provider,
    plan,
    pendingPlan: readOptionalPlan(row['pending_plan']),
    stripeCustomerId: typeof row['stripe_customer_id'] === 'string' ? row['stripe_customer_id'] : undefined,
    stripeSubscriptionId: typeof row['stripe_subscription_id'] === 'string' ? row['stripe_subscription_id'] : undefined,
    stripeCheckoutSessionId: typeof row['stripe_checkout_session_id'] === 'string' ? row['stripe_checkout_session_id'] : undefined,
    subscriptionStatus,
    creditBalance,
    portalEnabled: Boolean(row['portal_enabled']),
    updatedAt
  };
}

function mergeBillingAccount(existing: BillingAccountRecord | undefined, input: UpsertBillingAccountInput): BillingAccountRecord {
  return {
    accountId: input.accountId,
    provider: input.provider ?? existing?.provider ?? 'stripe',
    plan: input.plan ?? existing?.plan ?? 'free',
    pendingPlan: input.pendingPlan !== undefined ? input.pendingPlan : existing?.pendingPlan,
    stripeCustomerId: input.stripeCustomerId ?? existing?.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId ?? existing?.stripeSubscriptionId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? existing?.stripeCheckoutSessionId,
    subscriptionStatus: input.subscriptionStatus ?? existing?.subscriptionStatus ?? 'inactive',
    creditBalance: input.creditBalance !== undefined ? input.creditBalance : existing?.creditBalance ?? null,
    portalEnabled: input.portalEnabled ?? existing?.portalEnabled ?? false,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export function createSqliteBillingAccountStore(dbPath: string): BillingAccountStore & { close(): void } {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const stmtGet = db.prepare('SELECT * FROM billing_accounts WHERE account_id = ?');
  const stmtGetByCustomer = db.prepare('SELECT * FROM billing_accounts WHERE stripe_customer_id = ?');
  const stmtUpsert = db.prepare(`
    INSERT INTO billing_accounts (
      account_id,
      provider,
      plan,
      pending_plan,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      subscription_status,
      credit_balance,
      portal_enabled,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET
      provider = excluded.provider,
      plan = excluded.plan,
      pending_plan = excluded.pending_plan,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_checkout_session_id = excluded.stripe_checkout_session_id,
      subscription_status = excluded.subscription_status,
      credit_balance = excluded.credit_balance,
      portal_enabled = excluded.portal_enabled,
      updated_at = excluded.updated_at
  `);

  return {
    get(accountId: string): BillingAccountRecord | undefined {
      return rowToBillingAccount(stmtGet.get(accountId));
    },

    getByStripeCustomerId(customerId: string): BillingAccountRecord | undefined {
      return rowToBillingAccount(stmtGetByCustomer.get(customerId));
    },

    upsert(input: UpsertBillingAccountInput): BillingAccountRecord {
      const next = mergeBillingAccount(this.get(input.accountId), input);
      stmtUpsert.run(
        next.accountId,
        next.provider,
        next.plan,
        next.pendingPlan ?? null,
        next.stripeCustomerId ?? null,
        next.stripeSubscriptionId ?? null,
        next.stripeCheckoutSessionId ?? null,
        next.subscriptionStatus,
        next.creditBalance,
        next.portalEnabled ? 1 : 0,
        next.updatedAt
      );
      return next;
    },

    close(): void {
      db.close();
    }
  };
}
