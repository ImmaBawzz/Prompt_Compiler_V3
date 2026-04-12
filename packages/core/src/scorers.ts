import { BrandProfile, PromptBrief, ScoreCard } from './types';
import { clamp } from './utils';

export function buildScoreCard(brief: PromptBrief, profile: BrandProfile): ScoreCard {
  const clarityBase = brief.concept ? 70 : 20;
  const specificityBase = (brief.imagery?.length ?? 0) * 7 + (brief.structure?.length ?? 0) * 5 + (brief.constraints?.length ?? 0) * 4;
  const styleBase = (profile.signatureMotifs?.length ?? 0) * 8 + (profile.avoid?.length ?? 0) * 3 + (profile.voice ? 40 : 0);
  const targetBase = (brief.targets?.length ?? 0) * 12 + (brief.genres?.length ?? 0) * 5 + (brief.mood?.length ?? 0) * 4;

  return {
    clarity: clamp(clarityBase + (brief.notes ? 10 : 0), 0, 100),
    specificity: clamp(specificityBase + (brief.vocals ? 8 : 0) + (brief.key ? 6 : 0) + (brief.bpm ? 6 : 0), 0, 100),
    styleConsistency: clamp(styleBase, 0, 100),
    targetReadiness: clamp(targetBase, 0, 100)
  };
}
