/**
 * Feedback Scoring Loop (Phase 15)
 *
 * Records outcome signals per compiled output and derives adjusted scoring
 * weights so that future buildScoreCard calls reflect historical feedback.
 * All derivation is pure and deterministic — no external services required.
 */

import { randomUUID } from 'node:crypto';
import {
  CompileTarget,
  CreateFeedbackInput,
  FeedbackAggregate,
  FeedbackRecord,
  ScoreWeights
} from './types';

// Learning options for bounded adaptation
export interface LearnOpts {
  maxWeightDelta?: number; // Maximum allowed change per dimension (default 0.05)
  minSampleSize?: number;  // Minimum feedback records required (default 5)
  cooldownMs?: number;     // Minimum ms between derivations (default 86400000 = 24h)
  decayFactor?: number;    // Not yet used (future: recency weighting)
  enableLearning?: boolean; // If false, always return previous weights
  lastDerivedAt?: string | null; // ISO string of last derivation
  prevWeights?: ScoreWeights | null; // Previous weights for delta clamp
  now?: number; // Current time (ms since epoch), for testability
}

// ---------------------------------------------------------------------------
// Default weights — mirror the implicit weights in scorers.ts
// ---------------------------------------------------------------------------

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  clarity: 1.0,
  specificity: 1.0,
  styleConsistency: 1.0,
  targetReadiness: 1.0
};

// ---------------------------------------------------------------------------
// FeedbackRecord factory
// ---------------------------------------------------------------------------

const VALID_SCORES = new Set([1, 2, 3, 4, 5]);

/**
 * Create a validated FeedbackRecord from raw input.
 * Throws if the score is not in the 1–5 range.
 */
export function createFeedbackRecord(input: CreateFeedbackInput): FeedbackRecord {
  const score = Math.round(input.score);
  if (!VALID_SCORES.has(score)) {
    throw new RangeError(
      `Invalid feedback score ${input.score}. Score must be an integer between 1 and 5.`
    );
  }

  return {
    feedbackId: input.feedbackId ?? randomUUID(),
    bundleId: input.bundleId,
    profileId: input.profileId,
    target: input.target,
    score: score as FeedbackRecord['score'],
    notes: input.notes,
    acceptedAt: input.acceptedAt,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Weight derivation
// ---------------------------------------------------------------------------

/**
 * Derive scoring weights from a list of feedback records for a single profile.
 *
 * Strategy:
 * - Average score sets the overall sentiment multiplier (1–5 → 0.5–1.5 range).
 * - Low scores push specificity and targetReadiness weights up (the user felt
 *   the output was too generic or missed the mark).
 * - High scores modestly boost styleConsistency (the user liked the voice).
 * - The resulting weights stay in [0.5, 2.0] and are normalized so the sum
 *   equals the sum of DEFAULT_SCORE_WEIGHTS (4.0).
 */

export function deriveScoringWeightsFromFeedback(
  records: FeedbackRecord[],
  opts?: LearnOpts
): ScoreWeights {
  // Defaults
  const maxWeightDelta = opts?.maxWeightDelta ?? 0.05;
  const minSampleSize = opts?.minSampleSize ?? 5;
  const cooldownMs = opts?.cooldownMs ?? 86400000;
  const enableLearning = opts?.enableLearning !== false;
  const now = opts?.now ?? Date.now();
  const prevWeights = opts?.prevWeights ?? DEFAULT_SCORE_WEIGHTS;
  const lastDerivedAt = opts?.lastDerivedAt ? Date.parse(opts.lastDerivedAt) : null;

  // If learning is disabled, or not enough samples, or cooldown not elapsed, return previous weights
  if (!enableLearning || records.length < minSampleSize) {
    return { ...prevWeights };
  }
  if (lastDerivedAt && now - lastDerivedAt < cooldownMs) {
    return { ...prevWeights };
  }

  const total = records.length;
  const sum = records.reduce((acc, r) => acc + r.score, 0);
  const avg = sum / total;

  // Accepted count boosts styleConsistency.
  const acceptedCount = records.filter((r) => r.acceptedAt).length;
  const acceptedRatio = acceptedCount / total;

  // Sentiment multiplier: avg 3 → 1.0, avg 1 → 0.5, avg 5 → 1.5
  const sentiment = 0.5 + (avg - 1) * (1.0 / 4);

  // Low scores indicate the output felt vague or off-target → push specificity
  const specificityBoost = avg < 3 ? 1.0 + (3 - avg) * 0.15 : 1.0;
  const targetBoost = avg < 3 ? 1.0 + (3 - avg) * 0.10 : 1.0;
  const styleBoost = 1.0 + acceptedRatio * 0.5;
  const clarityBoost = sentiment;

  const raw: ScoreWeights = {
    clarity: clampWeight(clarityBoost),
    specificity: clampWeight(specificityBoost),
    styleConsistency: clampWeight(styleBoost),
    targetReadiness: clampWeight(targetBoost)
  };

  // Normalize so sum equals 4.0 (sum of defaults).
  const rawSum = raw.clarity + raw.specificity + raw.styleConsistency + raw.targetReadiness;
  const factor = 4.0 / rawSum;

  // Clamp each dimension to maxWeightDelta from previous weights
  function clampDelta(dim: keyof ScoreWeights): number {
    const prev = prevWeights[dim];
    const next = round2(raw[dim] * factor);
    const delta = next - prev;
    if (Math.abs(delta) > maxWeightDelta) {
      return round2(prev + Math.sign(delta) * maxWeightDelta);
    }
    return next;
  }

  return {
    clarity: clampDelta('clarity'),
    specificity: clampDelta('specificity'),
    styleConsistency: clampDelta('styleConsistency'),
    targetReadiness: clampDelta('targetReadiness')
  };
}

function clampWeight(v: number): number {
  return Math.max(0.5, Math.min(2.0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Aggregate helper
// ---------------------------------------------------------------------------

/**
 * Build a FeedbackAggregate summary for a profile's feedback history.
 */
export function buildFeedbackAggregate(
  profileId: string,
  records: FeedbackRecord[]
): FeedbackAggregate {
  const total = records.length;
  const avg =
    total === 0 ? 0 : records.reduce((acc, r) => acc + r.score, 0) / total;
  const acceptedCount = records.filter((r) => r.acceptedAt).length;

  return {
    profileId,
    totalRecords: total,
    averageScore: round2(avg),
    acceptedCount,
    derivedWeights: deriveScoringWeightsFromFeedback(records)
  };
}

// ---------------------------------------------------------------------------
// In-memory feedback store for the API server
// ---------------------------------------------------------------------------

export interface FeedbackStore {
  save(record: FeedbackRecord): FeedbackRecord;
  getByProfile(profileId: string): FeedbackRecord[];
  getByBundle(bundleId: string): FeedbackRecord[];
  getAggregate(profileId: string): FeedbackAggregate;
}

export function createInMemoryFeedbackStore(): FeedbackStore {
  const records: FeedbackRecord[] = [];

  return {
    save(record) {
      records.push(record);
      return record;
    },
    getByProfile(profileId) {
      return records.filter((r) => r.profileId === profileId);
    },
    getByBundle(bundleId) {
      return records.filter((r) => r.bundleId === bundleId);
    },
    getAggregate(profileId) {
      const byProfile = records.filter((r) => r.profileId === profileId);
      return buildFeedbackAggregate(profileId, byProfile);
    }
  };
}

// Export for use by CLI / extension without re-deriving.
export { CompileTarget };
