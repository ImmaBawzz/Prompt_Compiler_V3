import { randomUUID } from 'node:crypto';
import {
  BundleReviewComment,
  BundleReviewDecision,
  BundleReviewDecisionType,
  BundleReviewRecord,
  CreateBundleReviewCommentInput,
  CreateBundleReviewDecisionInput,
  CreateBundleReviewInput
} from './types';
import { meetsMinRole, WorkspaceRole } from './governance';

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function validateRequiredApprovals(value: number | undefined): number {
  const normalized = value ?? 1;
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error('requiredApprovals must be an integer greater than or equal to 1.');
  }
  return normalized;
}

export function createBundleReview(input: CreateBundleReviewInput): BundleReviewRecord {
  if (!input.bundleId) throw new Error('createBundleReview: bundleId is required.');
  if (!input.workspaceId) throw new Error('createBundleReview: workspaceId is required.');
  if (!input.createdBy) throw new Error('createBundleReview: createdBy is required.');

  const createdAt = nowIso(input.createdAt);
  return {
    bundleId: input.bundleId,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    status: 'draft',
    requiredApprovals: validateRequiredApprovals(input.requiredApprovals),
    comments: [],
    decisions: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function submitBundleReview(review: BundleReviewRecord, submittedAt?: string): BundleReviewRecord {
  const timestamp = nowIso(submittedAt);
  return {
    ...review,
    status: review.status === 'published' ? 'published' : 'in_review',
    submittedAt: timestamp,
    updatedAt: timestamp,
    approvedAt: review.status === 'published' ? review.approvedAt : undefined
  };
}

export function addBundleReviewComment(
  review: BundleReviewRecord,
  input: CreateBundleReviewCommentInput
): BundleReviewRecord {
  if (!input.authorAccountId) {
    throw new Error('addBundleReviewComment: authorAccountId is required.');
  }
  if (!input.message?.trim()) {
    throw new Error('addBundleReviewComment: message is required.');
  }

  const comment: BundleReviewComment = {
    commentId: input.commentId ?? randomUUID(),
    bundleId: review.bundleId,
    workspaceId: review.workspaceId,
    authorAccountId: input.authorAccountId,
    message: input.message.trim(),
    createdAt: nowIso(input.createdAt)
  };

  return {
    ...review,
    comments: [...review.comments, comment],
    updatedAt: comment.createdAt
  };
}

function nextReviewStatus(
  requiredApprovals: number,
  decisions: BundleReviewDecision[]
): Pick<BundleReviewRecord, 'status' | 'approvedAt'> {
  const latestApprovals = decisions.filter((entry) => entry.decision === 'approve').length;
  const hasChangesRequested = decisions.some((entry) => entry.decision === 'request_changes');

  if (hasChangesRequested) {
    return { status: 'changes_requested', approvedAt: undefined };
  }

  if (latestApprovals >= requiredApprovals) {
    const approvedAt = decisions
      .filter((entry) => entry.decision === 'approve')
      .slice(-1)[0]?.createdAt;
    return { status: 'approved', approvedAt };
  }

  return { status: 'in_review', approvedAt: undefined };
}

export function addBundleReviewDecision(
  review: BundleReviewRecord,
  input: CreateBundleReviewDecisionInput
): BundleReviewRecord {
  if (!input.reviewerAccountId) {
    throw new Error('addBundleReviewDecision: reviewerAccountId is required.');
  }
  if (input.decision !== 'approve' && input.decision !== 'request_changes') {
    throw new Error('addBundleReviewDecision: decision must be approve or request_changes.');
  }

  const decision: BundleReviewDecision = {
    decisionId: input.decisionId ?? randomUUID(),
    bundleId: review.bundleId,
    workspaceId: review.workspaceId,
    reviewerAccountId: input.reviewerAccountId,
    decision: input.decision,
    ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
    createdAt: nowIso(input.createdAt)
  };

  const decisions = [
    ...review.decisions.filter((entry) => entry.reviewerAccountId !== input.reviewerAccountId),
    decision
  ];
  const status = nextReviewStatus(review.requiredApprovals, decisions);

  return {
    ...review,
    decisions,
    status: status.status,
    approvedAt: status.approvedAt,
    updatedAt: decision.createdAt,
    submittedAt: review.submittedAt ?? decision.createdAt
  };
}

export function markBundlePublished(review: BundleReviewRecord, publishedAt?: string): BundleReviewRecord {
  const timestamp = nowIso(publishedAt);
  return {
    ...review,
    status: 'published',
    publishedAt: timestamp,
    approvedAt: review.approvedAt ?? timestamp,
    updatedAt: timestamp
  };
}

export function canPublishReviewedBundle(review: BundleReviewRecord, role: WorkspaceRole): boolean {
  return meetsMinRole(role, 'editor') && (review.status === 'approved' || review.status === 'published');
}

export interface BundleReviewStore {
  save(review: BundleReviewRecord): BundleReviewRecord;
  get(bundleId: string, workspaceId: string): BundleReviewRecord | undefined;
  listByWorkspace(workspaceId: string): BundleReviewRecord[];
}

export function createInMemoryBundleReviewStore(): BundleReviewStore {
  const reviews = new Map<string, BundleReviewRecord>();

  return {
    save(review) {
      reviews.set(`${review.workspaceId}::${review.bundleId}`, review);
      return review;
    },
    get(bundleId, workspaceId) {
      return reviews.get(`${workspaceId}::${bundleId}`);
    },
    listByWorkspace(workspaceId) {
      return [...reviews.values()].filter((review) => review.workspaceId === workspaceId);
    }
  };
}
