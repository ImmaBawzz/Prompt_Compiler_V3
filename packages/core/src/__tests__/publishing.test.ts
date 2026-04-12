import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublishJob,
  signWebhookPayload,
  createInMemoryPublishJobStore,
  dispatchPublishJob
} from '../publishing';
import { PublishTarget } from '../types';

const dryRunTarget: PublishTarget = {
  id: 'target-dry',
  kind: 'dry-run'
};

const baseInput = {
  bundleId: 'bundle-001',
  profileId: 'profile-ljv',
  target: dryRunTarget
};

// --- createPublishJob ---

test('createPublishJob creates a job with status queued', () => {
  const job = createPublishJob(baseInput);
  assert.equal(job.status, 'queued');
  assert.equal(job.bundleId, 'bundle-001');
  assert.equal(job.profileId, 'profile-ljv');
  assert.equal(job.target.id, 'target-dry');
});

test('createPublishJob generates a jobId if not provided', () => {
  const job = createPublishJob(baseInput);
  assert.ok(typeof job.jobId === 'string' && job.jobId.length > 0);
});

test('createPublishJob respects provided jobId', () => {
  const job = createPublishJob({ ...baseInput, jobId: 'job-custom' });
  assert.equal(job.jobId, 'job-custom');
});

test('createPublishJob throws if bundleId missing', () => {
  assert.throws(() => createPublishJob({ ...baseInput, bundleId: '' }), Error);
});

test('createPublishJob throws if target.id missing', () => {
  assert.throws(
    () => createPublishJob({ ...baseInput, target: { id: '', kind: 'dry-run' } }),
    Error
  );
});

// --- signWebhookPayload ---

test('signWebhookPayload returns a non-empty hex string', () => {
  const sig = signWebhookPayload('{"test":true}', 'my-secret');
  assert.ok(typeof sig === 'string' && sig.length > 0);
  assert.ok(/^[0-9a-f]+$/.test(sig), 'Expected lowercase hex string');
});

test('signWebhookPayload is deterministic', () => {
  const body = '{"bundleId":"b1"}';
  const sig1 = signWebhookPayload(body, 'secret');
  const sig2 = signWebhookPayload(body, 'secret');
  assert.equal(sig1, sig2);
});

test('signWebhookPayload differs with different secrets', () => {
  const body = '{"bundleId":"b1"}';
  const sig1 = signWebhookPayload(body, 'secret-a');
  const sig2 = signWebhookPayload(body, 'secret-b');
  assert.notEqual(sig1, sig2);
});

// --- dispatchPublishJob (dry-run) ---

test('dispatchPublishJob dry-run delivers immediately without network call', async () => {
  const job = createPublishJob(baseInput);
  const result = await dispatchPublishJob({ job, payload: { content: 'test' } });
  assert.equal(result.status, 'delivered');
  assert.equal(result.remoteStatus, 200);
});

test('dispatchPublishJob dry-run preserves bundleId and profileId', async () => {
  const job = createPublishJob(baseInput);
  const result = await dispatchPublishJob({ job, payload: {} });
  assert.equal(result.bundleId, 'bundle-001');
  assert.equal(result.profileId, 'profile-ljv');
});

test('dispatchPublishJob webhook target fails when url missing', async () => {
  const job = createPublishJob({ ...baseInput, target: { id: 'webhook-1', kind: 'webhook' } });
  const result = await dispatchPublishJob({ job, payload: {} });
  assert.equal(result.status, 'failed');
  assert.ok(result.error?.code === 'MISSING_URL');
});

// --- PublishJobStore ---

test('createInMemoryPublishJobStore can save and get by id', () => {
  const store = createInMemoryPublishJobStore();
  const job = createPublishJob(baseInput);
  store.save(job);
  const retrieved = store.getById(job.jobId);
  assert.ok(retrieved !== undefined);
  assert.equal(retrieved!.jobId, job.jobId);
});

test('createInMemoryPublishJobStore returns undefined for missing job', () => {
  const store = createInMemoryPublishJobStore();
  assert.equal(store.getById('nope'), undefined);
});

test('createInMemoryPublishJobStore getByBundle returns correct jobs', () => {
  const store = createInMemoryPublishJobStore();
  const j1 = createPublishJob({ ...baseInput, bundleId: 'b-alpha' });
  const j2 = createPublishJob({ ...baseInput, bundleId: 'b-beta' });
  const j3 = createPublishJob({ ...baseInput, bundleId: 'b-alpha' });
  store.save(j1);
  store.save(j2);
  store.save(j3);
  const results = store.getByBundle('b-alpha');
  assert.equal(results.length, 2);
});
