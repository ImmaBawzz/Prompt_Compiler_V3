/**
 * Publishing Automation (Phase 16)
 *
 * Dispatches accepted compilation bundles to external destinations via a
 * generic signed-webhook adapter.  A dry-run mode is always free; live
 * dispatch is gated behind the `studio.team` entitlement at the API layer.
 */

import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { CreatePublishJobInput, PublishJob, PublishJobStatus } from './types';

// ---------------------------------------------------------------------------
// PublishJob factory
// ---------------------------------------------------------------------------

export function createPublishJob(input: CreatePublishJobInput): PublishJob {
  if (!input.bundleId) throw new Error('createPublishJob: bundleId is required.');
  if (!input.profileId) throw new Error('createPublishJob: profileId is required.');
  if (!input.target?.id) throw new Error('createPublishJob: target.id is required.');

  const now = new Date().toISOString();
  return {
    jobId: input.jobId ?? randomUUID(),
    bundleId: input.bundleId,
    profileId: input.profileId,
    target: input.target,
    status: 'queued' as PublishJobStatus,
    createdAt: input.createdAt ?? now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Webhook payload signing helper
// ---------------------------------------------------------------------------

/**
 * Sign a payload with HMAC-SHA256 using the provided secret.
 * The signature is returned as a hex string suitable for `X-Signature`.
 */
export function signWebhookPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

// ---------------------------------------------------------------------------
// Webhook dispatch adapter
// ---------------------------------------------------------------------------

interface DispatchResult {
  remoteStatus: number;
  responseExcerpt: string;
  error?: { code: string; message: string };
}

async function dispatchWebhook(
  url: string,
  body: string,
  secret?: string,
  extraHeaders?: Record<string, string>
): Promise<DispatchResult> {
  const endpoint = new URL(url);
  const signature = secret ? signWebhookPayload(body, secret) : undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    ...(signature ? { 'X-Signature': signature } : {}),
    ...(extraHeaders ?? {})
  };

  return new Promise<DispatchResult>((resolve) => {
    const lib = endpoint.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            remoteStatus: res.statusCode ?? 0,
            responseExcerpt: data.slice(0, 500)
          });
        });
      }
    );

    req.on('error', (err: Error) => {
      resolve({
        remoteStatus: 0,
        responseExcerpt: '',
        error: { code: 'NETWORK_ERROR', message: err.message }
      });
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public dispatch entry point
// ---------------------------------------------------------------------------

export interface DispatchPublishJobInput {
  job: PublishJob;
  /** The full bundle or payload to publish — will be serialized as JSON. */
  payload: unknown;
}

/**
 * Dispatch a publish job.  Updates and returns a new PublishJob reflecting
 * the outcome.  For dry-run targets, no network call is made.
 */
export async function dispatchPublishJob(input: DispatchPublishJobInput): Promise<PublishJob> {
  const { job, payload } = input;
  const now = new Date().toISOString();

  // Dry-run: mark delivered immediately with no network call.
  if (job.target.kind === 'dry-run') {
    return { ...job, status: 'delivered', updatedAt: now, remoteStatus: 200, responseExcerpt: '(dry-run)' };
  }

  if (!job.target.url) {
    return {
      ...job,
      status: 'failed',
      updatedAt: now,
      error: { code: 'MISSING_URL', message: 'PublishTarget.url is required for webhook dispatch.' }
    };
  }

  const body = JSON.stringify({ jobId: job.jobId, bundleId: job.bundleId, profileId: job.profileId, payload });
  const dispatching: PublishJob = { ...job, status: 'dispatched', updatedAt: now };

  const result = await dispatchWebhook(
    job.target.url,
    body,
    job.target.secret,
    job.target.headers
  );

  if (result.error ?? (result.remoteStatus >= 400 || result.remoteStatus === 0)) {
    return {
      ...dispatching,
      status: 'failed',
      remoteStatus: result.remoteStatus,
      responseExcerpt: result.responseExcerpt,
      updatedAt: new Date().toISOString(),
      error: result.error ?? {
        code: 'REMOTE_ERROR',
        message: `Remote returned HTTP ${result.remoteStatus}.`
      }
    };
  }

  return {
    ...dispatching,
    status: 'delivered',
    remoteStatus: result.remoteStatus,
    responseExcerpt: result.responseExcerpt,
    updatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// In-memory publish job store for the API server
// ---------------------------------------------------------------------------

export interface PublishJobStore {
  save(job: PublishJob): PublishJob;
  getById(jobId: string): PublishJob | undefined;
  getByBundle(bundleId: string): PublishJob[];
}

export function createInMemoryPublishJobStore(): PublishJobStore {
  const jobs = new Map<string, PublishJob>();

  return {
    save(job) {
      jobs.set(job.jobId, job);
      return job;
    },
    getById(jobId) {
      return jobs.get(jobId);
    },
    getByBundle(bundleId) {
      return [...jobs.values()].filter((j) => j.bundleId === bundleId);
    }
  };
}
