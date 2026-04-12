import { createHash } from 'node:crypto';
import { ENTITLEMENT_VALUES } from './entitlements';
import {
  CreateProfileLibrarySyncManifestInput,
  ProfileLibrarySyncManifest,
  SyncManifestAsset,
  VersionedBrandProfile,
  VersionedTemplatePack
} from './types';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function checksumFor(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function buildProfileAsset(profile: VersionedBrandProfile, workspaceId?: string, generatedAt?: string): SyncManifestAsset {
  return {
    assetId: profile.id,
    assetType: 'brand-profile',
    displayName: profile.brandName,
    version: profile.version ?? '1',
    updatedAt: profile.updatedAt ?? generatedAt ?? new Date().toISOString(),
    checksum: checksumFor(profile),
    workspaceScoped: Boolean(workspaceId),
    deleted: false
  };
}

function buildTemplatePackAsset(
  templatePack: VersionedTemplatePack,
  workspaceId?: string,
  generatedAt?: string
): SyncManifestAsset {
  return {
    assetId: templatePack.id,
    assetType: 'template-pack',
    displayName: templatePack.name,
    version: templatePack.version ?? '1',
    updatedAt: templatePack.updatedAt ?? generatedAt ?? new Date().toISOString(),
    checksum: checksumFor(templatePack),
    workspaceScoped: Boolean(workspaceId),
    deleted: false
  };
}

export function createProfileLibrarySyncManifest(
  input: CreateProfileLibrarySyncManifestInput
): ProfileLibrarySyncManifest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const workspaceId = input.workspaceId;
  const assets = [
    ...(input.profiles ?? []).map((profile) => buildProfileAsset(profile, workspaceId, generatedAt)),
    ...(input.templatePacks ?? []).map((templatePack) => buildTemplatePackAsset(templatePack, workspaceId, generatedAt))
  ].sort((left, right) => {
    if (left.assetType !== right.assetType) {
      return left.assetType.localeCompare(right.assetType);
    }

    return left.assetId.localeCompare(right.assetId);
  });

  const entitlementSet = new Set(input.entitlements ?? []);
  const entitlements = ENTITLEMENT_VALUES.filter((value) => entitlementSet.has(value));

  return {
    manifestVersion: '1',
    generatedAt,
    accountId: input.accountId,
    workspaceId,
    cursor: input.cursor ?? `${generatedAt}:${assets.length}`,
    entitlements,
    assets
  };
}
