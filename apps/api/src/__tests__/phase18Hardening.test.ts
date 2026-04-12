import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('phase18 smoke: compile -> execute(dry-run) -> feedback -> aggregate', async () => {
  await withServer(async (port) => {
    const compileRes = await fetch(`http://127.0.0.1:${port}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief: {
          id: 'brief-smoke',
          title: 'Smoke Journey',
          concept: 'A cinematic pulse turning memory into motion.',
          targets: ['suno'],
          genres: ['cinematic'],
          mood: ['uplifting']
        },
        profile: {
          id: 'profile-smoke',
          brandName: 'LJV',
          voice: 'poetic and exact'
        }
      })
    });

    assert.equal(compileRes.status, 200);
    const compileBody = (await compileRes.json()) as {
      ok: boolean;
      result: { briefId: string; profileId: string; outputs: Array<{ target: string; content: string }> };
    };

    const output = compileBody.result.outputs[0];
    assert.ok(output);

    const executeRes = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: output.content,
        target: output.target,
        bundleId: 'bundle-smoke',
        profileId: compileBody.result.profileId,
        provider: { id: 'dry', type: 'dry-run' }
      })
    });

    assert.equal(executeRes.status, 200);
    const executeBody = (await executeRes.json()) as { ok: boolean; result: { isDryRun: boolean } };
    assert.equal(executeBody.ok, true);
    assert.equal(executeBody.result.isDryRun, true);

    const feedbackRes = await fetch(`http://127.0.0.1:${port}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundleId: 'bundle-smoke',
        profileId: compileBody.result.profileId,
        target: output.target,
        score: 4,
        acceptedAt: '2026-04-12T00:00:00.000Z'
      })
    });

    assert.equal(feedbackRes.status, 201);

    const aggregateRes = await fetch(
      `http://127.0.0.1:${port}/feedback/aggregate?profileId=${encodeURIComponent(compileBody.result.profileId)}`
    );
    assert.equal(aggregateRes.status, 200);
    const aggregateBody = (await aggregateRes.json()) as {
      ok: boolean;
      result: { totalRecords: number; acceptedCount: number };
    };
    assert.equal(aggregateBody.result.totalRecords, 1);
    assert.equal(aggregateBody.result.acceptedCount, 1);
  });
});

test('phase18 smoke: publish(dry-run) and marketplace list/install', async () => {
  await withServer(async (port) => {
    const publishRes = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundleId: 'bundle-publish',
        profileId: 'profile-publish',
        target: { id: 'dry-publish', kind: 'dry-run' },
        publishPayload: { source: 'phase18-smoke' }
      })
    });

    assert.equal(publishRes.status, 201);

    const createListingRes = await fetch(`http://127.0.0.1:${port}/marketplace/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingType: 'brand-profile',
        publishedBy: 'acct-creator',
        displayName: 'Smoke Profile Listing',
        entitlements: ['pro.creator'],
        listingPayload: {
          id: 'profile-installable',
          brandName: 'Installable Profile',
          voice: 'focused'
        }
      })
    });

    assert.equal(createListingRes.status, 201);
    const createdListingBody = (await createListingRes.json()) as {
      ok: boolean;
      result: { listingId: string };
    };

    const listRes = await fetch(`http://127.0.0.1:${port}/marketplace/listings`);
    assert.equal(listRes.status, 200);

    const installRes = await fetch(`http://127.0.0.1:${port}/marketplace/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: createdListingBody.result.listingId,
        accountId: 'acct-consumer',
        workspaceId: 'workspace-1'
      })
    });

    assert.equal(installRes.status, 200);
    const installBody = (await installRes.json()) as { ok: boolean; result: { installed: boolean } };
    assert.equal(installBody.result.installed, true);
  });
});

test('phase18 failure paths: execute/publish entitlement and missing marketplace listing', async () => {
  await withServer(async (port) => {
    const executeForbidden = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'hello',
        target: 'generic',
        bundleId: 'bundle-x',
        profileId: 'profile-x',
        provider: { id: 'openai', type: 'openai-compatible', baseUrl: 'https://example.invalid/v1', model: 'x' },
        plan: 'pro',
        mode: 'hosted',
        entitlements: ['free.local', 'pro.creator']
      })
    });
    assert.equal(executeForbidden.status, 403);

    const publishForbidden = await fetch(`http://127.0.0.1:${port}/publish/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundleId: 'bundle-x',
        profileId: 'profile-x',
        target: { id: 'webhook', kind: 'webhook', url: 'https://example.invalid/publish' },
        mode: 'hosted',
        plan: 'pro',
        entitlements: ['free.local', 'pro.creator']
      })
    });
    assert.equal(publishForbidden.status, 403);

    const installMissing = await fetch(`http://127.0.0.1:${port}/marketplace/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: 'missing-listing',
        accountId: 'acct-consumer'
      })
    });
    assert.equal(installMissing.status, 404);
  });
});
