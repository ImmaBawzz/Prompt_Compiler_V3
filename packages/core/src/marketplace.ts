/**
 * Profile Marketplace (Phase 17)
 *
 * Manages marketplace listings for shareable brand profiles and template
 * packs.  Publishing is gated behind `pro.creator`; browsing and installing
 * are always free.  All artifacts are schema-validated JSON — no server-side
 * execution is required.
 */

import { randomUUID } from 'node:crypto';
import {
  CreateMarketplaceListingInput,
  EntitlementKey,
  MarketplaceListingDocument,
  MarketplaceListingStatus,
  MarketplaceListingType
} from './types';

// ---------------------------------------------------------------------------
// Listing factory
// ---------------------------------------------------------------------------

export function createMarketplaceListing(
  input: CreateMarketplaceListingInput
): MarketplaceListingDocument {
  if (!input.publishedBy) throw new Error('createMarketplaceListing: publishedBy is required.');
  if (!input.displayName) throw new Error('createMarketplaceListing: displayName is required.');
  if (!input.payload) throw new Error('createMarketplaceListing: payload is required.');
  if (!input.listingType) throw new Error('createMarketplaceListing: listingType is required.');

  const isProfile = input.listingType === 'brand-profile';
  const payload = input.payload as unknown as Record<string, unknown>;

  if (isProfile && (typeof payload['id'] !== 'string' || typeof payload['brandName'] !== 'string')) {
    throw new Error(
      'createMarketplaceListing: brand-profile payload must include string id and brandName.'
    );
  }
  if (!isProfile && (typeof payload['id'] !== 'string' || typeof payload['name'] !== 'string')) {
    throw new Error(
      'createMarketplaceListing: template-pack payload must include string id and name.'
    );
  }

  const now = new Date().toISOString();
  return {
    listingId: input.listingId ?? randomUUID(),
    listingType: input.listingType,
    status: 'published' as MarketplaceListingStatus,
    publishedBy: input.publishedBy,
    displayName: input.displayName,
    description: input.description,
    tags: input.tags ?? [],
    requiredEntitlement: 'pro.creator' as Extract<EntitlementKey, 'pro.creator' | 'studio.team'>,
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
export function canPublishToMarketplace(entitlements: EntitlementKey[]): boolean {
  return (
    entitlements.includes('pro.creator') ||
    entitlements.includes('studio.team')
  );
}

// ---------------------------------------------------------------------------
// In-memory marketplace store for the API server
// ---------------------------------------------------------------------------

export interface MarketplaceStore {
  save(listing: MarketplaceListingDocument): MarketplaceListingDocument;
  getById(listingId: string): MarketplaceListingDocument | undefined;
  list(filter?: { listingType?: MarketplaceListingType; status?: MarketplaceListingStatus }): MarketplaceListingDocument[];
  incrementInstallCount(listingId: string): MarketplaceListingDocument | undefined;
}

export function createInMemoryMarketplaceStore(): MarketplaceStore {
  const listings = new Map<string, MarketplaceListingDocument>();

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
      if (!existing) return undefined;
      const updated: MarketplaceListingDocument = {
        ...existing,
        installCount: existing.installCount + 1,
        updatedAt: new Date().toISOString()
      };
      listings.set(listingId, updated);
      return updated;
    }
  };
}
