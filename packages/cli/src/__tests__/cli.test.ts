import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

test('CLI compiles example brief/profile and writes output envelope', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-compiler-cli-'));
  const outputPath = path.join(tempDir, 'result.json');
  const briefPath = path.resolve(process.cwd(), '../../examples/brief.cinematic-afterglow.json');
  const profilePath = path.resolve(process.cwd(), '../../examples/profile.ljv-signal-core.json');

  const run = runCli(['--brief', briefPath, '--profile', profilePath, '--include-generic', '--output', outputPath]);

  assert.equal(run.status, 0, `expected exit code 0, got ${run.status} with stderr: ${run.stderr}`);
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
