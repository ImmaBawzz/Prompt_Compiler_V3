"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USAGE_DOMAIN_QUOTA_LIMITS = void 0;
exports.createUsageMeteringEvent = createUsageMeteringEvent;
exports.buildUsageAccountSummary = buildUsageAccountSummary;
exports.resolveUsageQuotaPlan = resolveUsageQuotaPlan;
exports.buildUsageQuotaSnapshot = buildUsageQuotaSnapshot;
exports.createInMemoryUsageLedgerStore = createInMemoryUsageLedgerStore;
const node_crypto_1 = require("node:crypto");
const VALID_UNITS = ['request', 'token'];
const VALID_DOMAINS = ['execute', 'publish', 'marketplace-install', 'learning'];
exports.USAGE_DOMAIN_QUOTA_LIMITS = {
    execute: {
        free: 0,
        pro: 2,
        studio: 5
    },
    publish: {
        free: 0,
        pro: 0,
        studio: 3
    },
    'marketplace-install': {
        free: 1,
        pro: 3,
        studio: 5
    },
    learning: {
        free: 0,
        pro: 10,
        studio: 50
    }
};
function isValidUnit(value) {
    return VALID_UNITS.includes(value);
}
function isValidDomain(value) {
    return VALID_DOMAINS.includes(value);
}
function createUsageMeteringEvent(input) {
    if (!input.accountId) {
        throw new Error('createUsageMeteringEvent: accountId is required.');
    }
    if (!input.domain || !isValidDomain(input.domain)) {
        throw new Error('createUsageMeteringEvent: domain must be execute, publish, marketplace-install, or learning.');
    }
    if (!input.action) {
        throw new Error('createUsageMeteringEvent: action is required.');
    }
    const unitsConsumed = Number(input.unitsConsumed ?? 1);
    if (!Number.isFinite(unitsConsumed) || unitsConsumed <= 0) {
        throw new Error('createUsageMeteringEvent: unitsConsumed must be a positive number.');
    }
    const unit = input.unit ?? 'request';
    if (!isValidUnit(unit)) {
        throw new Error('createUsageMeteringEvent: unit must be request or token.');
    }
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    return {
        eventId: input.eventId ?? (0, node_crypto_1.randomUUID)(),
        accountId: input.accountId,
        workspaceId: input.workspaceId,
        domain: input.domain,
        action: input.action,
        unitsConsumed,
        unit,
        bundleId: input.bundleId,
        profileId: input.profileId,
        listingId: input.listingId,
        plan: input.plan,
        mode: input.mode,
        entitlements: input.entitlements,
        occurredAt,
        metadata: input.metadata
    };
}
function matchesFilter(event, filter) {
    if (!filter) {
        return true;
    }
    if (filter.workspaceId && event.workspaceId !== filter.workspaceId) {
        return false;
    }
    if (filter.domain && event.domain !== filter.domain) {
        return false;
    }
    if (filter.unit && event.unit !== filter.unit) {
        return false;
    }
    if (filter.from && event.occurredAt < filter.from) {
        return false;
    }
    if (filter.to && event.occurredAt > filter.to) {
        return false;
    }
    return true;
}
function buildUsageAccountSummary(accountId, events) {
    const totalsByDomain = {
        execute: 0,
        publish: 0,
        'marketplace-install': 0,
        learning: 0
    };
    const totalsByUnit = {
        request: 0,
        token: 0
    };
    let mostRecentEventAt;
    for (const event of events) {
        totalsByDomain[event.domain] += event.unitsConsumed;
        totalsByUnit[event.unit] += event.unitsConsumed;
        if (!mostRecentEventAt || event.occurredAt > mostRecentEventAt) {
            mostRecentEventAt = event.occurredAt;
        }
    }
    return {
        accountId,
        totalEvents: events.length,
        totalsByDomain,
        totalsByUnit,
        mostRecentEventAt
    };
}
function resolveUsageQuotaPlan(plan, entitlements) {
    if (plan) {
        return plan;
    }
    const entitlementSet = new Set(entitlements ?? []);
    if (entitlementSet.has('studio.team')) {
        return 'studio';
    }
    if (entitlementSet.has('pro.creator') || entitlementSet.has('credits.compute')) {
        return 'pro';
    }
    return 'free';
}
function buildUsageQuotaSnapshot(summary, plan, entitlements) {
    const quotaPlan = resolveUsageQuotaPlan(plan, entitlements);
    const result = {};
    for (const domain of VALID_DOMAINS) {
        const limit = exports.USAGE_DOMAIN_QUOTA_LIMITS[domain][quotaPlan];
        const used = summary.totalsByDomain[domain] ?? 0;
        const remaining = Math.max(0, limit - used);
        const status = {
            limit,
            used,
            remaining,
            exhausted: used >= limit
        };
        result[domain] = status;
    }
    return result;
}
function createInMemoryUsageLedgerStore() {
    const events = [];
    return {
        append(event) {
            events.push(event);
            return event;
        },
        listByAccount(accountId, filter) {
            return events
                .filter((event) => event.accountId === accountId)
                .filter((event) => matchesFilter(event, filter));
        },
        listByWorkspace(accountId, workspaceId) {
            return events.filter((event) => event.accountId === accountId && event.workspaceId === workspaceId);
        },
        summarizeAccount(accountId, filter) {
            const selected = events
                .filter((event) => event.accountId === accountId)
                .filter((event) => matchesFilter(event, filter));
            return buildUsageAccountSummary(accountId, selected);
        }
    };
}
//# sourceMappingURL=usage.js.map