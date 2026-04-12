import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { compilePromptBundle, BrandProfile, PromptBrief } from '@prompt-compiler/core';
import { createServer } from '../server';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, 'examples', 'brief.cinematic-afterglow.json');
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Could not locate repository root for parity tests.');
    }
    current = parent;
  }
}

const repoRoot = findRepoRoot(__dirname);
const briefPath = path.join(repoRoot, 'examples', 'brief.cinematic-afterglow.json');
const profilePath = path.join(repoRoot, 'examples', 'profile.ljv-signal-core.json');
const cliEntryPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'cli', 'src', 'index.js');

const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8')) as PromptBrief;
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as BrandProfile;

function withoutGeneratedAt<T extends { generatedAt: string }>(bundle: T): Omit<T, 'generatedAt'> {
  const { generatedAt: _discarded, ...rest } = bundle;
  return rest;
}

test('POST /compile matches shared core output shape', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, profile })
  });

  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    result: ReturnType<typeof compilePromptBundle>;
  };
  assert.equal(payload.ok, true);

  const expected = compilePromptBundle(brief, profile);
  assert.deepEqual(withoutGeneratedAt(payload.result), withoutGeneratedAt(expected));
});

test('GET /session/bootstrap exposes the shared hosted entitlement contract', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(
    `http://127.0.0.1:${address.port}/session/bootstrap?plan=studio&mode=hosted&entitlements=credits.compute&accountId=acct-1&workspaceId=workspace-1&creditBalance=24`
  );

  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    result: {
      account: { accountId: string; workspaceId?: string; plan: string; mode: string };
      entitlements: { entitlements: string[]; features: Array<{ key: string; enabled: boolean }>; creditBalance: number | null };
      flags: { hostedSyncEnabled: boolean; workflowAutomationEnabled: boolean; billingEnabled: boolean };
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result.account.accountId, 'acct-1');
  assert.equal(payload.result.account.workspaceId, 'workspace-1');
  assert.deepEqual(payload.result.entitlements.entitlements, ['free.local', 'pro.creator', 'studio.team', 'credits.compute']);
  assert.equal(payload.result.flags.hostedSyncEnabled, true);
  assert.equal(payload.result.flags.workflowAutomationEnabled, true);
  assert.equal(payload.result.flags.billingEnabled, true);
  assert.equal(
    payload.result.entitlements.features.some((item) => item.key === 'automation.jobs' && item.enabled),
    true
  );
});

test('POST /libraries/profile-sync-manifest returns a deterministic manifest contract', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/libraries/profile-sync-manifest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'acct-sync',
      workspaceId: 'workspace-1',
      entitlements: ['free.local', 'pro.creator'],
      generatedAt: '2026-04-12T06:00:00.000Z',
      profiles: [
        {
          ...profile,
          version: '3',
          updatedAt: '2026-04-12T05:00:00.000Z'
        }
      ],
      templatePacks: [
        {
          id: 'pack-sync',
          name: 'Sync Pack',
          templates: { generic: { prefix: 'sync:' } },
          version: '2',
          updatedAt: '2026-04-11T22:00:00.000Z'
        }
      ]
    })
  });

  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    result: {
      manifestVersion: string;
      cursor: string;
      entitlements: string[];
      assets: Array<{ assetType: string; assetId: string; checksum: string }>;
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result.manifestVersion, '1');
  assert.equal(payload.result.cursor, '2026-04-12T06:00:00.000Z:2');
  assert.deepEqual(payload.result.entitlements, ['free.local', 'pro.creator']);
  assert.deepEqual(
    payload.result.assets.map((asset) => [asset.assetType, asset.assetId]),
    [
      ['brand-profile', profile.id],
      ['template-pack', 'pack-sync']
    ]
  );
  assert.equal(payload.result.assets.every((asset) => asset.checksum.length === 64), true);
});

test('POST /libraries/profile-assets enforces hosted sync entitlement', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/libraries/profile-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'acct-free',
      workspaceId: 'workspace-1',
      plan: 'free',
      mode: 'local',
      entitlements: ['free.local'],
      profiles: [
        {
          ...profile,
          version: '1'
        }
      ]
    })
  });

  assert.equal(response.status, 403);
});

test('POST/GET /libraries/profile-assets persists and returns hosted library document plus manifest', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const upsertResponse = await fetch(`http://127.0.0.1:${address.port}/libraries/profile-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'acct-pro',
      workspaceId: 'workspace-1',
      plan: 'pro',
      mode: 'hosted',
      entitlements: ['free.local', 'pro.creator'],
      updatedAt: '2026-04-12T08:30:00.000Z',
      profiles: [
        {
          ...profile,
          id: 'profile-sync',
          brandName: 'Sync Profile',
          version: '1'
        }
      ],
      templatePacks: [
        {
          id: 'pack-sync',
          name: 'Sync Pack',
          templates: { generic: { prefix: 'sync:' } },
          version: '1'
        }
      ]
    })
  });

  assert.equal(upsertResponse.status, 200);

  const getResponse = await fetch(
    `http://127.0.0.1:${address.port}/libraries/profile-assets?accountId=acct-pro&workspaceId=workspace-1&plan=pro&mode=hosted&entitlements=free.local,pro.creator`
  );

  assert.equal(getResponse.status, 200);

  const payload = (await getResponse.json()) as {
    ok: boolean;
    result: {
      document: {
        accountId: string;
        profiles: Array<{ id: string }>;
        templatePacks: Array<{ id: string }>;
      };
      manifest: {
        manifestVersion: string;
        assets: Array<{ assetType: string; assetId: string }>;
      };
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result.document.accountId, 'acct-pro');
  assert.deepEqual(payload.result.document.profiles.map((item) => item.id), ['profile-sync']);
  assert.deepEqual(payload.result.document.templatePacks.map((item) => item.id), ['pack-sync']);
  assert.equal(payload.result.manifest.manifestVersion, '1');
  assert.deepEqual(
    payload.result.manifest.assets.map((asset) => [asset.assetType, asset.assetId]),
    [
      ['brand-profile', 'profile-sync'],
      ['template-pack', 'pack-sync']
    ]
  );
});

test('POST /automation/jobs rejects requests without the required hosted capability', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/automation/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'acct-free',
      jobType: 'compile-batch',
      plan: 'free',
      mode: 'local',
      entitlements: ['free.local'],
      creditsRequested: 2,
      inputSummary: { bundleCount: 3 }
    })
  });

  assert.equal(response.status, 403);

  const payload = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'FORBIDDEN');
});

test('POST /automation/jobs returns a queued automation envelope when entitlements allow it', async (context) => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  context.after(() => {
    server.close();
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/automation/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: 'acct-studio',
      workspaceId: 'workspace-1',
      jobType: 'compile-batch',
      plan: 'studio',
      mode: 'hosted',
      entitlements: ['free.local', 'pro.creator', 'studio.team', 'credits.compute'],
      creditsRequested: 2,
      createdAt: '2026-04-12T06:15:00.000Z',
      inputSummary: { bundleCount: 3, profileCount: 2 }
    })
  });

  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    ok: boolean;
    result: {
      jobId: string;
      status: string;
      requiredFeature: string;
      creditsReserved: number;
      inputSummary: Record<string, string | number | boolean>;
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result.status, 'queued');
  assert.equal(payload.result.requiredFeature, 'compute.batch');
  assert.equal(payload.result.creditsReserved, 2);
  assert.ok(payload.result.jobId.startsWith('job-compile-batch-'));
  assert.deepEqual(payload.result.inputSummary, { bundleCount: 3, profileCount: 2 });
});

test('CLI compile output matches shared core output shape', () => {
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      path.join(repoRoot, 'packages', 'cli', 'tsconfig.json')
    ],
    { stdio: 'ignore' }
  );

  const command = spawnSync(
    'node',
    [cliEntryPath, '--brief', briefPath, '--profile', profilePath],
    { encoding: 'utf8' }
  );

  assert.equal(command.status, 0, command.stderr);

  const payload = JSON.parse(command.stdout) as {
    ok: boolean;
    result: ReturnType<typeof compilePromptBundle>;
  };

  assert.equal(payload.ok, true);

  const expected = compilePromptBundle(brief, profile);
  assert.deepEqual(withoutGeneratedAt(payload.result), withoutGeneratedAt(expected));
});
