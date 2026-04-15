import { BundleReviewRecord, CreateBundleReviewCommentInput, CreateBundleReviewDecisionInput, CreateBundleReviewInput } from './types';
import { WorkspaceRole } from './governance';
export declare function createBundleReview(input: CreateBundleReviewInput): BundleReviewRecord;
export declare function submitBundleReview(review: BundleReviewRecord, submittedAt?: string): BundleReviewRecord;
export declare function addBundleReviewComment(review: BundleReviewRecord, input: CreateBundleReviewCommentInput): BundleReviewRecord;
export declare function addBundleReviewDecision(review: BundleReviewRecord, input: CreateBundleReviewDecisionInput): BundleReviewRecord;
export declare function markBundlePublished(review: BundleReviewRecord, publishedAt?: string): BundleReviewRecord;
export declare function canPublishReviewedBundle(review: BundleReviewRecord, role: WorkspaceRole): boolean;
export interface BundleReviewStore {
    save(review: BundleReviewRecord): BundleReviewRecord;
    get(bundleId: string, workspaceId: string): BundleReviewRecord | undefined;
    listByWorkspace(workspaceId: string): BundleReviewRecord[];
}
export declare function createInMemoryBundleReviewStore(): BundleReviewStore;
