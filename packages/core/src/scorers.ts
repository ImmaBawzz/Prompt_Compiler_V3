import { BrandProfile, PromptBrief, ScoreCard, ScoreWeights } from './types';
import { clamp } from './utils';

export function buildScoreCard(
  brief: PromptBrief,
  profile: BrandProfile,
  scoreWeights: Partial<ScoreWeights> = {}
): ScoreCard {
  const clarityBase = brief.concept ? 70 : 20;
  const specificityBase = (brief.imagery?.length ?? 0) * 7 + (brief.structure?.length ?? 0) * 5 + (brief.constraints?.length ?? 0) * 4;
  const styleBase = (profile.signatureMotifs?.length ?? 0) * 8 + (profile.avoid?.length ?? 0) * 3 + (profile.voice ? 40 : 0);
  const targetBase = (brief.targets?.length ?? 0) * 12 + (brief.genres?.length ?? 0) * 5 + (brief.mood?.length ?? 0) * 4;

  const clarityWeight = getWeight(scoreWeights.clarity);
  const specificityWeight = getWeight(scoreWeights.specificity);
  const styleWeight = getWeight(scoreWeights.styleConsistency);
  const targetWeight = getWeight(scoreWeights.targetReadiness);

  return {
    clarity: clamp((clarityBase + (brief.notes ? 10 : 0)) * clarityWeight, 0, 100),
    specificity: clamp((specificityBase + (brief.vocals ? 8 : 0) + (brief.key ? 6 : 0) + (brief.bpm ? 6 : 0)) * specificityWeight, 0, 100),
    styleConsistency: clamp(styleBase * styleWeight, 0, 100),
    targetReadiness: clamp(targetBase * targetWeight, 0, 100)
  };
}

function getWeight(weight: number | undefined): number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1;
}
