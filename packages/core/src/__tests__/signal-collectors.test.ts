import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectBuildResult,
  collectCodeQuality,
  collectProductFeedback,
  collectTestResult
} from '../signal-collectors';

test('collectBuildResult marks successful build as positive', () => {
  const signal = collectBuildResult('Build completed with 0 errors');
  assert.equal(signal.type, 'build');
  assert.equal(signal.outcome, 'positive');
});

test('collectTestResult captures test totals and delta', () => {
  const signal = collectTestResult('155/155', 150);
  assert.equal(signal.type, 'test');
  assert.equal(signal.outcome, 'positive');
  assert.equal(signal.metadata?.testsTotal, 155);
  assert.equal(signal.metadata?.testsDelta, 5);
});

test('collectCodeQuality returns negative signal for low quality score', () => {
  const signal = collectCodeQuality('4 errors 3 warnings', 20);
  assert.equal(signal.type, 'quality');
  assert.equal(signal.outcome, 'negative');
});

test('collectProductFeedback maps scores to outcomes', () => {
  const signals = collectProductFeedback([
    {
      feedbackId: 'f1',
      bundleId: 'b1',
      profileId: 'p1',
      target: 'suno',
      score: 5,
      createdAt: new Date().toISOString()
    },
    {
      feedbackId: 'f2',
      bundleId: 'b2',
      profileId: 'p2',
      target: 'udio',
      score: 1,
      createdAt: new Date().toISOString()
    }
  ]);

  assert.equal(signals.length, 2);
  assert.equal(signals[0].outcome, 'positive');
  assert.equal(signals[1].outcome, 'negative');
});
