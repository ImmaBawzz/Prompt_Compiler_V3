"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfileLibrarySyncManifest = createProfileLibrarySyncManifest;
const node_crypto_1 = require("node:crypto");
const entitlements_1 = require("./entitlements");
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function checksumFor(value) {
    return (0, node_crypto_1.createHash)('sha256').update(stableStringify(value)).digest('hex');
}
function buildProfileAsset(profile, workspaceId, generatedAt) {
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
function buildTemplatePackAsset(templatePack, workspaceId, generatedAt) {
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
function createProfileLibrarySyncManifest(input) {
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
    const entitlements = entitlements_1.ENTITLEMENT_VALUES.filter((value) => entitlementSet.has(value));
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
//# sourceMappingURL=sync.js.map