import { refinePromptBundle } from './refinement';
import { compilePromptBundle } from './compiler';
import {
  BrandProfile,
  CompilationBundle,
  PromptBrief,
  WorkflowRecipe,
  WorkflowRunResult,
  WorkflowStep,
  WorkflowStepResult
} from './types';

/**
 * Execute a WorkflowRecipe step-by-step.
 *
 * Each step can override fields on the brief/profile and apply
 * RefinementHints before compiling. If a step fails, it is marked
 * 'failed' and execution continues with remaining steps (non-fatal).
 *
 * The base brief and profile are never mutated.
 */
export function executeWorkflowRecipe(
  recipe: WorkflowRecipe,
  baseBrief: PromptBrief,
  baseProfile: BrandProfile
): WorkflowRunResult {
  const stepResults: WorkflowStepResult[] = [];

  for (const step of recipe.steps) {
    const result = executeStep(step, baseBrief, baseProfile);
    stepResults.push(result);
  }

  return {
    recipeId: recipe.id,
    completedAt: new Date().toISOString(),
    steps: stepResults
  };
}

function executeStep(
  step: WorkflowStep,
  baseBrief: PromptBrief,
  baseProfile: BrandProfile
): WorkflowStepResult {
  try {
    const brief: PromptBrief = step.briefOverride
      ? { ...baseBrief, ...step.briefOverride }
      : baseBrief;

    const profile: BrandProfile = step.profileOverride
      ? { ...baseProfile, ...step.profileOverride }
      : baseProfile;

    let bundle: CompilationBundle;

    if (step.refinements && step.refinements.length > 0) {
      bundle = refinePromptBundle(brief, profile, { hints: step.refinements });
    } else {
      bundle = compilePromptBundle(brief, profile, step.options);
    }

    return { stepId: step.id, status: 'succeeded', bundle };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stepId: step.id, status: 'failed', error: message };
  }
}
