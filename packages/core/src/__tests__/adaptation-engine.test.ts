import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultBehavioralWeights,
  Agent2CycleResult
} from '../agent2-types';
import {
  deriveBehavioralWeights,
  detectDivergence,
  proposeRuleEvolution,
  shadowEvaluateProposal
} from '../adaptation-engine';

test('deriveBehavioralWeights applies bounded delta clamp', () => {
  const current = createDefaultBehavioralWeights('2026-01-01T00:00:00.000Z');
  const next = deriveBehavioralWeights(
    [
      {
        signalId: 's1',
        type: 'build',
        source: 'build',
        outcome: 'negative',
        weight: 1,
        capturedAt: '2026-01-02T00:00:00.000Z'
      },
      {
        signalId: 's2',
        type: 'build',
        source: 'build',
        outcome: 'negative',
        weight: 1,
        capturedAt: '2026-01-02T00:00:01.000Z'
      },
      {
        signalId: 's3',
        type: 'build',
        source: 'build',
        outcome: 'negative',
        weight: 1,
        capturedAt: '2026-01-02T00:00:02.000Z'
      }
    ],
    current,
    {
      maxWeightDelta: 0.1,
      cooldownMs: 0,
      now: '2026-01-02T00:00:10.000Z'
    }
  );

  const confidence = next.find((weight) => weight.dimension === 'code-change-confidence');
  assert.ok(confidence);
  assert.equal(confidence?.currentValue, 0.4);
});

test('proposeRuleEvolution emits action when repeated negative signals exist', () => {
  const action = proposeRuleEvolution(
    [
      { signalId: 'a', type: 'test', source: 'test', outcome: 'negative', weight: 0.8, capturedAt: '2026-01-01T00:00:00.000Z' },
      { signalId: 'b', type: 'build', source: 'build', outcome: 'negative', weight: 0.7, capturedAt: '2026-01-01T00:00:01.000Z' }
    ],
    '# Rules'
  );

  assert.ok(action);
  assert.equal(action?.actionType, 'modify-rule');
});

test('detectDivergence returns true when CV exceeds threshold', () => {
  const cycles: Agent2CycleResult[] = [10, 90, 12, 88, 15, 85, 20, 80, 18, 92].map((score, index) => ({
    cycleId: `c-${index}`,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    dryRun: false,
    signalsConsumed: 10,
    actionsPlanned: 1,
    actionsApplied: 1,
    metrics: {
      buildPassed: true,
      testPassed: true,
      testsTotal: 100,
      testsDelta: 1,
      qualityScore: 80,
      selfEvalScore: score
    }
  }));

  assert.equal(detectDivergence(cycles), true);
});

test('shadowEvaluateProposal combines confidence and historical outcomes', () => {
  const result = shadowEvaluateProposal(
    {
      actionType: 'modify-rule',
      target: 'agent2/AGENT2_RULES.md',
      confidence: 0.7,
      summary: 'tighten rule'
    },
    [
      {
        cycleId: 'x',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:01:00.000Z',
        dryRun: false,
        signalsConsumed: 5,
        actionsPlanned: 1,
        actionsApplied: 1,
        metrics: {
          buildPassed: true,
          testPassed: true,
          testsTotal: 100,
          testsDelta: 0,
          qualityScore: 85,
          selfEvalScore: 75
        }
      }
    ]
  );

  assert.ok(result.score >= 0.65);
  assert.equal(result.safe, true);
});
