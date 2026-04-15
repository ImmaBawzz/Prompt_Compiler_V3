"use strict";
/**
 * Profile Marketplace (Phase 17)
 *
 * Manages marketplace listings for shareable brand profiles and template
 * packs.  Publishing is gated behind `pro.creator`; browsing and installing
 * are always free.  All artifacts are schema-validated JSON — no server-side
 * execution is required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMarketplaceListing = createMarketplaceListing;
exports.canPublishToMarketplace = canPublishToMarketplace;
exports.createInMemoryMarketplaceStore = createInMemoryMarketplaceStore;
const node_crypto_1 = require("node:crypto");
// ---------------------------------------------------------------------------
// Listing factory
// ---------------------------------------------------------------------------
function createMarketplaceListing(input) {
    if (!input.publishedBy)
        throw new Error('createMarketplaceListing: publishedBy is required.');
    if (!input.displayName)
        throw new Error('createMarketplaceListing: displayName is required.');
    if (!input.payload)
        throw new Error('createMarketplaceListing: payload is required.');
    if (!input.listingType)
        throw new Error('createMarketplaceListing: listingType is required.');
    const isProfile = input.listingType === 'brand-profile';
    const payload = input.payload;
    if (isProfile && (typeof payload['id'] !== 'string' || typeof payload['brandName'] !== 'string')) {
        throw new Error('createMarketplaceListing: brand-profile payload must include string id and brandName.');
    }
    if (!isProfile && (typeof payload['id'] !== 'string' || typeof payload['name'] !== 'string')) {
        throw new Error('createMarketplaceListing: template-pack payload must include string id and name.');
    }
    const now = new Date().toISOString();
    return {
        listingId: input.listingId ?? (0, node_crypto_1.randomUUID)(),
        listingType: input.listingType,
        status: 'published',
        publishedBy: input.publishedBy,
        displayName: input.displayName,
        description: input.description,
        tags: input.tags ?? [],
        requiredEntitlement: 'pro.creator',
        payload: input.payload,
        version: input.version ?? '1.0.0',
        publishedAt: input.publishedAt ?? now,
        updatedAt: now,
        installCount: 0
    };
}
// ---------------------------------------------------------------------------
// Entitlement guard helper
// ---------------------------------------------------------------------------
/**
 * Returns true if the entitlement list allows publishing to the marketplace.
 * Browsing (GET) is always allowed.
 */
function canPublishToMarketplace(entitlements) {
    return (entitlements.includes('pro.creator') ||
        entitlements.includes('studio.team'));
}
function createInMemoryMarketplaceStore() {
    const listings = new Map();
    return {
        save(listing) {
            listings.set(listing.listingId, listing);
            return listing;
        },
        getById(listingId) {
            return listings.get(listingId);
        },
        list(filter) {
            let all = [...listings.values()];
            if (filter?.listingType) {
                all = all.filter((l) => l.listingType === filter.listingType);
            }
            if (filter?.status) {
                all = all.filter((l) => l.status === filter.status);
            }
            return all;
        },
        incrementInstallCount(listingId) {
            const existing = listings.get(listingId);
            if (!existing)
                return undefined;
            const updated = {
                ...existing,
                installCount: existing.installCount + 1,
                updatedAt: new Date().toISOString()
            };
            listings.set(listingId, updated);
            return updated;
        }
    };
}
//# sourceMappingURL=marketplace.js.map