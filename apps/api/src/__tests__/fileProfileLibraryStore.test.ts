import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileHostedProfileLibraryStore } from '../fileProfileLibraryStore';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pc-store-test-'));
}

test('file-based store upserts and retrieves a document', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);

  const doc = store.upsert({
    accountId: 'acct-file-1',
    workspaceId: 'ws-1',
    profiles: [{ id: 'profile-1', brandName: 'LJV', voice: 'poetic', version: '1' }]
  });

  assert.equal(doc.accountId, 'acct-file-1');
  assert.equal(doc.profiles.length, 1);

  const retrieved = store.get('acct-file-1', 'ws-1');
  assert.ok(retrieved);
  assert.equal(retrieved.profiles[0].id, 'profile-1');
});

test('file-based store persists document to disk', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);

  store.upsert({
    accountId: 'acct-persist',
    workspaceId: 'ws-x',
    profiles: [{ id: 'p1', brandName: 'Test', voice: 'neutral' }]
  });

  // Create a new store instance pointing to same dir — document should be re-read from disk.
  const store2 = createFileHostedProfileLibraryStore(dir);
  const doc = store2.get('acct-persist', 'ws-x');
  assert.ok(doc, 'Document should be present after re-opening store from same directory');
  assert.equal(doc.profiles[0].id, 'p1');
});

test('file-based store returns undefined for unknown scope', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);
  assert.equal(store.get('acct-unknown', 'ws-z'), undefined);
});

test('file-based store isolates workspace scopes', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);

  store.upsert({ accountId: 'acct-iso', workspaceId: 'ws-a', profiles: [{ id: 'p-a', brandName: 'A', voice: 'v' }] });
  store.upsert({ accountId: 'acct-iso', workspaceId: 'ws-b', profiles: [{ id: 'p-b', brandName: 'B', voice: 'v' }] });

  assert.equal(store.get('acct-iso', 'ws-a')?.profiles[0]?.id, 'p-a');
  assert.equal(store.get('acct-iso', 'ws-b')?.profiles[0]?.id, 'p-b');
});

test('file-based store writes atomically (no .tmp left on disk)', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);

  store.upsert({ accountId: 'acct-atomic', workspaceId: 'ws-1', profiles: [] });

  const entries = fs.readdirSync(dir);
  const tmpFiles = entries.filter((f) => f.endsWith('.tmp'));
  assert.equal(tmpFiles.length, 0, 'No .tmp files should remain after write');
});

test('file-based store list() returns all workspace docs for accountId', () => {
  const dir = tmpDir();
  const store = createFileHostedProfileLibraryStore(dir);

  store.upsert({ accountId: 'acct-list', workspaceId: 'ws-1', profiles: [{ id: 'p1', brandName: 'X', voice: 'v' }] });
  store.upsert({ accountId: 'acct-list', workspaceId: 'ws-2', profiles: [{ id: 'p2', brandName: 'Y', voice: 'v' }] });
  store.upsert({ accountId: 'acct-other', workspaceId: 'ws-z', profiles: [{ id: 'pz', brandName: 'Z', voice: 'v' }] });

  const docs = store.list('acct-list');
  assert.equal(docs.length, 2);
  const ids = docs.map((d) => d.workspaceId).sort();
  assert.deepEqual(ids, ['ws-1', 'ws-2']);
});

