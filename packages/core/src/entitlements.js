"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOSTED_FEATURE_VALUES = exports.ENTITLEMENT_VALUES = exports.ACCESS_MODE_VALUES = exports.ACCOUNT_PLAN_VALUES = void 0;
exports.isAccountPlan = isAccountPlan;
exports.isAccessMode = isAccessMode;
exports.isEntitlementKey = isEntitlementKey;
exports.resolveEntitlements = resolveEntitlements;
exports.hasFeatureAccess = hasFeatureAccess;
exports.buildHostedSessionBootstrap = buildHostedSessionBootstrap;
exports.generateEntitlementUXMessage = generateEntitlementUXMessage;
exports.ACCOUNT_PLAN_VALUES = ['free', 'pro', 'studio'];
exports.ACCESS_MODE_VALUES = ['local', 'hosted'];
exports.ENTITLEMENT_VALUES = [
    'free.local',
    'pro.creator',
    'studio.team',
    'credits.compute'
];
exports.HOSTED_FEATURE_VALUES = [
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
const PLAN_ENTITLEMENTS = {
    free: ['free.local'],
    pro: ['free.local', 'pro.creator'],
    studio: ['free.local', 'pro.creator', 'studio.team']
};
const FEATURE_CATALOG = {
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
function isAccountPlan(value) {
    return typeof value === 'string' && exports.ACCOUNT_PLAN_VALUES.includes(value);
}
function isAccessMode(value) {
    return typeof value === 'string' && exports.ACCESS_MODE_VALUES.includes(value);
}
function isEntitlementKey(value) {
    return typeof value === 'string' && exports.ENTITLEMENT_VALUES.includes(value);
}
function hasFeature(bundle, key) {
    return bundle.features.some((feature) => feature.key === key && feature.enabled);
}
function resolveEntitlements(input = {}) {
    const plan = input.plan ?? 'free';
    const mode = input.mode ?? 'local';
    const grantedEntitlements = input.grantedEntitlements ?? [];
    const entitlementSet = new Set([...PLAN_ENTITLEMENTS[plan], ...grantedEntitlements]);
    const entitlements = exports.ENTITLEMENT_VALUES.filter((value) => entitlementSet.has(value));
    const features = exports.HOSTED_FEATURE_VALUES.map((key) => {
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
function hasFeatureAccess(bundle, key) {
    return hasFeature(bundle, key);
}
function buildHostedSessionBootstrap(input = {}) {
    const entitlements = resolveEntitlements(input);
    const usage = input.usageSummary || input.usageQuotas || entitlements.creditBalance !== null
        ? {
            summary: input.usageSummary,
            quotas: input.usageQuotas,
            creditsRemaining: entitlements.creditBalance
        }
        : undefined;
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
            hostedSyncEnabled: hasFeature(entitlements, 'profile.sync.managed') || hasFeature(entitlements, 'workspace.shared'),
            workflowAutomationEnabled: hasFeature(entitlements, 'automation.jobs'),
            billingEnabled: entitlements.mode === 'hosted' && entitlements.entitlements.includes('credits.compute')
        },
        usage
    };
}
/**
 * Generate a user-friendly entitlement error message for a feature the user lacks.
 * Surfaces the upgrade path and recommended plan.
 */
function generateEntitlementUXMessage(featureKey, currentPlan) {
    const feature = FEATURE_CATALOG[featureKey];
    if (!feature) {
        return {
            title: 'Feature not available',
            message: 'This feature is not currently available in your account.'
        };
    }
    // Determine which plans unlock this feature.
    const unlockedByPlans = Object.entries(PLAN_ENTITLEMENTS)
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
    }
    else if (featureKey === 'workspace.shared') {
        title = 'Team workspaces require a subscription';
        message =
            'Shared workspace libraries, member management, and review workflows are available on Studio tier. ' +
                'Upgrade to enable team collaboration and asset governance.';
        actionLabel = 'Upgrade to Studio';
    }
    else if (featureKey === 'profile.sync.managed') {
        title = 'Profile sync requires a subscription';
        message =
            'Managed profile synchronization across devices is a Pro+ feature. ' +
                'Upgrade to sync your brand profiles and templates automatically.';
        actionLabel = `Upgrade to ${recommendedPlan === 'studio' ? 'Studio' : 'Pro'}`;
    }
    else if (featureKey === 'automation.jobs') {
        title = 'Automation requires a subscription';
        message =
            'Workflow recipes and scheduled automation are available on Studio tier. ' +
                'Upgrade to set up multi-step compile and publish workflows.';
        actionLabel = 'Upgrade to Studio';
    }
    else {
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
//# sourceMappingURL=entitlements.js.map