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
