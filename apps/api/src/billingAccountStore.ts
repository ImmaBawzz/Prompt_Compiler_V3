import { AccountPlan } from '@prompt-compiler/core';

export type BillingProvider = 'stripe';
export type BillingSubscriptionStatus = 'inactive' | 'checkout_pending' | 'active' | 'past_due' | 'canceled';

export interface BillingAccountRecord {
  accountId: string;
  provider: BillingProvider;
  plan: AccountPlan;
  pendingPlan?: AccountPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  subscriptionStatus: BillingSubscriptionStatus;
  creditBalance: number | null;
  portalEnabled: boolean;
  updatedAt: string;
}

export interface UpsertBillingAccountInput {
  accountId: string;
  provider?: BillingProvider;
  plan?: AccountPlan;
  pendingPlan?: AccountPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  subscriptionStatus?: BillingSubscriptionStatus;
  creditBalance?: number | null;
  portalEnabled?: boolean;
  updatedAt?: string;
}

export interface BillingAccountStore {
  get(accountId: string): BillingAccountRecord | undefined;
  getByStripeCustomerId(customerId: string): BillingAccountRecord | undefined;
  upsert(input: UpsertBillingAccountInput): BillingAccountRecord;
}

export function createInMemoryBillingAccountStore(): BillingAccountStore {
  const accounts = new Map<string, BillingAccountRecord>();

  return {
    get(accountId: string): BillingAccountRecord | undefined {
      return accounts.get(accountId);
    },

    getByStripeCustomerId(customerId: string): BillingAccountRecord | undefined {
      for (const record of accounts.values()) {
        if (record.stripeCustomerId === customerId) {
          return record;
        }
      }
      return undefined;
    },

    upsert(input: UpsertBillingAccountInput): BillingAccountRecord {
      const existing = accounts.get(input.accountId);
      const next: BillingAccountRecord = {
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
      accounts.set(input.accountId, next);
      return next;
    }
  };
}
