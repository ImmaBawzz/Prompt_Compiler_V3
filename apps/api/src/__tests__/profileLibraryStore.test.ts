import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryHostedProfileLibraryStore } from '../profileLibraryStore';

test('in-memory hosted profile library store upserts and retrieves by scope', () => {
  const store = createInMemoryHostedProfileLibraryStore();

  const first = store.upsert({
    accountId: 'acct-1',
    workspaceId: 'workspace-1',
    updatedAt: '2026-04-12T09:00:00.000Z',
    profiles: [{ id: 'profile-1', brandName: 'LJV', voice: 'poetic', version: '1' }]
  });

  const second = store.upsert({
    accountId: 'acct-1',
    workspaceId: 'workspace-1',
    updatedAt: '2026-04-12T09:05:00.000Z',
    templatePacks: [{ id: 'pack-1', name: 'Pack 1', templates: { generic: { prefix: 'x' } }, version: '1' }]
  });

  assert.equal(first.accountId, 'acct-1');
  assert.equal(second.updatedAt, '2026-04-12T09:05:00.000Z');

  const document = store.get('acct-1', 'workspace-1');
  assert.ok(document);
  assert.deepEqual(document.profiles.map((item) => item.id), ['profile-1']);
  assert.deepEqual(document.templatePacks.map((item) => item.id), ['pack-1']);
});

test('in-memory hosted profile library store isolates workspace scopes', () => {
  const store = createInMemoryHostedProfileLibraryStore();

  store.upsert({
    accountId: 'acct-1',
    workspaceId: 'workspace-a',
    profiles: [{ id: 'profile-a', brandName: 'A', voice: 'voice' }]
  });

  store.upsert({
    accountId: 'acct-1',
    workspaceId: 'workspace-b',
    profiles: [{ id: 'profile-b', brandName: 'B', voice: 'voice' }]
  });

  assert.equal(store.get('acct-1', 'workspace-a')?.profiles[0]?.id, 'profile-a');
  assert.equal(store.get('acct-1', 'workspace-b')?.profiles[0]?.id, 'profile-b');
});
