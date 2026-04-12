import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarketplaceListing,
  canPublishToMarketplace,
  createInMemoryMarketplaceStore
} from '../marketplace';
import { CreateMarketplaceListingInput, VersionedBrandProfile, VersionedTemplatePack } from '../types';

const profilePayload: VersionedBrandProfile = {
  id: 'profile-ljv',
  brandName: 'LJV Signal Core',
  voice: 'poetic',
  signatureMotifs: ['drift', 'bloom'],
  version: '1.0.0',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

const templatePackPayload: VersionedTemplatePack = {
  id: 'pack-default',
  name: 'Default Pack',
  version: '1.0.0',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

const baseProfileInput: CreateMarketplaceListingInput = {
  listingType: 'brand-profile',
  publishedBy: 'account-creator-1',
  displayName: 'LJV Signal Core — Marketplace Edition',
  payload: profilePayload
};

const baseTemplateInput: CreateMarketplaceListingInput = {
  listingType: 'template-pack',
  publishedBy: 'account-creator-1',
  displayName: 'Default Template Pack',
  payload: templatePackPayload
};

// --- createMarketplaceListing ---

test('createMarketplaceListing creates a brand-profile listing', () => {
  const listing = createMarketplaceListing(baseProfileInput);
  assert.equal(listing.listingType, 'brand-profile');
  assert.equal(listing.status, 'published');
  assert.equal(listing.installCount, 0);
  assert.ok(typeof listing.listingId === 'string' && listing.listingId.length > 0);
});

test('createMarketplaceListing creates a template-pack listing', () => {
  const listing = createMarketplaceListing(baseTemplateInput);
  assert.equal(listing.listingType, 'template-pack');
  assert.equal(listing.displayName, 'Default Template Pack');
});

test('createMarketplaceListing respects provided listingId', () => {
  const listing = createMarketplaceListing({ ...baseProfileInput, listingId: 'listing-custom' });
  assert.equal(listing.listingId, 'listing-custom');
});

test('createMarketplaceListing sets requiredEntitlement to pro.creator', () => {
  const listing = createMarketplaceListing(baseProfileInput);
  assert.equal(listing.requiredEntitlement, 'pro.creator');
});

test('createMarketplaceListing throws when publishedBy missing', () => {
  assert.throws(
    () => createMarketplaceListing({ ...baseProfileInput, publishedBy: '' }),
    Error
  );
});

test('createMarketplaceListing throws when displayName missing', () => {
  assert.throws(
    () => createMarketplaceListing({ ...baseProfileInput, displayName: '' }),
    Error
  );
});

test('createMarketplaceListing throws when brand-profile payload is missing brandName', () => {
  assert.throws(
    () => createMarketplaceListing({ ...baseProfileInput, payload: { id: 'p', voice: 'raw' } as unknown as VersionedBrandProfile }),
    Error
  );
});

test('createMarketplaceListing throws when template-pack payload is missing name', () => {
  assert.throws(
    () => createMarketplaceListing({ ...baseTemplateInput, payload: { id: 'p' } as unknown as VersionedTemplatePack }),
    Error
  );
});

test('createMarketplaceListing sets tags to empty array by default', () => {
  const listing = createMarketplaceListing(baseProfileInput);
  assert.deepEqual(listing.tags, []);
});

// --- canPublishToMarketplace ---

test('canPublishToMarketplace returns false for free entitlements', () => {
  assert.equal(canPublishToMarketplace(['free.local']), false);
});

test('canPublishToMarketplace returns true with pro.creator', () => {
  assert.equal(canPublishToMarketplace(['free.local', 'pro.creator']), true);
});

test('canPublishToMarketplace returns true with studio.team', () => {
  assert.equal(canPublishToMarketplace(['studio.team']), true);
});

// --- MarketplaceStore ---

test('createInMemoryMarketplaceStore can save and get by id', () => {
  const store = createInMemoryMarketplaceStore();
  const listing = createMarketplaceListing(baseProfileInput);
  store.save(listing);
  const retrieved = store.getById(listing.listingId);
  assert.ok(retrieved !== undefined);
  assert.equal(retrieved!.listingId, listing.listingId);
});

test('createInMemoryMarketplaceStore list returns all published by default', () => {
  const store = createInMemoryMarketplaceStore();
  store.save(createMarketplaceListing(baseProfileInput));
  store.save(createMarketplaceListing(baseTemplateInput));
  const listings = store.list({ status: 'published' });
  assert.equal(listings.length, 2);
});

test('createInMemoryMarketplaceStore list filters by listingType', () => {
  const store = createInMemoryMarketplaceStore();
  store.save(createMarketplaceListing(baseProfileInput));
  store.save(createMarketplaceListing(baseTemplateInput));
  const profiles = store.list({ listingType: 'brand-profile', status: 'published' });
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].listingType, 'brand-profile');
});

test('createInMemoryMarketplaceStore incrementInstallCount updates count', () => {
  const store = createInMemoryMarketplaceStore();
  const listing = createMarketplaceListing(baseProfileInput);
  store.save(listing);
  store.incrementInstallCount(listing.listingId);
  store.incrementInstallCount(listing.listingId);
  const updated = store.getById(listing.listingId);
  assert.equal(updated!.installCount, 2);
});

test('createInMemoryMarketplaceStore incrementInstallCount returns undefined for missing listing', () => {
  const store = createInMemoryMarketplaceStore();
  const result = store.incrementInstallCount('missing-id');
  assert.equal(result, undefined);
});
