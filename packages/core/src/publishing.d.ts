/**
 * Publishing Automation (Phase 16)
 *
 * Dispatches accepted compilation bundles to external destinations via a
 * generic signed-webhook adapter.  A dry-run mode is always free; live
 * dispatch is gated behind the `studio.team` entitlement at the API layer.
 */
import { CreatePublishJobInput, PublishJob } from './types';
export declare function createPublishJob(input: CreatePublishJobInput): PublishJob;
/**
 * Sign a payload with HMAC-SHA256 using the provided secret.
 * The signature is returned as a hex string suitable for `X-Signature`.
 */
export declare function signWebhookPayload(body: string, secret: string): string;
export interface DispatchPublishJobInput {
    job: PublishJob;
    /** The full bundle or payload to publish — will be serialized as JSON. */
    payload: unknown;
}
/**
 * Dispatch a publish job.  Updates and returns a new PublishJob reflecting
 * the outcome.  For dry-run targets, no network call is made.
 */
export declare function dispatchPublishJob(input: DispatchPublishJobInput): Promise<PublishJob>;
export interface PublishJobStore {
    save(job: PublishJob): PublishJob;
    getById(jobId: string): PublishJob | undefined;
    getByBundle(bundleId: string): PublishJob[];
}
export declare function createInMemoryPublishJobStore(): PublishJobStore;
