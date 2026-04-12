import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteHostedProfileLibraryStore } from '../sqliteProfileLibraryStore';

// All tests use an in-memory database for isolation.
function makeStore() {
  return createSqliteHostedProfileLibraryStore(':memory:');
}

test('SQLite store upserts and retrieves a document', () => {
  const store = makeStore();
  try {
    const doc = store.upsert({
      accountId: 'acct-1',
      workspaceId: 'ws-1',
      profiles: [{ id: 'p1', brandName: 'LJV', voice: 'poetic' }]
    });

    assert.equal(doc.accountId, 'acct-1');
    assert.equal(doc.profiles.length, 1);

    const retrieved = store.get('acct-1', 'ws-1');
    assert.ok(retrieved);
    assert.equal(retrieved.profiles[0].id, 'p1');
  } finally {
    store.close();
  }
});

test('SQLite store returns undefined for unknown scope', () => {
  const store = makeStore();
  try {
    assert.equal(store.get('acct-unknown', 'ws-z'), undefined);
  } finally {
    store.close();
  }
});

test('SQLite store isolates workspace scopes', () => {
  const store = makeStore();
  try {
    store.upsert({ accountId: 'acct-iso', workspaceId: 'ws-a', profiles: [{ id: 'pa', brandName: 'A', voice: 'v' }] });
    store.upsert({ accountId: 'acct-iso', workspaceId: 'ws-b', profiles: [{ id: 'pb', brandName: 'B', voice: 'v' }] });

    assert.equal(store.get('acct-iso', 'ws-a')?.profiles[0]?.id, 'pa');
    assert.equal(store.get('acct-iso', 'ws-b')?.profiles[0]?.id, 'pb');
  } finally {
    store.close();
  }
});

test('SQLite store upsert merges on second write to same scope', () => {
  const store = makeStore();
  try {
    store.upsert({ accountId: 'acct-merge', workspaceId: 'ws-1', profiles: [{ id: 'p1', brandName: 'A', voice: 'v' }] });
    const updated = store.upsert({ accountId: 'acct-merge', workspaceId: 'ws-1', profiles: [{ id: 'p1', brandName: 'A', voice: 'v' }, { id: 'p2', brandName: 'B', voice: 'v' }] });

    assert.equal(updated.profiles.length, 2);
    const read = store.get('acct-merge', 'ws-1');
    assert.ok(read);
    assert.equal(read.profiles.length, 2);
  } finally {
    store.close();
  }
});

test('SQLite store list() returns all workspace docs for accountId', () => {
  const store = makeStore();
  try {
    store.upsert({ accountId: 'acct-list', workspaceId: 'ws-1', profiles: [{ id: 'p1', brandName: 'X', voice: 'v' }] });
    store.upsert({ accountId: 'acct-list', workspaceId: 'ws-2', profiles: [{ id: 'p2', brandName: 'Y', voice: 'v' }] });
    store.upsert({ accountId: 'acct-other', workspaceId: 'ws-z', profiles: [{ id: 'pz', brandName: 'Z', voice: 'v' }] });

    const docs = store.list('acct-list');
    assert.equal(docs.length, 2);
    const wsIds = docs.map((d) => d.workspaceId).sort();
    assert.deepEqual(wsIds, ['ws-1', 'ws-2']);
  } finally {
    store.close();
  }
});

test('SQLite store list() returns empty array for unknown accountId', () => {
  const store = makeStore();
  try {
    const docs = store.list('acct-nobody');
    assert.equal(docs.length, 0);
  } finally {
    store.close();
  }
});

test('SQLite store handles null workspaceId (account-level scope)', () => {
  const store = makeStore();
  try {
    store.upsert({ accountId: 'acct-nows', profiles: [{ id: 'p1', brandName: 'Root', voice: 'v' }] });

    const doc = store.get('acct-nows');
    assert.ok(doc);
    assert.equal(doc.profiles[0].id, 'p1');

    const listed = store.list('acct-nows');
    assert.equal(listed.length, 1);
  } finally {
    store.close();
  }
});
