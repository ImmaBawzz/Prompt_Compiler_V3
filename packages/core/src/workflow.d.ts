import { BrandProfile, PromptBrief, WorkflowRecipe, WorkflowRunResult } from './types';
/**
 * Execute a WorkflowRecipe step-by-step.
 *
 * Each step can override fields on the brief/profile and apply
 * RefinementHints before compiling. If a step fails, it is marked
 * 'failed' and execution continues with remaining steps (non-fatal).
 *
 * The base brief and profile are never mutated.
 */
export declare function executeWorkflowRecipe(recipe: WorkflowRecipe, baseBrief: PromptBrief, baseProfile: BrandProfile): WorkflowRunResult;
