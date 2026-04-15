"use strict";
/**
 * Feedback Scoring Loop (Phase 15)
 *
 * Records outcome signals per compiled output and derives adjusted scoring
 * weights so that future buildScoreCard calls reflect historical feedback.
 * All derivation is pure and deterministic — no external services required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCORE_WEIGHTS = void 0;
exports.createFeedbackRecord = createFeedbackRecord;
exports.deriveScoringWeightsFromFeedback = deriveScoringWeightsFromFeedback;
exports.buildFeedbackAggregate = buildFeedbackAggregate;
exports.createInMemoryFeedbackStore = createInMemoryFeedbackStore;
const node_crypto_1 = require("node:crypto");
// ---------------------------------------------------------------------------
// Default weights — mirror the implicit weights in scorers.ts
// ---------------------------------------------------------------------------
exports.DEFAULT_SCORE_WEIGHTS = {
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
function createFeedbackRecord(input) {
    const score = Math.round(input.score);
    if (!VALID_SCORES.has(score)) {
        throw new RangeError(`Invalid feedback score ${input.score}. Score must be an integer between 1 and 5.`);
    }
    return {
        feedbackId: input.feedbackId ?? (0, node_crypto_1.randomUUID)(),
        bundleId: input.bundleId,
        profileId: input.profileId,
        target: input.target,
        score: score,
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
function deriveScoringWeightsFromFeedback(records) {
    if (records.length === 0) {
        return { ...exports.DEFAULT_SCORE_WEIGHTS };
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
    const raw = {
        clarity: clampWeight(clarityBoost),
        specificity: clampWeight(specificityBoost),
        styleConsistency: clampWeight(styleBoost),
        targetReadiness: clampWeight(targetBoost)
    };
    // Normalize so sum equals 4.0 (sum of defaults).
    const rawSum = raw.clarity + raw.specificity + raw.styleConsistency + raw.targetReadiness;
    const factor = 4.0 / rawSum;
    return {
        clarity: round2(raw.clarity * factor),
        specificity: round2(raw.specificity * factor),
        styleConsistency: round2(raw.styleConsistency * factor),
        targetReadiness: round2(raw.targetReadiness * factor)
    };
}
function clampWeight(v) {
    return Math.max(0.5, Math.min(2.0, v));
}
function round2(v) {
    return Math.round(v * 100) / 100;
}
// ---------------------------------------------------------------------------
// Aggregate helper
// ---------------------------------------------------------------------------
/**
 * Build a FeedbackAggregate summary for a profile's feedback history.
 */
function buildFeedbackAggregate(profileId, records) {
    const total = records.length;
    const avg = total === 0 ? 0 : records.reduce((acc, r) => acc + r.score, 0) / total;
    const acceptedCount = records.filter((r) => r.acceptedAt).length;
    return {
        profileId,
        totalRecords: total,
        averageScore: round2(avg),
        acceptedCount,
        derivedWeights: deriveScoringWeightsFromFeedback(records)
    };
}
function createInMemoryFeedbackStore() {
    const records = [];
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
//# sourceMappingURL=feedback.js.map