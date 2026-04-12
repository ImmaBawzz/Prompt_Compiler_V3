import { BrandProfile, Diagnostic, PromptBrief } from './types';

export function validateBrief(brief: PromptBrief): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!brief.id?.trim()) diagnostics.push({ level: 'error', code: 'BRIEF_ID_REQUIRED', message: 'Brief id is required.' });
  if (!brief.title?.trim()) diagnostics.push({ level: 'error', code: 'BRIEF_TITLE_REQUIRED', message: 'Brief title is required.' });
  if (!brief.concept?.trim()) diagnostics.push({ level: 'error', code: 'BRIEF_CONCEPT_REQUIRED', message: 'Brief concept is required.' });
  if (!brief.targets?.length) diagnostics.push({ level: 'error', code: 'BRIEF_TARGETS_REQUIRED', message: 'At least one target is required.' });
  if (!brief.genres?.length) diagnostics.push({ level: 'warning', code: 'BRIEF_GENRES_THIN', message: 'Genres are missing or too thin.' });
  if (!brief.mood?.length) diagnostics.push({ level: 'warning', code: 'BRIEF_MOOD_THIN', message: 'Mood descriptors are missing or too thin.' });
  if ((brief.imagery?.length ?? 0) === 0) diagnostics.push({ level: 'info', code: 'BRIEF_IMAGERY_EMPTY', message: 'No imagery hints supplied.' });
  if ((brief.structure?.length ?? 0) === 0) diagnostics.push({ level: 'info', code: 'BRIEF_STRUCTURE_EMPTY', message: 'No structure hints supplied.' });

  return diagnostics;
}

export function validateProfile(profile: BrandProfile): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!profile.id?.trim()) diagnostics.push({ level: 'error', code: 'PROFILE_ID_REQUIRED', message: 'Profile id is required.' });
  if (!profile.brandName?.trim()) diagnostics.push({ level: 'error', code: 'PROFILE_NAME_REQUIRED', message: 'Brand name is required.' });
  if (!profile.voice?.trim()) diagnostics.push({ level: 'error', code: 'PROFILE_VOICE_REQUIRED', message: 'Profile voice is required.' });
  if ((profile.signatureMotifs?.length ?? 0) === 0) diagnostics.push({ level: 'info', code: 'PROFILE_MOTIFS_EMPTY', message: 'No signature motifs supplied.' });

  return diagnostics;
}
