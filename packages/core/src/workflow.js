"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWorkflowRecipe = executeWorkflowRecipe;
const refinement_1 = require("./refinement");
const compiler_1 = require("./compiler");
/**
 * Execute a WorkflowRecipe step-by-step.
 *
 * Each step can override fields on the brief/profile and apply
 * RefinementHints before compiling. If a step fails, it is marked
 * 'failed' and execution continues with remaining steps (non-fatal).
 *
 * The base brief and profile are never mutated.
 */
function executeWorkflowRecipe(recipe, baseBrief, baseProfile) {
    const stepResults = [];
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
function executeStep(step, baseBrief, baseProfile) {
    try {
        const brief = step.briefOverride
            ? { ...baseBrief, ...step.briefOverride }
            : baseBrief;
        const profile = step.profileOverride
            ? { ...baseProfile, ...step.profileOverride }
            : baseProfile;
        let bundle;
        if (step.refinements && step.refinements.length > 0) {
            bundle = (0, refinement_1.refinePromptBundle)(brief, profile, { hints: step.refinements });
        }
        else {
            bundle = (0, compiler_1.compilePromptBundle)(brief, profile, step.options);
        }
        return { stepId: step.id, status: 'succeeded', bundle };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { stepId: step.id, status: 'failed', error: message };
    }
}
//# sourceMappingURL=workflow.js.map