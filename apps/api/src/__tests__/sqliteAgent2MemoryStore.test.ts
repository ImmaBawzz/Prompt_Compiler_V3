import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultBehavioralWeights } from '@prompt-compiler/core';
import { createSqliteAgent2MemoryStore } from '../sqliteAgent2MemoryStore';

test('SQLite Agent2 memory store persists cycle, signals, weights, and adaptations', () => {
  const store = createSqliteAgent2MemoryStore(':memory:');
  try {
    store.appendCycle({
      cycleId: 'cycle-1',
      startedAt: '2026-04-13T00:00:00.000Z',
      completedAt: '2026-04-13T00:01:00.000Z',
      dryRun: false,
      signalsConsumed: 3,
      actionsPlanned: 2,
      actionsApplied: 1,
      metrics: {
        buildPassed: true,
        testPassed: true,
        testsTotal: 100,
        testsDelta: 1,
        qualityScore: 82,
        selfEvalScore: 77
      }
    });

    store.appendSignals('cycle-1', [
      {
        signalId: 'sig-1',
        type: 'build',
        source: 'npm run build',
        outcome: 'positive',
        weight: 0.6,
        capturedAt: '2026-04-13T00:00:30.000Z'
      }
    ]);

    const weights = createDefaultBehavioralWeights('2026-04-13T00:00:00.000Z');
    store.upsertBehavioralWeights(weights);

    store.appendAdaptations('cycle-1', [
      {
        actionType: 'modify-rule',
        target: 'agent2/AGENT2_RULES.md',
        confidence: 0.67,
        summary: 'tighten test gate'
      }
    ]);

    const recent = store.listRecentCycles(5);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].cycleId, 'cycle-1');

    const persistedWeights = store.listBehavioralWeights();
    assert.equal(persistedWeights.length, weights.length);

    const lastCycle = store.getLastCompletedCycleAt();
    assert.equal(lastCycle, '2026-04-13T00:01:00.000Z');
  } finally {
    store.close();
  }
});
