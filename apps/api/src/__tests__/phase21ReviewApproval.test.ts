import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';
import { createInMemoryWorkspaceMemberStore } from '../workspaceMemberStore';

async function withWorkspaceReviewServer(fn: (port: number) => Promise<void>): Promise<void> {
  const workspaceMemberStore = createInMemoryWorkspaceMemberStore();
  workspaceMemberStore.addMember('ws-review', 'acct-owner', 'owner');
  workspaceMemberStore.addMember('ws-review', 'acct-editor', 'editor');
  workspaceMemberStore.addMember('ws-review', 'acct-viewer', 'viewer');

  const server = createServer({
    authConfig: { bypassAuth: true },
    workspaceMemberStore
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function withWebhookReceiver(fn: (url: string) => Promise<void>): Promise<void> {
  const receiver = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => receiver.listen(0, resolve));
  const port = (receiver.address() as AddressInfo).port;

  try {
    await fn(`http://127.0.0.1:${port}/publish`);
  } finally {
    await new Promise<void>((resolve, reject) => receiver.close((err) => (err ? reject(err) : resolve())));
  }
}

test('phase21 review lifecycle: editor creates, viewer comments, editor approves, review can be read', async () => {
  await withWorkspaceReviewServer(async (port) => {
    const createRes = await fetch(`http://127.0.0.1:${port}/reviews/bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({ bundleId: 'bundle-review-1', workspaceId: 'ws-review' })
    });
    assert.equal(createRes.status, 201);

    const commentRes = await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-1/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-viewer' },
      body: JSON.stringify({ workspaceId: 'ws-review', message: 'Looks strong, but the close needs a tighter CTA.' })
    });
    assert.equal(commentRes.status, 201);

    const submitRes = await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-1/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({ workspaceId: 'ws-review' })
    });
    assert.equal(submitRes.status, 200);

    const approveRes = await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-1/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-owner' },
      body: JSON.stringify({ workspaceId: 'ws-review', decision: 'approve', comment: 'Ready to publish.' })
    });
    assert.equal(approveRes.status, 200);
    const approveBody = (await approveRes.json()) as {
      ok: boolean;
      result: { status: string; comments: unknown[]; decisions: unknown[] };
    };
    assert.equal(approveBody.result.status, 'approved');
    assert.equal(approveBody.result.comments.length, 1);
    assert.equal(approveBody.result.decisions.length, 1);

    const getRes = await fetch(
      `http://127.0.0.1:${port}/reviews/bundles/bundle-review-1?workspaceId=${encodeURIComponent('ws-review')}`,
      { headers: { 'x-account-id': 'acct-viewer' } }
    );
    assert.equal(getRes.status, 200);
  });
});

test('phase21 publish gate: live workspace publish is forbidden before approval', async () => {
  await withWorkspaceReviewServer(async (port) => {
    await fetch(`http://127.0.0.1:${port}/reviews/bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({ bundleId: 'bundle-review-2', workspaceId: 'ws-review' })
    });

    const publishRes = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({
        bundleId: 'bundle-review-2',
        profileId: 'profile-review-2',
        workspaceId: 'ws-review',
        target: { id: 'live-webhook', kind: 'webhook', url: 'http://127.0.0.1:1/nowhere' },
        mode: 'hosted',
        plan: 'studio',
        entitlements: ['free.local', 'pro.creator', 'studio.team']
      })
    });

    assert.equal(publishRes.status, 403);
  });
});

test('phase21 publish gate: approved bundle can publish and review becomes published', async () => {
  await withWorkspaceReviewServer(async (port) => {
    await withWebhookReceiver(async (webhookUrl) => {
      await fetch(`http://127.0.0.1:${port}/reviews/bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
        body: JSON.stringify({ bundleId: 'bundle-review-3', workspaceId: 'ws-review' })
      });

      await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-3/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
        body: JSON.stringify({ workspaceId: 'ws-review' })
      });

      await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-3/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-owner' },
        body: JSON.stringify({ workspaceId: 'ws-review', decision: 'approve' })
      });

      const publishRes = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
        body: JSON.stringify({
          bundleId: 'bundle-review-3',
          profileId: 'profile-review-3',
          workspaceId: 'ws-review',
          target: { id: 'live-webhook', kind: 'webhook', url: webhookUrl },
          publishPayload: { source: 'phase21-test' },
          mode: 'hosted',
          plan: 'studio',
          entitlements: ['free.local', 'pro.creator', 'studio.team']
        })
      });
      assert.equal(publishRes.status, 201);
      const publishBody = (await publishRes.json()) as { ok: boolean; result: { status: string; workspaceId?: string } };
      assert.equal(publishBody.result.status, 'delivered');
      assert.equal(publishBody.result.workspaceId, 'ws-review');

      const reviewRes = await fetch(
        `http://127.0.0.1:${port}/reviews/bundles/bundle-review-3?workspaceId=${encodeURIComponent('ws-review')}`,
        { headers: { 'x-account-id': 'acct-owner' } }
      );
      assert.equal(reviewRes.status, 200);
      const reviewBody = (await reviewRes.json()) as { ok: boolean; result: { status: string; publishedAt?: string } };
      assert.equal(reviewBody.result.status, 'published');
      assert.ok(reviewBody.result.publishedAt);
    });
  });
});

test('phase21 review routes: viewer cannot submit approval decision', async () => {
  await withWorkspaceReviewServer(async (port) => {
    await fetch(`http://127.0.0.1:${port}/reviews/bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-editor' },
      body: JSON.stringify({ bundleId: 'bundle-review-4', workspaceId: 'ws-review' })
    });

    const decisionRes = await fetch(`http://127.0.0.1:${port}/reviews/bundles/bundle-review-4/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-account-id': 'acct-viewer' },
      body: JSON.stringify({ workspaceId: 'ws-review', decision: 'approve' })
    });

    assert.equal(decisionRes.status, 403);
  });
});
