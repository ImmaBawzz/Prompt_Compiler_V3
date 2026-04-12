import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredReviewArtifact, reviewArtifactName } from '../reviewFiles';

test('reviewArtifactName returns deterministic review artifact filename', () => {
  assert.equal(reviewArtifactName('bundle-123'), 'review-bundle-123.json');
});

test('parseStoredReviewArtifact extracts workspaceId and status from persisted result wrapper', () => {
  const parsed = parseStoredReviewArtifact(
    JSON.stringify({
      result: {
        workspaceId: 'ws-1',
        status: 'approved'
      }
    })
  );

  assert.deepEqual(parsed, { workspaceId: 'ws-1', status: 'approved' });
});

test('parseStoredReviewArtifact returns undefined fields for invalid JSON', () => {
  const parsed = parseStoredReviewArtifact('not-json');
  assert.deepEqual(parsed, undefined);
});
