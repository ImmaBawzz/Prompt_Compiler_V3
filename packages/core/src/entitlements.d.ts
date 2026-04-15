import { AccountPlan, AccessMode, EntitlementKey, HostedFeatureKey, HostedSessionBootstrap, ResolveEntitlementsInput, ResolvedEntitlements } from './types';
export declare const ACCOUNT_PLAN_VALUES: readonly AccountPlan[];
export declare const ACCESS_MODE_VALUES: readonly AccessMode[];
export declare const ENTITLEMENT_VALUES: readonly EntitlementKey[];
export declare const HOSTED_FEATURE_VALUES: readonly HostedFeatureKey[];
export declare function isAccountPlan(value: string | null | undefined): value is AccountPlan;
export declare function isAccessMode(value: string | null | undefined): value is AccessMode;
export declare function isEntitlementKey(value: string | null | undefined): value is EntitlementKey;
export declare function resolveEntitlements(input?: ResolveEntitlementsInput): ResolvedEntitlements;
export declare function hasFeatureAccess(bundle: ResolvedEntitlements, key: HostedFeatureKey): boolean;
export declare function buildHostedSessionBootstrap(input?: ResolveEntitlementsInput): HostedSessionBootstrap;
export interface EntitlementUXMessage {
    /** User-friendly title or header (short, 1 line). */
    title: string;
    /** Detailed message body. Markdown-safe for extension webviews. */
    message: string;
    /** Suggested action or upgrade path URL (e.g., "https://upgrade.example.com"). */
    upgradeUrl?: string;
    /** Human-readable action label (e.g., "Upgrade to Pro"). */
    actionLabel?: string;
    /** Comma-separated plan recommendation (e.g., "pro" or "studio"). */
    recommendedPlan?: string;
}
/**
 * Generate a user-friendly entitlement error message for a feature the user lacks.
 * Surfaces the upgrade path and recommended plan.
 */
export declare function generateEntitlementUXMessage(featureKey: HostedFeatureKey, currentPlan?: AccountPlan): EntitlementUXMessage;
