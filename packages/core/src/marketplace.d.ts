/**
 * Profile Marketplace (Phase 17)
 *
 * Manages marketplace listings for shareable brand profiles and template
 * packs.  Publishing is gated behind `pro.creator`; browsing and installing
 * are always free.  All artifacts are schema-validated JSON — no server-side
 * execution is required.
 */
import { CreateMarketplaceListingInput, EntitlementKey, MarketplaceListingDocument, MarketplaceListingStatus, MarketplaceListingType } from './types';
export declare function createMarketplaceListing(input: CreateMarketplaceListingInput): MarketplaceListingDocument;
/**
 * Returns true if the entitlement list allows publishing to the marketplace.
 * Browsing (GET) is always allowed.
 */
export declare function canPublishToMarketplace(entitlements: EntitlementKey[]): boolean;
export interface MarketplaceStore {
    save(listing: MarketplaceListingDocument): MarketplaceListingDocument;
    getById(listingId: string): MarketplaceListingDocument | undefined;
    list(filter?: {
        listingType?: MarketplaceListingType;
        status?: MarketplaceListingStatus;
    }): MarketplaceListingDocument[];
    incrementInstallCount(listingId: string): MarketplaceListingDocument | undefined;
}
export declare function createInMemoryMarketplaceStore(): MarketplaceStore;
