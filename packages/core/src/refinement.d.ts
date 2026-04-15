import { BrandProfile, CompilationBundle, PromptBrief, RefinementContext, RefinementHint } from './types';
/**
 * Derive RefinementHints from a completed CompilationBundle.
 * These hints surface actionable improvement suggestions to the caller
 * (Studio panel, API response, CLI output) without mutating any data.
 */
export declare function deriveRefinementHints(bundle: CompilationBundle): RefinementHint[];
/**
 * Apply refinement hints to a brief and profile before recompiling.
 * Returns a new CompilationBundle — never mutates the originals.
 */
export declare function refinePromptBundle(brief: PromptBrief, profile: BrandProfile, context: RefinementContext): CompilationBundle;
