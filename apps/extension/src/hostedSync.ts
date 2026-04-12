export type AccountPlan = 'free' | 'pro' | 'studio';

export function entitlementsForPlan(plan: AccountPlan): string[] {
  if (plan === 'studio') {
    return ['free.local', 'pro.creator', 'studio.team'];
  }

  if (plan === 'pro') {
    return ['free.local', 'pro.creator'];
  }

  return ['free.local'];
}

export function safeParseState<T>(raw: string | undefined): T | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
