import { HostedProfileLibraryDocument, UpsertHostedProfileLibraryInput, VersionedBrandProfile, VersionedTemplatePack } from './types';

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function mergeProfiles(
  existing: VersionedBrandProfile[],
  updates: VersionedBrandProfile[] | undefined,
  updatedAt: string
): VersionedBrandProfile[] {
  const map = new Map(existing.map((item) => [item.id, item]));


  for (const profile of updates ?? []) {
    const prev = map.get(profile.id);
    map.set(profile.id, {
      ...profile,
      updatedAt: profile.updatedAt ?? updatedAt,
      version: profile.version ?? prev?.version ?? '1',
      learningMode:
        profile.learningMode !== undefined
          ? profile.learningMode
          : prev?.learningMode !== undefined
            ? prev.learningMode
            : 'manual'
    });
  }

  // Ensure all existing profiles not in updates are included and have learningMode defaulted
  for (const [id, profile] of map) {
    if (!(updates ?? []).some((p) => p.id === id)) {
      map.set(id, {
        ...profile,
        learningMode: profile.learningMode ?? 'manual'
      });
    }
  }

  return Array.from(map.values()).sort(byId);
}

function mergeTemplatePacks(
  existing: VersionedTemplatePack[],
  updates: VersionedTemplatePack[] | undefined,
  updatedAt: string
): VersionedTemplatePack[] {
  const map = new Map(existing.map((item) => [item.id, item]));

  for (const templatePack of updates ?? []) {
    map.set(templatePack.id, {
      ...templatePack,
      updatedAt: templatePack.updatedAt ?? updatedAt,
      version: templatePack.version ?? map.get(templatePack.id)?.version ?? '1'
    });
  }

  return Array.from(map.values()).sort(byId);
}

export function upsertHostedProfileLibraryDocument(
  existing: HostedProfileLibraryDocument | undefined,
  update: UpsertHostedProfileLibraryInput
): HostedProfileLibraryDocument {
  const updatedAt = update.updatedAt ?? new Date().toISOString();

  return {
    documentVersion: existing?.documentVersion ?? '1',
    accountId: update.accountId,
    workspaceId: update.workspaceId,
    profiles: mergeProfiles(existing?.profiles ?? [], update.profiles, updatedAt),
    templatePacks: mergeTemplatePacks(existing?.templatePacks ?? [], update.templatePacks, updatedAt),
    updatedAt
  };
}
