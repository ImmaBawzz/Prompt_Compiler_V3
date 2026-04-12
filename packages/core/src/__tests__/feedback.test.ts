import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFeedbackRecord,
  deriveScoringWeightsFromFeedback,
  buildFeedbackAggregate,
  createInMemoryFeedbackStore,
  DEFAULT_SCORE_WEIGHTS
} from '../feedback';
import { FeedbackRecord } from '../types';

function makeRecord(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return createFeedbackRecord({
    bundleId: 'bundle-001',
    profileId: 'profile-ljv',
    target: 'suno',
    score: 4,
    ...overrides
  });
}

// --- createFeedbackRecord ---

test('createFeedbackRecord creates a record with a feedbackId', () => {
  const r = makeRecord();
  assert.ok(typeof r.feedbackId === 'string' && r.feedbackId.length > 0);
});

test('createFeedbackRecord rounds score to integer', () => {
  const r = createFeedbackRecord({ bundleId: 'b', profileId: 'p', target: 'suno', score: 3.7 });
  assert.equal(r.score, 4);
});

test('createFeedbackRecord throws on score < 1', () => {
  assert.throws(
    () => createFeedbackRecord({ bundleId: 'b', profileId: 'p', target: 'suno', score: 0 }),
    RangeError
  );
});

test('createFeedbackRecord throws on score > 5', () => {
  assert.throws(
    () => createFeedbackRecord({ bundleId: 'b', profileId: 'p', target: 'suno', score: 6 }),
    RangeError
  );
});

test('createFeedbackRecord uses provided createdAt', () => {
  const ts = '2024-01-01T00:00:00.000Z';
  const r = createFeedbackRecord({ bundleId: 'b', profileId: 'p', target: 'generic', score: 3, createdAt: ts });
  assert.equal(r.createdAt, ts);
});

// --- deriveScoringWeightsFromFeedback ---

test('deriveScoringWeightsFromFeedback returns defaults for empty records', () => {
  const weights = deriveScoringWeightsFromFeedback([]);
  assert.deepEqual(weights, DEFAULT_SCORE_WEIGHTS);
});

test('deriveScoringWeightsFromFeedback weights sum to ~4.0', () => {
  const records = [3, 2, 4, 3, 2].map((score) =>
    makeRecord({ score: score as FeedbackRecord['score'] })
  );
  const weights = deriveScoringWeightsFromFeedback(records);
  const sum = weights.clarity + weights.specificity + weights.styleConsistency + weights.targetReadiness;
  assert.ok(Math.abs(sum - 4.0) < 0.05, `Expected sum ~4.0, got ${sum}`);
});

test('deriveScoringWeightsFromFeedback boosts specificity for low-score history', () => {
  // All score 1 → low satisfaction → specificity and targetReadiness should be above 1.0
  const records = [1, 1, 1, 1, 1].map((score) =>
    makeRecord({ score: score as FeedbackRecord['score'] })
  );
  const weights = deriveScoringWeightsFromFeedback(records);
  assert.ok(weights.specificity > 1.0, 'Expected specificity boost for low scores');
  assert.ok(weights.targetReadiness > 1.0, 'Expected targetReadiness boost for low scores');
});

test('deriveScoringWeightsFromFeedback boosts styleConsistency for accepted records', () => {
  const now = new Date().toISOString();
  const records = [5, 5, 5].map((score) =>
    makeRecord({ score: score as FeedbackRecord['score'], acceptedAt: now })
  );
  const unsatisfied = deriveScoringWeightsFromFeedback([makeRecord({ score: 5 })]);
  const satisfied = deriveScoringWeightsFromFeedback(records);
  assert.ok(satisfied.styleConsistency >= unsatisfied.styleConsistency, 'Style should boost with accepted records');
});

test('all derived weights stay between 0.5 and 2.0', () => {
  const records = [1, 5, 1, 5, 1, 5, 2, 4].map((score, i) =>
    makeRecord({ score: score as FeedbackRecord['score'], acceptedAt: score > 3 ? new Date().toISOString() : undefined })
  );
  const weights = deriveScoringWeightsFromFeedback(records);
  for (const [key, val] of Object.entries(weights)) {
    assert.ok(val >= 0.5, `${key} weight ${val} below minimum 0.5`);
    assert.ok(val <= 2.0, `${key} weight ${val} above maximum 2.0`);
  }
});

// --- buildFeedbackAggregate ---

test('buildFeedbackAggregate returns zero aggregate for empty records', () => {
  const agg = buildFeedbackAggregate('p', []);
  assert.equal(agg.totalRecords, 0);
  assert.equal(agg.averageScore, 0);
  assert.equal(agg.acceptedCount, 0);
});

test('buildFeedbackAggregate computes correct averageScore', () => {
  const records = [2, 4, 4].map((score) =>
    makeRecord({ score: score as FeedbackRecord['score'] })
  );
  const agg = buildFeedbackAggregate('profile-ljv', records);
  assert.equal(agg.totalRecords, 3);
  assert.equal(agg.averageScore, 3.33);
});

test('buildFeedbackAggregate counts acceptedAt records', () => {
  const now = new Date().toISOString();
  const records = [makeRecord({ acceptedAt: now }), makeRecord(), makeRecord({ acceptedAt: now })];
  const agg = buildFeedbackAggregate('p', records);
  assert.equal(agg.acceptedCount, 2);
});

// --- FeedbackStore ---

test('createInMemoryFeedbackStore can save and retrieve by profile', () => {
  const store = createInMemoryFeedbackStore();
  const r = makeRecord({ profileId: 'profile-123' });
  store.save(r);
  const results = store.getByProfile('profile-123');
  assert.equal(results.length, 1);
  assert.equal(results[0].feedbackId, r.feedbackId);
});

test('createInMemoryFeedbackStore can retrieve by bundle', () => {
  const store = createInMemoryFeedbackStore();
  const r = makeRecord({ bundleId: 'bundle-xyz' });
  store.save(r);
  const results = store.getByBundle('bundle-xyz');
  assert.equal(results.length, 1);
});

test('createInMemoryFeedbackStore getAggregate includes derived weights', () => {
  const store = createInMemoryFeedbackStore();
  store.save(makeRecord({ score: 5, profileId: 'pa' }));
  store.save(makeRecord({ score: 4, profileId: 'pa' }));
  const agg = store.getAggregate('pa');
  assert.equal(agg.profileId, 'pa');
  assert.equal(agg.totalRecords, 2);
  assert.ok(typeof agg.derivedWeights.clarity === 'number');
});
