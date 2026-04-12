import {
  AccountPlan,
  AccessMode,
  EntitlementKey,
  HostedFeatureKey,
  HostedSessionBootstrap,
  ResolveEntitlementsInput,
  ResolvedEntitlements
} from './types';

export const ACCOUNT_PLAN_VALUES: readonly AccountPlan[] = ['free', 'pro', 'studio'];
export const ACCESS_MODE_VALUES: readonly AccessMode[] = ['local', 'hosted'];
export const ENTITLEMENT_VALUES: readonly EntitlementKey[] = [
  'free.local',
  'pro.creator',
  'studio.team',
  'credits.compute'
];
export const HOSTED_FEATURE_VALUES: readonly HostedFeatureKey[] = [
  'local.compile',
  'local.export',
  'template-pack.default',
  'profile.sync.managed',
  'template-pack.premium',
  'export.packaging.branded',
  'workspace.shared',
  'access.rbac',
  'workflow.recipes',
  'automation.jobs',
  'compute.batch'
];

const PLAN_ENTITLEMENTS: Record<AccountPlan, readonly EntitlementKey[]> = {
  free: ['free.local'],
  pro: ['free.local', 'pro.creator'],
  studio: ['free.local', 'pro.creator', 'studio.team']
};

const FEATURE_CATALOG: Record<HostedFeatureKey, { description: string; entitlements: readonly EntitlementKey[]; hostedOnly?: boolean }> = {
  'local.compile': {
    description: 'Compile prompt bundles locally from the extension, CLI, or self-hosted API.',
    entitlements: ['free.local']
  },
  'local.export': {
    description: 'Export deterministic local artifact bundles into the workspace.',
    entitlements: ['free.local']
  },
  'template-pack.default': {
    description: 'Use the built-in default template pack and presets.',
    entitlements: ['free.local']
  },
  'profile.sync.managed': {
    description: 'Sync managed profile libraries through the hosted service.',
    entitlements: ['pro.creator', 'studio.team'],
    hostedOnly: true
  },
  'template-pack.premium': {
    description: 'Use premium template packs and preset bundles.',
    entitlements: ['pro.creator', 'studio.team'],
    hostedOnly: true
  },
  'export.packaging.branded': {
    description: 'Generate branded export variants and packaging presets.',
    entitlements: ['pro.creator', 'studio.team'],
    hostedOnly: true
  },
  'workspace.shared': {
    description: 'Access shared workspace libraries and collaborative asset stores.',
    entitlements: ['studio.team'],
    hostedOnly: true
  },
  'access.rbac': {
    description: 'Use role-based access controls for shared workspace assets.',
    entitlements: ['studio.team'],
    hostedOnly: true
  },
  'workflow.recipes': {
    description: 'Use workflow recipes and review trails in hosted team workspaces.',
    entitlements: ['studio.team'],
    hostedOnly: true
  },
  'automation.jobs': {
    description: 'Submit queued automation jobs and managed workflow runs.',
    entitlements: ['studio.team'],
    hostedOnly: true
  },
  'compute.batch': {
    description: 'Use metered hosted batch operations and heavy transforms.',
    entitlements: ['credits.compute'],
    hostedOnly: true
  }
};

export function isAccountPlan(value: string | null | undefined): value is AccountPlan {
  return typeof value === 'string' && ACCOUNT_PLAN_VALUES.includes(value as AccountPlan);
}

export function isAccessMode(value: string | null | undefined): value is AccessMode {
  return typeof value === 'string' && ACCESS_MODE_VALUES.includes(value as AccessMode);
}

export function isEntitlementKey(value: string | null | undefined): value is EntitlementKey {
  return typeof value === 'string' && ENTITLEMENT_VALUES.includes(value as EntitlementKey);
}

function hasFeature(bundle: ResolvedEntitlements, key: HostedFeatureKey): boolean {
  return bundle.features.some((feature) => feature.key === key && feature.enabled);
}

export function resolveEntitlements(input: ResolveEntitlementsInput = {}): ResolvedEntitlements {
  const plan = input.plan ?? 'free';
  const mode = input.mode ?? 'local';
  const grantedEntitlements = input.grantedEntitlements ?? [];
  const entitlementSet = new Set<EntitlementKey>([...PLAN_ENTITLEMENTS[plan], ...grantedEntitlements]);
  const entitlements = ENTITLEMENT_VALUES.filter((value) => entitlementSet.has(value));
  const features = HOSTED_FEATURE_VALUES.map((key) => {
    const catalog = FEATURE_CATALOG[key];
    const source = entitlements.filter((entitlement) => catalog.entitlements.includes(entitlement));

    return {
      key,
      enabled: source.length > 0,
      source,
      description: catalog.description,
      hostedOnly: Boolean(catalog.hostedOnly)
    };
  });

  return {
    plan,
    mode,
    entitlements,
    features,
    creditBalance: input.creditBalance ?? null
  };
}

export function hasFeatureAccess(bundle: ResolvedEntitlements, key: HostedFeatureKey): boolean {
  return hasFeature(bundle, key);
}

export function buildHostedSessionBootstrap(input: ResolveEntitlementsInput = {}): HostedSessionBootstrap {
  const entitlements = resolveEntitlements(input);

  return {
    account: {
      accountId: input.accountId ?? 'local-anonymous',
      workspaceId: input.workspaceId,
      plan: entitlements.plan,
      mode: entitlements.mode
    },
    entitlements,
    flags: {
      localFirst: true,
      hostedSyncEnabled:
        hasFeature(entitlements, 'profile.sync.managed') || hasFeature(entitlements, 'workspace.shared'),
      workflowAutomationEnabled: hasFeature(entitlements, 'automation.jobs'),
      billingEnabled: entitlements.mode === 'hosted' && entitlements.entitlements.includes('credits.compute')
    }
  };
}

// ---------------------------------------------------------------------------
// P23 — Entitlement-aware UX messages
// ---------------------------------------------------------------------------

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
export function generateEntitlementUXMessage(
  featureKey: HostedFeatureKey,
  currentPlan?: AccountPlan
): EntitlementUXMessage {
  const feature = FEATURE_CATALOG[featureKey];
  if (!feature) {
    return {
      title: 'Feature not available',
      message: 'This feature is not currently available in your account.'
    };
  }

  // Determine which plans unlock this feature.
  const unlockedByPlans = (Object.entries(PLAN_ENTITLEMENTS) as [AccountPlan, readonly EntitlementKey[]][])
    .filter(([, ents]) => feature.entitlements.some((req) => ents.includes(req)))
    .map(([plan]) => plan);

  const recommendedPlan = unlockedByPlans[0] ?? 'pro';

  // Generate a friendly message based on the feature.
  let title = '';
  let message = '';
  let actionLabel = '';

  if (featureKey === 'compute.batch') {
    title = 'Live execution requires credits';
    message =
      'To execute compiled outputs to real providers (Suno, FLUX, etc.), you need compute credits. ' +
      'Upgrade to unlock hosted batch operations and enable live execution in Prompt Compiler.';
    actionLabel = `Upgrade to ${recommendedPlan === 'studio' ? 'Studio' : 'Pro'}`;
  } else if (featureKey === 'workspace.shared') {
    title = 'Team workspaces require a subscription';
    message =
      'Shared workspace libraries, member management, and review workflows are available on Studio tier. ' +
      'Upgrade to enable team collaboration and asset governance.';
    actionLabel = 'Upgrade to Studio';
  } else if (featureKey === 'profile.sync.managed') {
    title = 'Profile sync requires a subscription';
    message =
      'Managed profile synchronization across devices is a Pro+ feature. ' +
      'Upgrade to sync your brand profiles and templates automatically.';
    actionLabel = `Upgrade to ${recommendedPlan === 'studio' ? 'Studio' : 'Pro'}`;
  } else if (featureKey === 'automation.jobs') {
    title = 'Automation requires a subscription';
    message =
      'Workflow recipes and scheduled automation are available on Studio tier. ' +
      'Upgrade to set up multi-step compile and publish workflows.';
    actionLabel = 'Upgrade to Studio';
  } else {
    title = `Feature not available in your plan`;
    message = `${feature.description} Upgrade your account to unlock this feature.`;
    actionLabel = `Upgrade to ${recommendedPlan === 'studio' ? 'Studio' : recommendedPlan === 'pro' ? 'Pro' : 'Plus'}`;
  }

  return {
    title,
    message,
    upgradeUrl: `https://promptcompiler.local/billing/upgrade?from=${currentPlan ?? 'free'}&to=${recommendedPlan}`,
    actionLabel,
    recommendedPlan
  };
}

