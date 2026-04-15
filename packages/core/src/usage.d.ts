import { AccountPlan, CreateUsageMeteringEventInput, EntitlementKey, UsageAccountSummary, UsageMeteringDomain, UsageMeteringEvent, UsageMeteringEventFilter, UsageQuotaSnapshot } from './types';
export declare const USAGE_DOMAIN_QUOTA_LIMITS: Record<UsageMeteringDomain, Record<AccountPlan, number>>;
export declare function createUsageMeteringEvent(input: CreateUsageMeteringEventInput): UsageMeteringEvent;
export declare function buildUsageAccountSummary(accountId: string, events: UsageMeteringEvent[]): UsageAccountSummary;
export declare function resolveUsageQuotaPlan(plan?: AccountPlan, entitlements?: EntitlementKey[]): AccountPlan;
export declare function buildUsageQuotaSnapshot(summary: UsageAccountSummary, plan?: AccountPlan, entitlements?: EntitlementKey[]): UsageQuotaSnapshot;
export interface UsageLedgerStore {
    append(event: UsageMeteringEvent): UsageMeteringEvent;
    listByAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageMeteringEvent[];
    listByWorkspace(accountId: string, workspaceId: string): UsageMeteringEvent[];
    summarizeAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageAccountSummary;
}
export declare function createInMemoryUsageLedgerStore(): UsageLedgerStore;
