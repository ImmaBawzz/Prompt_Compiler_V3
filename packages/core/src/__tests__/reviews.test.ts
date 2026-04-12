import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBundleReviewComment,
  addBundleReviewDecision,
  canPublishReviewedBundle,
  createBundleReview,
  markBundlePublished,
  submitBundleReview
} from '../reviews';

test('createBundleReview creates draft review record with default approval threshold', () => {
  const review = createBundleReview({
    bundleId: 'bundle-1',
    workspaceId: 'ws-1',
    createdBy: 'acct-owner'
  });

  assert.equal(review.status, 'draft');
  assert.equal(review.requiredApprovals, 1);
  assert.equal(review.comments.length, 0);
  assert.equal(review.decisions.length, 0);
});

test('submitBundleReview moves draft review into in_review status', () => {
  const draft = createBundleReview({
    bundleId: 'bundle-2',
    workspaceId: 'ws-1',
    createdBy: 'acct-owner'
  });

  const submitted = submitBundleReview(draft, '2026-04-12T00:00:00.000Z');
  assert.equal(submitted.status, 'in_review');
  assert.equal(submitted.submittedAt, '2026-04-12T00:00:00.000Z');
});

test('addBundleReviewComment appends viewer comment without changing status', () => {
  const review = addBundleReviewComment(
    createBundleReview({
      bundleId: 'bundle-3',
      workspaceId: 'ws-1',
      createdBy: 'acct-owner'
    }),
    {
      authorAccountId: 'acct-viewer',
      message: 'Please tighten the closing line.'
    }
  );

  assert.equal(review.comments.length, 1);
  assert.equal(review.comments[0]?.message, 'Please tighten the closing line.');
  assert.equal(review.status, 'draft');
});

test('addBundleReviewDecision requires all approvals before publish is allowed', () => {
  const created = createBundleReview({
    bundleId: 'bundle-4',
    workspaceId: 'ws-1',
    createdBy: 'acct-owner',
    requiredApprovals: 2
  });

  const submitted = submitBundleReview(created);
  const firstApproval = addBundleReviewDecision(submitted, {
    reviewerAccountId: 'acct-editor',
    decision: 'approve',
    createdAt: '2026-04-12T00:01:00.000Z'
  });
  assert.equal(firstApproval.status, 'in_review');
  assert.equal(canPublishReviewedBundle(firstApproval, 'editor'), false);

  const secondApproval = addBundleReviewDecision(firstApproval, {
    reviewerAccountId: 'acct-owner',
    decision: 'approve',
    createdAt: '2026-04-12T00:02:00.000Z'
  });
  assert.equal(secondApproval.status, 'approved');
  assert.equal(secondApproval.approvedAt, '2026-04-12T00:02:00.000Z');
  assert.equal(canPublishReviewedBundle(secondApproval, 'editor'), true);
  assert.equal(canPublishReviewedBundle(secondApproval, 'viewer'), false);
});

test('request_changes overrides prior approvals until review is resubmitted', () => {
  const approved = addBundleReviewDecision(
    submitBundleReview(
      createBundleReview({
        bundleId: 'bundle-5',
        workspaceId: 'ws-1',
        createdBy: 'acct-owner'
      })
    ),
    {
      reviewerAccountId: 'acct-editor',
      decision: 'approve',
      createdAt: '2026-04-12T00:01:00.000Z'
    }
  );
  assert.equal(approved.status, 'approved');

  const changesRequested = addBundleReviewDecision(approved, {
    reviewerAccountId: 'acct-editor',
    decision: 'request_changes',
    comment: 'Imagery is still too vague.',
    createdAt: '2026-04-12T00:03:00.000Z'
  });

  assert.equal(changesRequested.status, 'changes_requested');
  assert.equal(canPublishReviewedBundle(changesRequested, 'owner'), false);
});

test('markBundlePublished locks review into published state', () => {
  const approved = addBundleReviewDecision(
    submitBundleReview(
      createBundleReview({
        bundleId: 'bundle-6',
        workspaceId: 'ws-1',
        createdBy: 'acct-owner'
      })
    ),
    {
      reviewerAccountId: 'acct-editor',
      decision: 'approve',
      createdAt: '2026-04-12T00:02:00.000Z'
    }
  );

  const published = markBundlePublished(approved, '2026-04-12T00:05:00.000Z');
  assert.equal(published.status, 'published');
  assert.equal(published.publishedAt, '2026-04-12T00:05:00.000Z');
});
