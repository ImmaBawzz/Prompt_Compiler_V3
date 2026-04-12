import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';
import { createInMemoryWorkspaceMemberStore } from '../workspaceMemberStore';

// ---------------------------------------------------------------------------
// WorkspaceMemberStore unit tests
// ---------------------------------------------------------------------------

test('workspace member store: addMember and getMember', () => {
  const store = createInMemoryWorkspaceMemberStore();
  const m = store.addMember('ws-1', 'acct-1', 'owner');

  assert.equal(m.workspaceId, 'ws-1');
  assert.equal(m.accountId, 'acct-1');
  assert.equal(m.role, 'owner');
  assert.ok(m.addedAt);

  const got = store.getMember('ws-1', 'acct-1');
  assert.ok(got);
  assert.equal(got.role, 'owner');
});

test('workspace member store: getMember returns undefined for unknown member', () => {
  const store = createInMemoryWorkspaceMemberStore();
  assert.equal(store.getMember('ws-x', 'acct-y'), undefined);
});

test('workspace member store: listMembers scoped to workspace', () => {
  const store = createInMemoryWorkspaceMemberStore();
  store.addMember('ws-1', 'acct-a', 'owner');
  store.addMember('ws-1', 'acct-b', 'editor');
  store.addMember('ws-2', 'acct-c', 'viewer');

  const ws1Members = store.listMembers('ws-1');
  assert.equal(ws1Members.length, 2);
  const ws2Members = store.listMembers('ws-2');
  assert.equal(ws2Members.length, 1);
});

test('workspace member store: updateRole changes role', () => {
  const store = createInMemoryWorkspaceMemberStore();
  store.addMember('ws-1', 'acct-1', 'viewer');
  const updated = store.updateRole('ws-1', 'acct-1', 'editor');

  assert.ok(updated);
  assert.equal(updated.role, 'editor');
  assert.equal(store.getMember('ws-1', 'acct-1')?.role, 'editor');
});

test('workspace member store: updateRole returns undefined for unknown member', () => {
  const store = createInMemoryWorkspaceMemberStore();
  const result = store.updateRole('ws-x', 'acct-notfound', 'editor');
  assert.equal(result, undefined);
});

test('workspace member store: removeMember returns true on success', () => {
  const store = createInMemoryWorkspaceMemberStore();
  store.addMember('ws-1', 'acct-1', 'editor');
  const removed = store.removeMember('ws-1', 'acct-1');

  assert.equal(removed, true);
  assert.equal(store.getMember('ws-1', 'acct-1'), undefined);
});

test('workspace member store: removeMember returns false for unknown member', () => {
  const store = createInMemoryWorkspaceMemberStore();
  assert.equal(store.removeMember('ws-x', 'acct-nobody'), false);
});

// ---------------------------------------------------------------------------
// Route integration tests
// ---------------------------------------------------------------------------

interface ServerContext {
  port: number;
}

async function withWorkspaceServer(
  fn: (ctx: ServerContext) => Promise<void>
): Promise<void> {
  const memberStore = createInMemoryWorkspaceMemberStore();
  // Seed workspace: acct-owner is the owner; acct-editor is an editor
  memberStore.addMember('ws-test', 'acct-owner', 'owner');
  memberStore.addMember('ws-test', 'acct-editor', 'editor');
  memberStore.addMember('ws-test', 'acct-viewer', 'viewer');

  // Use bypassAuth with x-account-id identity injection
  const srv = createServer({
    authConfig: { bypassAuth: true },
    workspaceMemberStore: memberStore
  });

  await new Promise<void>((resolve) => srv.listen(0, resolve));
  const port = (srv.address() as AddressInfo).port;

  try {
    await fn({ port });
  } finally {
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test('GET /workspaces/:id/members: viewer can list members', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members`, {
      headers: { 'x-account-id': 'acct-viewer' }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; result: { members: unknown[] } };
    assert.equal(body.ok, true);
    assert.equal(body.result.members.length, 3);
  });
});

test('GET /workspaces/:id/members: non-member is forbidden', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members`, {
      headers: { 'x-account-id': 'acct-stranger' }
    });
    assert.equal(res.status, 403);
  });
});

test('POST /workspaces/:id/members: owner can add a new member', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-owner' },
      body: JSON.stringify({ accountId: 'acct-new', role: 'viewer' })
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { ok: boolean; result: { member: { role: string } } };
    assert.equal(body.result.member.role, 'viewer');
  });
});

test('POST /workspaces/:id/members: editor cannot add members (owner only)', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({ accountId: 'acct-new2', role: 'viewer' })
    });
    assert.equal(res.status, 403);
  });
});

test('PATCH /workspaces/:id/members/:accountId: owner can update role', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members/acct-editor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-owner' },
      body: JSON.stringify({ role: 'viewer' })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; result: { member: { role: string } } };
    assert.equal(body.result.member.role, 'viewer');
  });
});

test('DELETE /workspaces/:id/members/:accountId: owner can remove a member', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members/acct-editor`, {
      method: 'DELETE',
      headers: { 'x-account-id': 'acct-owner' }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; result: { removed: boolean } };
    assert.equal(body.result.removed, true);
  });
});

test('DELETE /workspaces/:id/members/:accountId: removing non-existent member → 404', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members/acct-nobody`, {
      method: 'DELETE',
      headers: { 'x-account-id': 'acct-owner' }
    });
    assert.equal(res.status, 404);
  });
});

test('PATCH /workspaces/:id/members/:accountId: invalid role → 400', async () => {
  await withWorkspaceServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces/ws-test/members/acct-editor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-owner' },
      body: JSON.stringify({ role: 'superadmin' })
    });
    assert.equal(res.status, 400);
  });
});
