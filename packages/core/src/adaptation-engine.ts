import {
  Agent2CycleResult,
  Agent2LearnOpts,
  AgentAction,
  BehavioralWeight,
  BehavioralWeightDimension,
  LearningSignal,
  createDefaultBehavioralWeights
} from './agent2-types';

const DEFAULT_OPTS: Required<Pick<Agent2LearnOpts, 'enableLearning' | 'maxWeightDelta' | 'minSampleSize' | 'cooldownMs' | 'lowerBound' | 'upperBound'>> = {
  enableLearning: true,
  maxWeightDelta: 0.1,
  minSampleSize: 3,
  cooldownMs: 10 * 60 * 1000,
  lowerBound: 0.1,
  upperBound: 0.9
};

const DIMENSION_BY_SIGNAL: Record<LearningSignal['type'], BehavioralWeightDimension> = {
  build: 'code-change-confidence',
  test: 'test-first-priority',
  quality: 'self-modification-threshold',
  'work-log': 'task-selection-breadth',
  feedback: 'shadow-eval-strictness',
  'git-history': 'git-push-eagerness',
  'self-eval': 'learning-cycle-frequency'
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function weightDeltaForSignal(signal: LearningSignal): number {
  if (signal.outcome === 'positive') {
    return signal.weight * 0.04;
  }
  if (signal.outcome === 'negative') {
    return -signal.weight * 0.06;
  }
  return 0;
}

export function deriveBehavioralWeights(
  signals: LearningSignal[],
  currentWeights: BehavioralWeight[],
  opts: Agent2LearnOpts = {}
): BehavioralWeight[] {
  const nowIso = opts.now ?? new Date().toISOString();
  const nowTs = new Date(nowIso).getTime();
  const cfg = {
    ...DEFAULT_OPTS,
    ...opts
  };

  if (!cfg.enableLearning) {
    return currentWeights;
  }

  const baseline = currentWeights.length > 0 ? currentWeights : createDefaultBehavioralWeights(nowIso);
  if (signals.length < cfg.minSampleSize) {
    return baseline;
  }

  const deltas = new Map<BehavioralWeightDimension, number>();
  for (const signal of signals) {
    const dimension = DIMENSION_BY_SIGNAL[signal.type];
    const existing = deltas.get(dimension) ?? 0;
    deltas.set(dimension, existing + weightDeltaForSignal(signal));
  }

  return baseline.map((weight) => {
    const sinceLastUpdate = nowTs - new Date(weight.updatedAt).getTime();
    if (Number.isFinite(sinceLastUpdate) && sinceLastUpdate < cfg.cooldownMs) {
      return weight;
    }

    const rawDelta = deltas.get(weight.dimension) ?? 0;
    const boundedDelta = clamp(rawDelta, -cfg.maxWeightDelta, cfg.maxWeightDelta);
    const nextValue = round3(clamp(weight.currentValue + boundedDelta, cfg.lowerBound, cfg.upperBound));

    return {
      ...weight,
      candidateValue: nextValue,
      currentValue: nextValue,
      sampleCount: weight.sampleCount + signals.length,
      updatedAt: nowIso,
      status: 'active'
    };
  });
}

export function proposeRuleEvolution(signals: LearningSignal[], currentRulesContent: string): AgentAction | null {
  const negatives = signals.filter((signal) => signal.outcome === 'negative');
  if (negatives.length < 2) {
    return null;
  }

  const summary = negatives.some((signal) => signal.type === 'test')
    ? 'Increase test gate strictness after repeated negative test signals.'
    : 'Tighten execution safeguards after repeated negative operational signals.';

  return {
    actionType: 'modify-rule',
    target: 'agent2/AGENT2_RULES.md',
    confidence: 0.68,
    summary,
    beforeContent: currentRulesContent.slice(0, 500),
    metadata: {
      negativeSignals: negatives.length
    }
  };
}

export function proposePromptMutation(
  signals: LearningSignal[],
  currentPromptContent: string,
  weights: BehavioralWeight[]
): AgentAction | null {
  const qualityNegatives = signals.filter((signal) => signal.type === 'quality' && signal.outcome === 'negative').length;
  const threshold = weights.find((w) => w.dimension === 'self-modification-threshold')?.currentValue ?? 0.5;

  if (qualityNegatives === 0 || threshold < 0.4) {
    return null;
  }

  return {
    actionType: 'modify-system-prompt',
    target: 'agent2/AGENT2_SYSTEM_PROMPT.md',
    confidence: 0.65,
    summary: 'Refine system prompt constraints to reduce low-quality output churn.',
    beforeContent: currentPromptContent.slice(0, 500),
    metadata: {
      qualityNegatives,
      threshold
    }
  };
}

export interface TaskPhaseSummary {
  id: string;
  status: 'done' | 'active' | 'todo' | 'blocked';
  title?: string;
}

export function generateTaskPriorities(signals: LearningSignal[], phases: TaskPhaseSummary[]): TaskPhaseSummary[] {
  const hasRecentRegression = signals.some((signal) => signal.type === 'test' && signal.outcome === 'negative');
  if (!hasRecentRegression) {
    return phases;
  }

  const sorted = [...phases];
  sorted.sort((a, b) => {
    const rank = (phase: TaskPhaseSummary): number => {
      if (phase.status === 'active') {
        return 0;
      }
      if (phase.status === 'todo') {
        return 1;
      }
      if (phase.status === 'blocked') {
        return 2;
      }
      return 3;
    };
    return rank(a) - rank(b);
  });
  return sorted;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  if (mean === 0) {
    return 0;
  }
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / mean;
}

export function detectDivergence(recentCycles: Agent2CycleResult[]): boolean {
  if (recentCycles.length < 10) {
    return false;
  }
  const scores = recentCycles.slice(-10).map((cycle) => cycle.metrics.selfEvalScore);
  return coefficientOfVariation(scores) > 0.15;
}

export function shadowEvaluateProposal(
  proposal: AgentAction,
  historicalCycles: Agent2CycleResult[]
): { score: number; safe: boolean } {
  if (historicalCycles.length === 0) {
    return {
      score: proposal.confidence,
      safe: proposal.confidence >= 0.65
    };
  }

  const recent = historicalCycles.slice(-5);
  const avgSelfEval = recent.reduce((acc, cycle) => acc + cycle.metrics.selfEvalScore, 0) / recent.length;
  const avgBuildPass = recent.reduce((acc, cycle) => acc + (cycle.metrics.buildPassed ? 1 : 0), 0) / recent.length;
  const score = round3(proposal.confidence * 0.6 + (avgSelfEval / 100) * 0.25 + avgBuildPass * 0.15);

  return {
    score,
    safe: score >= 0.65
  };
}
