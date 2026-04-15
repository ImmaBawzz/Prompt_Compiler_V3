import { AutoCompileRequest, AutoCompileResult, BrandProfile, PromptBrief } from './types';
export declare const DEFAULT_AUTO_PROFILE: BrandProfile;
/**
 * Convert a raw natural language string into a valid PromptBrief using
 * heuristic keyword analysis. No external services required.
 */
export declare function deriveBriefFromPrompt(input: string): PromptBrief;
/**
 * Full automation from a single natural language prompt.
 *
 * 1. Derive a PromptBrief from the prompt string.
 * 2. Merge the optional profileOverride onto the default auto profile.
 * 3. Compile via compilePromptBundle.
 * 4. Derive refinement hints.
 * 5. Optionally auto-refine when `autoRefine` is true and hints exist.
 */
export declare function autoCompile(request: AutoCompileRequest): AutoCompileResult;
