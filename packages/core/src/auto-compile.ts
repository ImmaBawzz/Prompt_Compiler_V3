import { compilePromptBundle } from './compiler';
import { deriveRefinementHints, refinePromptBundle } from './refinement';
import {
  AutoCompileRequest,
  AutoCompileResult,
  BrandProfile,
  CompileTarget,
  PromptBrief
} from './types';

// ---------------------------------------------------------------------------
// Target detection signals
// ---------------------------------------------------------------------------

const TARGET_SIGNALS: Array<{ pattern: RegExp; targets: CompileTarget[] }> = [
  { pattern: /\bsuno\b/i, targets: ['suno'] },
  { pattern: /\budio\b/i, targets: ['udio'] },
  { pattern: /\bflux\b/i, targets: ['flux'] },
  { pattern: /\bkling\b/i, targets: ['kling'] },
  { pattern: /\byoutube\b/i, targets: ['youtube'] },
  { pattern: /\b(image|photo|visual|picture)\b/i, targets: ['flux'] },
  { pattern: /\b(video|footage)\b/i, targets: ['kling', 'youtube'] },
  { pattern: /\b(music|track|song|beat|audio|instrumental)\b/i, targets: ['suno', 'udio'] },
  { pattern: /\bcinematic\b/i, targets: ['kling', 'youtube'] },
];

// ---------------------------------------------------------------------------
// Mood / genre keyword lists
// ---------------------------------------------------------------------------

const MOOD_KEYWORDS = [
  'dark', 'melancholic', 'euphoric', 'happy', 'uplifting', 'intense', 'chill',
  'emotional', 'epic', 'aggressive', 'peaceful', 'dreamy', 'nostalgic', 'energetic',
  'haunting', 'ethereal', 'powerful', 'raw', 'intimate', 'vast', 'tense', 'hopeful'
];

const GENRE_KEYWORDS = [
  'lo-fi', 'lofi', 'ambient', 'trap', 'edm', 'jazz', 'hip-hop', 'hiphop',
  'classical', 'cinematic', 'hardstyle', 'electronic', 'acoustic', 'pop', 'rock',
  'metal', 'rnb', 'r&b', 'soul', 'blues', 'folk', 'indie', 'synthwave', 'vaporwave',
  'dreamwave', 'orchestral', 'chillwave', 'dubstep', 'drum and bass',
];

// ---------------------------------------------------------------------------
// Default profile used when no profileOverride is provided
// ---------------------------------------------------------------------------

export const DEFAULT_AUTO_PROFILE: BrandProfile = {
  id: 'profile-auto-default',
  brandName: 'Auto',
  voice: 'clear, vivid, purposeful',
  signatureMotifs: [],
  avoid: ['generic filler']
};

// ---------------------------------------------------------------------------
// deriveBriefFromPrompt
// ---------------------------------------------------------------------------

/**
 * Convert a raw natural language string into a valid PromptBrief using
 * heuristic keyword analysis. No external services required.
 */
export function deriveBriefFromPrompt(input: string): PromptBrief {
  const lower = input.toLowerCase();

  // --- Targets ----
  const detectedTargets = new Set<CompileTarget>();
  for (const { pattern, targets } of TARGET_SIGNALS) {
    if (pattern.test(lower)) {
      targets.forEach((t) => detectedTargets.add(t));
    }
  }
  const targets: CompileTarget[] = detectedTargets.size > 0
    ? [...detectedTargets]
    : ['suno', 'udio', 'flux'];

  // --- Genres ---
  const genres = GENRE_KEYWORDS.filter((g) => lower.includes(g));

  // --- Mood ---
  const mood = MOOD_KEYWORDS.filter((m) => lower.includes(m));

  // --- Energy ---
  let energy = 60;
  if (/\b(high.?energy|energetic|intense|powerful|hard|fast|aggressive)\b/i.test(input)) {
    energy = 85;
  } else if (/\b(chill|soft|slow|gentle|mellow|calm|relaxed)\b/i.test(input)) {
    energy = 30;
  }

  // --- Constraints ---
  const constraintMatches = [...input.matchAll(/\b(?:avoid|no|without)\s+([^,.;]+)/gi)];
  const constraints = constraintMatches
    .map((m) => `avoid ${m[1].trim()}`)
    .filter((c) => c.length > 6);

  // --- Title: first 6 words, sentence-cased ---
  const rawTitle = input.trim().split(/\s+/).slice(0, 6).join(' ');
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

  // --- ID ---
  const id = `brief-auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return {
    id,
    title,
    concept: input.trim(),
    targets,
    genres: genres.length > 0 ? genres : ['cinematic'],
    mood: mood.length > 0 ? mood : ['expressive'],
    energy,
    ...(constraints.length > 0 ? { constraints } : {})
  };
}

// ---------------------------------------------------------------------------
// autoCompile
// ---------------------------------------------------------------------------

/**
 * Full automation from a single natural language prompt.
 *
 * 1. Derive a PromptBrief from the prompt string.
 * 2. Merge the optional profileOverride onto the default auto profile.
 * 3. Compile via compilePromptBundle.
 * 4. Derive refinement hints.
 * 5. Optionally auto-refine when `autoRefine` is true and hints exist.
 */
export function autoCompile(request: AutoCompileRequest): AutoCompileResult {
  const derived = deriveBriefFromPrompt(request.prompt);

  const brief: PromptBrief = request.targets && request.targets.length > 0
    ? { ...derived, targets: request.targets }
    : derived;

  const profile: BrandProfile = request.profileOverride
    ? { ...DEFAULT_AUTO_PROFILE, ...request.profileOverride }
    : DEFAULT_AUTO_PROFILE;

  const bundle = compilePromptBundle(brief, profile, { includeGenericOutput: false });
  const hints = deriveRefinementHints(bundle);

  const result: AutoCompileResult = { derivedBrief: brief, bundle, hints };

  if (request.autoRefine && hints.length > 0) {
    result.refinedBundle = refinePromptBundle(brief, profile, { hints });
  }

  return result;
}
