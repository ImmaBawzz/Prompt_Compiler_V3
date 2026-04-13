import { randomUUID } from 'node:crypto';
import { FeedbackRecord } from './types';
import { LearningSignal, LearningSignalOutcome } from './agent2-types';

function toWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0.05, Math.min(1, value));
}

function createSignal(
  type: LearningSignal['type'],
  source: string,
  outcome: LearningSignalOutcome,
  weight: number,
  metadata?: Record<string, string | number | boolean>
): LearningSignal {
  return {
    signalId: randomUUID(),
    type,
    source,
    outcome,
    weight: toWeight(weight),
    capturedAt: new Date().toISOString(),
    metadata
  };
}

function parseSlashPair(output: string): { passed: number; total: number } | null {
  const match = output.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return null;
  }
  const passed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(passed) || !Number.isFinite(total)) {
    return null;
  }
  return { passed, total };
}

export function collectBuildResult(buildOutput: string): LearningSignal {
  const hasFailure = /(error TS\d+|\bfailed\b|\berror\b)/i.test(buildOutput);
  const hasSuccess = /(build completed|compiled successfully|\b0 errors\b)/i.test(buildOutput);
  const outcome: LearningSignalOutcome = hasFailure ? 'negative' : hasSuccess ? 'positive' : 'neutral';
  const weight = hasFailure ? 1 : hasSuccess ? 0.7 : 0.35;
  return createSignal('build', 'npm run build', outcome, weight, {
    hasFailure,
    hasSuccess
  });
}

export function collectTestResult(testOutput: string, previousCount: number): LearningSignal {
  const slashPair = parseSlashPair(testOutput);
  const passingMatch = testOutput.match(/(\d+)\s+passing/i);
  const failingMatch = testOutput.match(/(\d+)\s+failing/i);

  const testsTotal = slashPair?.total ?? (passingMatch ? Number(passingMatch[1]) : 0);
  const testsPassed = slashPair?.passed ?? (passingMatch ? Number(passingMatch[1]) : 0);
  const testsFailed = failingMatch ? Number(failingMatch[1]) : Math.max(0, testsTotal - testsPassed);
  const testsDelta = testsTotal - previousCount;

  const outcome: LearningSignalOutcome =
    testsFailed > 0 ? 'negative' : testsDelta >= 0 && testsTotal > 0 ? 'positive' : 'neutral';
  const weight = testsFailed > 0 ? 1 : testsDelta >= 0 ? 0.75 : 0.4;

  return createSignal('test', 'npm run test', outcome, weight, {
    testsTotal,
    testsPassed,
    testsFailed,
    testsDelta
  });
}

export function collectCodeQuality(lintOutput: string, coveragePercent = 0): LearningSignal {
  const lintErrors = Number(lintOutput.match(/(\d+)\s+error/i)?.[1] ?? 0);
  const lintWarnings = Number(lintOutput.match(/(\d+)\s+warning/i)?.[1] ?? 0);
  const qualityScore = Math.max(0, Math.min(100, coveragePercent - lintErrors * 8 - lintWarnings * 2));
  const outcome: LearningSignalOutcome = qualityScore >= 70 ? 'positive' : qualityScore >= 45 ? 'neutral' : 'negative';
  const weight = qualityScore >= 70 ? 0.7 : qualityScore >= 45 ? 0.45 : 0.9;
  return createSignal('quality', 'lint+coverage', outcome, weight, {
    coveragePercent,
    lintErrors,
    lintWarnings,
    qualityScore
  });
}

export function collectWorkLogSignals(workLogContent: string, lookbackDays: number): LearningSignal[] {
  if (!workLogContent.trim()) {
    return [];
  }

  const now = Date.now();
  const windowMs = Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000;
  const entries = workLogContent.match(/^##\s+\d{4}-\d{2}-\d{2}.*$/gm) ?? [];

  const recentEntries = entries.filter((line) => {
    const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) {
      return false;
    }
    const ts = new Date(`${dateMatch[0]}T00:00:00.000Z`).getTime();
    return now - ts <= windowMs;
  });

  if (recentEntries.length === 0) {
    return [createSignal('work-log', 'agent/WORK_LOG.md', 'neutral', 0.2, { recentEntries: 0 })];
  }

  return recentEntries.map((entry) => {
    const lower = entry.toLowerCase();
    const outcome: LearningSignalOutcome = lower.includes('blocked')
      ? 'negative'
      : lower.includes('done') || lower.includes('closed')
        ? 'positive'
        : 'neutral';
    return createSignal('work-log', 'agent/WORK_LOG.md', outcome, 0.35, {
      headline: entry.slice(0, 120)
    });
  });
}

export function collectProductFeedback(feedbackRecords: FeedbackRecord[]): LearningSignal[] {
  if (feedbackRecords.length === 0) {
    return [];
  }

  return feedbackRecords.map((record) => {
    const outcome: LearningSignalOutcome = record.score >= 4 ? 'positive' : record.score <= 2 ? 'negative' : 'neutral';
    const weight = record.score >= 4 ? 0.65 : record.score <= 2 ? 0.85 : 0.4;
    return createSignal('feedback', 'feedback-record', outcome, weight, {
      profileId: record.profileId,
      target: record.target,
      score: record.score,
      accepted: Boolean(record.acceptedAt)
    });
  });
}

export interface GitHistorySnapshot {
  insertions: number;
  deletions: number;
  reverted?: boolean;
}

export function collectGitHistory(history: GitHistorySnapshot[]): LearningSignal[] {
  if (history.length === 0) {
    return [];
  }

  return history.map((snapshot) => {
    const churn = snapshot.insertions + snapshot.deletions;
    const outcome: LearningSignalOutcome = snapshot.reverted ? 'negative' : churn <= 300 ? 'positive' : 'neutral';
    return createSignal('git-history', 'git log --numstat', outcome, snapshot.reverted ? 0.95 : 0.5, {
      insertions: snapshot.insertions,
      deletions: snapshot.deletions,
      reverted: Boolean(snapshot.reverted)
    });
  });
}
