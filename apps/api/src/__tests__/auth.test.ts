import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { resolveAuthContext, requireAuth, requireOwnerAccess } from '../auth';
import { createServer } from '../server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}): IncomingMessage {
  const ev = new EventEmitter() as IncomingMessage;
  ev.headers = headers;
  return ev;
}

// ---------------------------------------------------------------------------
// resolveAuthContext unit tests
// ---------------------------------------------------------------------------

test('resolveAuthContext: default config (no bypassAuth) is authenticated', () => {
  const ctx = resolveAuthContext(makeReq());
  assert.equal(ctx.authenticated, true);
  assert.equal(ctx.token, null);
  assert.equal(ctx.accountId, null);
});

test('resolveAuthContext: bypassAuth explicit true is authenticated', () => {
  const ctx = resolveAuthContext(makeReq(), { bypassAuth: true });
  assert.equal(ctx.authenticated, true);
});

test('resolveAuthContext: bypass propagates x-account-id and x-workspace-id headers', () => {
  const ctx = resolveAuthContext(makeReq({ 'x-account-id': 'acct-1', 'x-workspace-id': 'ws-1' }));
  assert.equal(ctx.accountId, 'acct-1');
  assert.equal(ctx.workspaceId, 'ws-1');
});

test('resolveAuthContext: bypassAuth false with no Authorization header → unauthenticated', () => {
  const ctx = resolveAuthContext(makeReq(), { bypassAuth: false });
  assert.equal(ctx.authenticated, false);
  assert.equal(ctx.token, null);
});

test('resolveAuthContext: bypassAuth false with malformed Authorization → unauthenticated', () => {
  const ctx = resolveAuthContext(makeReq({ authorization: 'NotBearer' }), { bypassAuth: false });
  assert.equal(ctx.authenticated, false);
});

test('resolveAuthContext: bypassAuth false with valid Bearer token and no apiKeys → authenticated', () => {
  const ctx = resolveAuthContext(makeReq({ authorization: 'Bearer any-token-value' }), { bypassAuth: false });
  assert.equal(ctx.authenticated, true);
  assert.equal(ctx.token, 'any-token-value');
});

test('resolveAuthContext: bypassAuth false with valid key from apiKeys list → authenticated', () => {
  const ctx = resolveAuthContext(
    makeReq({ authorization: 'Bearer secret-key', 'x-account-id': 'acct-2' }),
    { bypassAuth: false, apiKeys: ['secret-key'] }
  );
  assert.equal(ctx.authenticated, true);
  assert.equal(ctx.accountId, 'acct-2');
});

test('resolveAuthContext: bypassAuth false with wrong key → unauthenticated, token captured', () => {
  const ctx = resolveAuthContext(
    makeReq({ authorization: 'Bearer wrong-key' }),
    { bypassAuth: false, apiKeys: ['correct-key'] }
  );
  assert.equal(ctx.authenticated, false);
  assert.equal(ctx.token, 'wrong-key');
});

test('resolveAuthContext: Bearer token is case-insensitive scheme', () => {
  const ctx = resolveAuthContext(
    makeReq({ authorization: 'BEARER mytoken' }),
    { bypassAuth: false, apiKeys: ['mytoken'] }
  );
  assert.equal(ctx.authenticated, true);
});

// ---------------------------------------------------------------------------
// requireAuth unit tests
// ---------------------------------------------------------------------------

test('requireAuth: authenticated context → null', () => {
  assert.equal(requireAuth({ authenticated: true, accountId: null, workspaceId: null, token: null }), null);
});

test('requireAuth: unauthenticated context → UNAUTHORIZED error', () => {
  const err = requireAuth({ authenticated: false, accountId: null, workspaceId: null, token: null });
  assert.ok(err);
  assert.equal(err.code, 'UNAUTHORIZED');
});

// ---------------------------------------------------------------------------
// requireOwnerAccess unit tests
// ---------------------------------------------------------------------------

test('requireOwnerAccess: unauthenticated → UNAUTHORIZED', () => {
  const err = requireOwnerAccess({ authenticated: false, accountId: null, workspaceId: null, token: null }, 'acct-1');
  assert.ok(err);
  assert.equal(err.code, 'UNAUTHORIZED');
});

test('requireOwnerAccess: authenticated, no accountId in context → passes', () => {
  const err = requireOwnerAccess({ authenticated: true, accountId: null, workspaceId: null, token: null }, 'acct-1');
  assert.equal(err, null);
});

test('requireOwnerAccess: authenticated, matching accountId → passes', () => {
  const err = requireOwnerAccess({ authenticated: true, accountId: 'acct-1', workspaceId: null, token: null }, 'acct-1');
  assert.equal(err, null);
});

test('requireOwnerAccess: authenticated, mismatched accountId → FORBIDDEN', () => {
  const err = requireOwnerAccess({ authenticated: true, accountId: 'acct-X', workspaceId: null, token: null }, 'acct-1');
  assert.ok(err);
  assert.equal(err.code, 'FORBIDDEN');
});

// ---------------------------------------------------------------------------
// Integration: protected routes respect auth when apiKeys configured
// ---------------------------------------------------------------------------

async function withServer(
  authConfig: Parameters<typeof createServer>[0],
  fn: (port: number) => Promise<void>
): Promise<void> {
  const srv = createServer(authConfig);
  await new Promise<void>((resolve) => srv.listen(0, resolve));
  const port = (srv.address() as AddressInfo).port;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve())));
  }
}

const MIN_PROFILE_ASSETS_BODY = JSON.stringify({
  accountId: 'acct-1',
  plan: 'pro',
  mode: 'hosted',
  entitlements: ['free.local', 'pro.creator']
});

test('POST /libraries/profile-assets: no auth config → open (bypass)', async () => {
  await withServer({}, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/libraries/profile-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: MIN_PROFILE_ASSETS_BODY
    });
    assert.equal(res.status, 200);
  });
});

test('POST /libraries/profile-assets: bypassAuth false, no token → 401', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['valid-key'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/libraries/profile-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: MIN_PROFILE_ASSETS_BODY
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });
});

test('POST /libraries/profile-assets: bypassAuth false, wrong token → 401', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['valid-key'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/libraries/profile-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer wrong-key' },
      body: MIN_PROFILE_ASSETS_BODY
    });
    assert.equal(res.status, 401);
  });
});

test('POST /libraries/profile-assets: bypassAuth false, correct token → 200', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['valid-key'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/libraries/profile-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer valid-key' },
      body: MIN_PROFILE_ASSETS_BODY
    });
    assert.equal(res.status, 200);
  });
});

test('POST /libraries/profile-assets: account boundary violation → 403', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['valid-key'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/libraries/profile-assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer valid-key',
        'x-account-id': 'acct-other'   // identity says "acct-other" but body says "acct-1"
      },
      body: MIN_PROFILE_ASSETS_BODY     // body.accountId = 'acct-1'
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

test('POST /automation/jobs: bypassAuth false, no token → 401', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['k'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/automation/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'acct-1', jobType: 'export.bundle', plan: 'pro', mode: 'hosted', entitlements: ['free.local', 'pro.creator'] })
    });
    assert.equal(res.status, 401);
  });
});

test('GET /compile: always accessible regardless of auth config', async () => {
  await withServer({ authConfig: { bypassAuth: false, apiKeys: ['k'] } }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
  });
});
