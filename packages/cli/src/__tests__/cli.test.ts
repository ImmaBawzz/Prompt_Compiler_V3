import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [path.resolve(process.cwd(), 'dist/cli/src/index.js'), ...args], {
    encoding: 'utf8'
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function runCliAsync(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [path.resolve(process.cwd(), 'dist/cli/src/index.js'), ...args], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const status = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });

  return { status, stdout, stderr };
}

test('CLI compiles example brief/profile and writes output envelope', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-'));
  const outputPath = path.join(tempDir, 'result.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  const run = runCli(['--brief', briefPath, '--profile', profilePath, '--include-generic', '--output', outputPath]);

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stdout: ${run.stdout} stderr: ${run.stderr}`);
  assert.equal(fs.existsSync(outputPath), true);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: {
      outputs?: Array<{ target: string; content: string }>;
      diagnostics?: Array<{ level: string }>;
    };
  };

  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.result?.outputs));
  assert.ok((payload.result?.outputs?.length ?? 0) > 0);
  const hasSuno = payload.result?.outputs?.some((item) => item.target === 'suno' && item.content.length > 0);
  assert.equal(hasSuno, true);
  assert.ok(Array.isArray(payload.result?.diagnostics));
});

test('CLI help returns success and usage text', () => {
  const run = runCli(['--help']);

  assert.equal(run.status, 0);
  assert.match(run.stderr, /Prompt Compiler CLI/);
  assert.match(run.stderr, /Usage:/);
});

test('CLI execute flag posts selected output to /execute using provider config', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/execute') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += String(chunk);
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { provider?: { type?: string }; content?: string; target?: string };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              requestId: 'req-test',
              provider: body.provider?.type ?? 'dry-run',
              target: body.target,
              echoedLength: body.content?.length ?? 0,
              executedAt: '2026-04-12T00:00:00.000Z'
            }
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-exec-'));
  const outputPath = path.join(tempDir, 'result.json');
  const providerConfigPath = path.join(tempDir, 'provider-config.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  fs.writeFileSync(
    providerConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        provider: {
          id: 'local-dry',
          type: 'dry-run'
        },
        target: 'suno'
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--brief',
    briefPath,
    '--profile',
    profilePath,
    '--execute',
    '--provider-config',
    providerConfigPath,
    '--output',
    outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stdout: ${run.stdout} stderr: ${run.stderr}`);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: {
      compilation?: unknown;
      execution?: { requestId?: string; provider?: string; target?: string };
    };
  };

  assert.equal(payload.ok, true);
  assert.ok(payload.result?.compilation);
  assert.equal(payload.result?.execution?.requestId, 'req-test');
  assert.equal(payload.result?.execution?.provider, 'dry-run');
  assert.equal(payload.result?.execution?.target, 'suno');
});

test('CLI --policy-timeout/retries/retry-delay flags are forwarded in execute payload', async () => {
  let capturedBody: Record<string, unknown> = {};

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/execute') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += String(chunk);
      });
      req.on('end', () => {
        capturedBody = JSON.parse(raw) as Record<string, unknown>;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              requestId: 'req-policy',
              provider: 'dry-run',
              target: 'suno',
              echoedLength: 0,
              executedAt: '2026-04-12T00:00:00.000Z'
            }
          })
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-policy-'));
  const outputPath = path.join(tempDir, 'result.json');
  const providerConfigPath = path.join(tempDir, 'provider-config.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  fs.writeFileSync(
    providerConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        provider: { id: 'local-dry', type: 'dry-run' },
        target: 'suno'
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--brief', briefPath,
    '--profile', profilePath,
    '--execute',
    '--provider-config', providerConfigPath,
    '--policy-timeout', '5000',
    '--policy-retries', '2',
    '--policy-retry-delay', '100',
    '--output', outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status}\nstdout:${run.stdout}\nstderr:${run.stderr}`);

  const policy = capturedBody.policy as { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } | undefined;
  assert.ok(policy, 'expected policy to be present in execute payload');
  assert.equal(policy?.timeoutMs, 5000, 'expected timeoutMs from --policy-timeout');
  assert.equal(policy?.maxRetries, 2, 'expected maxRetries from --policy-retries');
  assert.equal(policy?.retryDelayMs, 100, 'expected retryDelayMs from --policy-retry-delay');
});

test('CLI publish flag posts bundle to /publish/jobs using publish config', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/publish/jobs') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += String(chunk);
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { target?: { kind?: string } };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              jobId: 'job-publish-test',
              status: body.target?.kind === 'dry-run' ? 'delivered' : 'queued',
              updatedAt: '2026-04-12T00:00:00.000Z'
            }
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-publish-'));
  const outputPath = path.join(tempDir, 'result.json');
  const publishConfigPath = path.join(tempDir, 'publish-config.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  fs.writeFileSync(
    publishConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        target: {
          id: 'publish-dry',
          kind: 'dry-run'
        },
        publishPayload: {
          source: 'cli-test'
        }
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--brief',
    briefPath,
    '--profile',
    profilePath,
    '--publish',
    '--publish-config',
    publishConfigPath,
    '--output',
    outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stderr: ${run.stderr}`);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: {
      compilation?: unknown;
      publish?: { jobId?: string; status?: string };
    };
  };

  assert.equal(payload.ok, true);
  assert.ok(payload.result?.compilation);
  assert.equal(payload.result?.publish?.jobId, 'job-publish-test');
  assert.equal(payload.result?.publish?.status, 'delivered');
});

test('CLI install-listing posts to /marketplace/install using marketplace config', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/marketplace/install') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += String(chunk);
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { listingId?: string };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              installed: true,
              listingId: body.listingId,
              libraryEntry: { profiles: [], templatePacks: [] }
            }
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-marketplace-'));
  const outputPath = path.join(tempDir, 'result.json');
  const marketplaceConfigPath = path.join(tempDir, 'marketplace-config.json');

  fs.writeFileSync(
    marketplaceConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        accountId: 'acct-test',
        workspaceId: 'ws-test'
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--install-listing',
    'listing-123',
    '--marketplace-config',
    marketplaceConfigPath,
    '--output',
    outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stdout: ${run.stdout} stderr: ${run.stderr}`);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: { installed?: boolean; listingId?: string };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result?.installed, true);
  assert.equal(payload.result?.listingId, 'listing-123');
});

test('CLI review-start and review-status execute review lifecycle against API', async () => {
  const reviews = new Map<string, { bundleId: string; workspaceId: string; status: string }>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'POST' && url.pathname === '/reviews/bundles') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += String(chunk);
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { bundleId: string; workspaceId: string };
        const record = { bundleId: body.bundleId, workspaceId: body.workspaceId, status: 'draft' };
        reviews.set(body.bundleId, record);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: record }));
      });
      return;
    }

    const submitMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/submit$/);
    if (req.method === 'POST' && submitMatch) {
      const bundleId = decodeURIComponent(submitMatch[1]);
      const existing = reviews.get(bundleId) ?? { bundleId, workspaceId: 'ws-review', status: 'draft' };
      const next = { ...existing, status: 'in_review' };
      reviews.set(bundleId, next);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: next }));
      return;
    }

    const statusMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)$/);
    if (req.method === 'GET' && statusMatch) {
      const bundleId = decodeURIComponent(statusMatch[1]);
      const existing = reviews.get(bundleId) ?? { bundleId, workspaceId: 'ws-review', status: 'in_review' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: existing }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-review-'));
  const outputPath = path.join(tempDir, 'result.json');
  const reviewConfigPath = path.join(tempDir, 'review-config.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  fs.writeFileSync(
    reviewConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        accountId: 'acct-reviewer',
        workspaceId: 'ws-review',
        requiredApprovals: 2
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--brief',
    briefPath,
    '--profile',
    profilePath,
    '--review-start',
    '--review-status',
    '--review-config',
    reviewConfigPath,
    '--output',
    outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stdout: ${run.stdout} stderr: ${run.stderr}`);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: {
      compilation?: unknown;
      review?: {
        start?: { status?: string };
        submit?: { status?: string };
        status?: { status?: string };
      };
    };
  };

  assert.equal(payload.ok, true);
  assert.ok(payload.result?.compilation);
  assert.equal(payload.result?.review?.start?.status, 'draft');
  assert.equal(payload.result?.review?.submit?.status, 'in_review');
  assert.equal(payload.result?.review?.status?.status, 'in_review');
});

test('CLI review-only mode supports comment, decision, and status with explicit review bundle id', async () => {
  const reviews = new Map<string, { bundleId: string; workspaceId: string; status: string }>();
  reviews.set('bundle-explicit', {
    bundleId: 'bundle-explicit',
    workspaceId: 'ws-review',
    status: 'in_review'
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    const commentMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/comments$/);
    if (req.method === 'POST' && commentMatch) {
      const bundleId = decodeURIComponent(commentMatch[1]);
      const existing = reviews.get(bundleId) ?? { bundleId, workspaceId: 'ws-review', status: 'in_review' };
      reviews.set(bundleId, existing);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: existing }));
      return;
    }

    const decisionMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/decisions$/);
    if (req.method === 'POST' && decisionMatch) {
      const bundleId = decodeURIComponent(decisionMatch[1]);
      const existing = reviews.get(bundleId) ?? { bundleId, workspaceId: 'ws-review', status: 'in_review' };
      const next = { ...existing, status: 'approved' };
      reviews.set(bundleId, next);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: next }));
      return;
    }

    const statusMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)$/);
    if (req.method === 'GET' && statusMatch) {
      const bundleId = decodeURIComponent(statusMatch[1]);
      const existing = reviews.get(bundleId) ?? { bundleId, workspaceId: 'ws-review', status: 'in_review' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: existing }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-review-only-'));
  const outputPath = path.join(tempDir, 'result.json');
  const reviewConfigPath = path.join(tempDir, 'review-config.json');

  fs.writeFileSync(
    reviewConfigPath,
    JSON.stringify(
      {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        accountId: 'acct-reviewer',
        workspaceId: 'ws-review'
      },
      null,
      2
    ),
    'utf8'
  );

  const run = await runCliAsync([
    '--review-bundle-id',
    'bundle-explicit',
    '--review-comment',
    'Looks ready to ship.',
    '--review-decision',
    'approve',
    '--review-status',
    '--review-config',
    reviewConfigPath,
    '--output',
    outputPath
  ]);

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stdout: ${run.stdout} stderr: ${run.stderr}`);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
    ok: boolean;
    result?: {
      bundleId?: string;
      review?: {
        comment?: { status?: string };
        decision?: { status?: string };
        status?: { status?: string };
      };
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.result?.bundleId, 'bundle-explicit');
  assert.equal(payload.result?.review?.comment?.status, 'in_review');
  assert.equal(payload.result?.review?.decision?.status, 'approved');
  assert.equal(payload.result?.review?.status?.status, 'approved');
});
