import { randomUUID } from 'node:crypto';
import {
  CreateUsageMeteringEventInput,
  UsageAccountSummary,
  UsageMeteringEvent,
  UsageMeteringEventFilter,
  UsageMeteringUnit,
  UsageMeteringDomain
} from './types';

const VALID_UNITS: readonly UsageMeteringUnit[] = ['request', 'token'];
const VALID_DOMAINS: readonly UsageMeteringDomain[] = ['execute', 'publish', 'marketplace-install'];

function isValidUnit(value: string): value is UsageMeteringUnit {
  return VALID_UNITS.includes(value as UsageMeteringUnit);
}

function isValidDomain(value: string): value is UsageMeteringDomain {
  return VALID_DOMAINS.includes(value as UsageMeteringDomain);
}

export function createUsageMeteringEvent(input: CreateUsageMeteringEventInput): UsageMeteringEvent {
  if (!input.accountId) {
    throw new Error('createUsageMeteringEvent: accountId is required.');
  }
  if (!input.domain || !isValidDomain(input.domain)) {
    throw new Error('createUsageMeteringEvent: domain must be execute, publish, or marketplace-install.');
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
    eventId: input.eventId ?? randomUUID(),
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

function matchesFilter(event: UsageMeteringEvent, filter?: UsageMeteringEventFilter): boolean {
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

export function buildUsageAccountSummary(
  accountId: string,
  events: UsageMeteringEvent[]
): UsageAccountSummary {
  const totalsByDomain: UsageAccountSummary['totalsByDomain'] = {
    execute: 0,
    publish: 0,
    'marketplace-install': 0
  };
  const totalsByUnit: UsageAccountSummary['totalsByUnit'] = {
    request: 0,
    token: 0
  };

  let mostRecentEventAt: string | undefined;
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

export interface UsageLedgerStore {
  append(event: UsageMeteringEvent): UsageMeteringEvent;
  listByAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageMeteringEvent[];
  listByWorkspace(accountId: string, workspaceId: string): UsageMeteringEvent[];
  summarizeAccount(accountId: string, filter?: UsageMeteringEventFilter): UsageAccountSummary;
}

export function createInMemoryUsageLedgerStore(): UsageLedgerStore {
  const events: UsageMeteringEvent[] = [];

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
      return events.filter(
        (event) => event.accountId === accountId && event.workspaceId === workspaceId
      );
    },
    summarizeAccount(accountId, filter) {
      const selected = events
        .filter((event) => event.accountId === accountId)
        .filter((event) => matchesFilter(event, filter));
      return buildUsageAccountSummary(accountId, selected);
    }
  };
}
