/**
 * Feedback Scoring Loop (Phase 15)
 *
 * Records outcome signals per compiled output and derives adjusted scoring
 * weights so that future buildScoreCard calls reflect historical feedback.
 * All derivation is pure and deterministic — no external services required.
 */
import { CompileTarget, CreateFeedbackInput, FeedbackAggregate, FeedbackRecord, LearnOpts, ScoreWeights } from './types';
export declare const DEFAULT_SCORE_WEIGHTS: ScoreWeights;
/**
 * Create a validated FeedbackRecord from raw input.
 * Throws if the score is not in the 1–5 range.
 */
export declare function createFeedbackRecord(input: CreateFeedbackInput): FeedbackRecord;
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
export declare function deriveScoringWeightsFromFeedback(records: FeedbackRecord[], opts?: LearnOpts): ScoreWeights;
/**
 * Build a FeedbackAggregate summary for a profile's feedback history.
 */
export declare function buildFeedbackAggregate(profileId: string, records: FeedbackRecord[]): FeedbackAggregate;
export interface FeedbackStore {
    save(record: FeedbackRecord): FeedbackRecord;
    getByProfile(profileId: string): FeedbackRecord[];
    getByBundle(bundleId: string): FeedbackRecord[];
    getAggregate(profileId: string): FeedbackAggregate;
}
export declare function createInMemoryFeedbackStore(): FeedbackStore;
export { CompileTarget };
