import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, executeCompiledOutput } from '../execution';
import { ExecutionRequest } from '../types';

const dryRunProvider = {
  id: 'test-dry',
  type: 'dry-run' as const
};

const baseDryRunRequest: ExecutionRequest = {
  content: 'A cinematic dreamwave piece with vocal chopping and reversed synth pads.',
  target: 'suno',
  bundleId: 'bundle-001',
  profileId: 'profile-ljv',
  provider: dryRunProvider
};

test('estimateTokens returns positive value for non-empty text', () => {
  const tokens = estimateTokens('Hello world');
  assert.ok(tokens > 0, 'Expected positive token estimate');
});

test('estimateTokens uses ~4 chars/token heuristic', () => {
  // 40 chars → ~10 tokens
  const tokens = estimateTokens('1234567890123456789012345678901234567890');
  assert.equal(tokens, 10);
});

test('estimateTokens returns 0 for empty string', () => {
  assert.equal(estimateTokens(''), 0);
});

test('executeCompiledOutput dry-run returns isDryRun=true', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.equal(result.isDryRun, true);
  assert.equal(result.finishReason, 'dry-run');
  assert.equal(result.bundleId, 'bundle-001');
  assert.equal(result.profileId, 'profile-ljv');
  assert.equal(result.target, 'suno');
  assert.equal(result.provider, 'dry-run');
});

test('executeCompiledOutput dry-run has positive estimated tokens', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(result.estimatedTokens > 0, 'Expected positive token estimate');
});

test('executeCompiledOutput dry-run has no responseText', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.equal(result.responseText, undefined);
});

test('executeCompiledOutput dry-run latencyMs is 0 or near-0', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(result.latencyMs >= 0, 'latencyMs should be non-negative');
  assert.ok(result.latencyMs < 100, 'dry-run should complete quickly');
});

test('executeCompiledOutput dry-run sets requestId', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(typeof result.requestId === 'string' && result.requestId.length > 0);
});

test('executeCompiledOutput dry-run sets executedAt as ISO string', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(!Number.isNaN(Date.parse(result.executedAt)), 'executedAt should be parseable ISO string');
});
