"use strict";
/**
 * Publishing Automation (Phase 16)
 *
 * Dispatches accepted compilation bundles to external destinations via a
 * generic signed-webhook adapter.  A dry-run mode is always free; live
 * dispatch is gated behind the `studio.team` entitlement at the API layer.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublishJob = createPublishJob;
exports.signWebhookPayload = signWebhookPayload;
exports.dispatchPublishJob = dispatchPublishJob;
exports.createInMemoryPublishJobStore = createInMemoryPublishJobStore;
const node_crypto_1 = require("node:crypto");
const node_crypto_2 = require("node:crypto");
const node_https_1 = __importDefault(require("node:https"));
const node_http_1 = __importDefault(require("node:http"));
const node_url_1 = require("node:url");
// ---------------------------------------------------------------------------
// PublishJob factory
// ---------------------------------------------------------------------------
function createPublishJob(input) {
    if (!input.bundleId)
        throw new Error('createPublishJob: bundleId is required.');
    if (!input.profileId)
        throw new Error('createPublishJob: profileId is required.');
    if (!input.target?.id)
        throw new Error('createPublishJob: target.id is required.');
    const now = new Date().toISOString();
    return {
        jobId: input.jobId ?? (0, node_crypto_1.randomUUID)(),
        bundleId: input.bundleId,
        profileId: input.profileId,
        workspaceId: input.workspaceId,
        target: input.target,
        status: 'queued',
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
function signWebhookPayload(body, secret) {
    return (0, node_crypto_2.createHmac)('sha256', secret).update(body).digest('hex');
}
async function dispatchWebhook(url, body, secret, extraHeaders) {
    const endpoint = new node_url_1.URL(url);
    const signature = secret ? signWebhookPayload(body, secret) : undefined;
    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
        ...(signature ? { 'X-Signature': signature } : {}),
        ...(extraHeaders ?? {})
    };
    return new Promise((resolve) => {
        const lib = endpoint.protocol === 'https:' ? node_https_1.default : node_http_1.default;
        const req = lib.request({
            hostname: endpoint.hostname,
            port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
            path: `${endpoint.pathname}${endpoint.search}`,
            method: 'POST',
            headers
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                resolve({
                    remoteStatus: res.statusCode ?? 0,
                    responseExcerpt: data.slice(0, 500)
                });
            });
        });
        req.on('error', (err) => {
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
/**
 * Dispatch a publish job.  Updates and returns a new PublishJob reflecting
 * the outcome.  For dry-run targets, no network call is made.
 */
async function dispatchPublishJob(input) {
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
    const dispatching = { ...job, status: 'dispatched', updatedAt: now };
    const result = await dispatchWebhook(job.target.url, body, job.target.secret, job.target.headers);
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
function createInMemoryPublishJobStore() {
    const jobs = new Map();
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
//# sourceMappingURL=publishing.js.map