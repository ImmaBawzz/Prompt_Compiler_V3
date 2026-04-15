"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertHostedProfileLibraryDocument = upsertHostedProfileLibraryDocument;
function byId(left, right) {
    return left.id.localeCompare(right.id);
}
function mergeProfiles(existing, updates, updatedAt) {
    const map = new Map(existing.map((item) => [item.id, item]));
    for (const profile of updates ?? []) {
        map.set(profile.id, {
            ...profile,
            updatedAt: profile.updatedAt ?? updatedAt,
            version: profile.version ?? map.get(profile.id)?.version ?? '1'
        });
    }
    return Array.from(map.values()).sort(byId);
}
function mergeTemplatePacks(existing, updates, updatedAt) {
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
function upsertHostedProfileLibraryDocument(existing, update) {
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
//# sourceMappingURL=libraries.js.map