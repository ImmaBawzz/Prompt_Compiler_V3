import { BrandProfile, CompileTarget, PromptBrief } from './types';
import { uniqueClean } from './utils';

const VALID_TARGETS: ReadonlySet<CompileTarget> = new Set([
  'suno',
  'udio',
  'flux',
  'kling',
  'youtube',
  'generic'
]);

function cleanText(value: string | undefined): string {
  return (value ?? '').trim();
}

function normalizeStringList(values: string[] | undefined): string[] {
  return uniqueClean((values ?? []).map((item) => item.trim()));
}

function normalizeTargets(values: Array<string | CompileTarget> | undefined): CompileTarget[] {
  const targets = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is CompileTarget => VALID_TARGETS.has(value as CompileTarget));

  return uniqueClean(targets) as CompileTarget[];
}

export function normalizeBrief(brief: PromptBrief): PromptBrief {
  return {
    ...brief,
    id: cleanText(brief.id),
    title: cleanText(brief.title),
    concept: cleanText(brief.concept),
    targets: normalizeTargets(brief.targets),
    genres: normalizeStringList(brief.genres),
    mood: normalizeStringList(brief.mood),
    key: cleanText(brief.key),
    vocals: cleanText(brief.vocals),
    imagery: normalizeStringList(brief.imagery),
    structure: normalizeStringList(brief.structure),
    constraints: normalizeStringList(brief.constraints),
    notes: cleanText(brief.notes)
  };
}

export function normalizeProfile(profile: BrandProfile): BrandProfile {
  return {
    ...profile,
    id: cleanText(profile.id),
    brandName: cleanText(profile.brandName),
    voice: cleanText(profile.voice),
    preferredLanguage: cleanText(profile.preferredLanguage),
    signatureMotifs: normalizeStringList(profile.signatureMotifs),
    avoid: normalizeStringList(profile.avoid)
  };
}
