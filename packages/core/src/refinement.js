"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveRefinementHints = deriveRefinementHints;
exports.refinePromptBundle = refinePromptBundle;
const compiler_1 = require("./compiler");
/**
 * Derive RefinementHints from a completed CompilationBundle.
 * These hints surface actionable improvement suggestions to the caller
 * (Studio panel, API response, CLI output) without mutating any data.
 */
function deriveRefinementHints(bundle) {
    const hints = [];
    const hasError = bundle.diagnostics.some((d) => d.level === 'error');
    if (hasError) {
        return hints;
    }
    if (bundle.scoreCard.specificity < 40) {
        hints.push({
            type: 'boost-specificity',
            note: 'Specificity score is low. Add imagery, structure cues, or constraints to sharpen outputs.'
        });
    }
    if (bundle.scoreCard.clarity < 50) {
        hints.push({
            type: 'reduce-vagueness',
            note: 'Concept or notes section lacks detail. Expand the brief concept or add explanatory notes.'
        });
    }
    const hasConstraints = bundle.diagnostics.some((d) => d.code === 'CONSTRAINTS_EMPTY');
    if (hasConstraints) {
        hints.push({
            type: 'add-constraint',
            note: 'No constraints detected. Adding explicit constraints usually improves downstream output quality.',
            value: ''
        });
    }
    if (bundle.scoreCard.styleConsistency < 40) {
        hints.push({
            type: 'adjust-tone',
            note: 'Style consistency score is low. Add signature motifs or tone weights to the brand profile.'
        });
    }
    if (bundle.scoreCard.targetReadiness < 30) {
        hints.push({
            type: 'add-target',
            note: 'Target readiness is low. Adding more genres, mood tags, or additional targets may help.'
        });
    }
    return hints;
}
/**
 * Apply refinement hints to a brief and profile before recompiling.
 * Returns a new CompilationBundle — never mutates the originals.
 */
function refinePromptBundle(brief, profile, context) {
    let refinedBrief = { ...brief };
    let refinedProfile = { ...profile };
    for (const hint of context.hints) {
        refinedBrief = applyHintToBrief(refinedBrief, hint);
        refinedProfile = applyHintToProfile(refinedProfile, hint);
    }
    const bundle = (0, compiler_1.compilePromptBundle)(refinedBrief, refinedProfile);
    return {
        ...bundle,
        diagnostics: [
            ...bundle.diagnostics,
            {
                level: 'info',
                code: 'REFINEMENT_APPLIED',
                message: `${context.hints.length} refinement hint(s) applied. Scores and outputs reflect the adjusted inputs.`
            }
        ]
    };
}
function applyHintToBrief(brief, hint) {
    switch (hint.type) {
        case 'add-constraint': {
            const constraintValue = hint.value?.trim();
            if (constraintValue) {
                return {
                    ...brief,
                    constraints: [...(brief.constraints ?? []), constraintValue]
                };
            }
            return brief;
        }
        case 'boost-specificity': {
            const extra = hint.value?.trim();
            if (extra && !(brief.imagery ?? []).includes(extra)) {
                return { ...brief, imagery: [...(brief.imagery ?? []), extra] };
            }
            return brief;
        }
        case 'reduce-vagueness': {
            if (hint.value?.trim() && !brief.notes) {
                return { ...brief, notes: hint.value.trim() };
            }
            return brief;
        }
        case 'add-target': {
            const targetValue = hint.value?.trim();
            if (targetValue && !brief.targets.includes(targetValue)) {
                return { ...brief, targets: [...brief.targets, targetValue] };
            }
            return brief;
        }
        case 'remove-target': {
            const targetValue = hint.target ?? hint.value?.trim();
            if (targetValue) {
                return { ...brief, targets: brief.targets.filter((t) => t !== targetValue) };
            }
            return brief;
        }
        default:
            return brief;
    }
}
function applyHintToProfile(profile, hint) {
    if (hint.type === 'adjust-tone' && hint.value?.trim()) {
        const [key, rawVal] = hint.value.split(':').map((s) => s.trim());
        const val = Number(rawVal);
        if (key && !Number.isNaN(val)) {
            return {
                ...profile,
                toneWeights: { ...(profile.toneWeights ?? {}), [key]: val }
            };
        }
    }
    return profile;
}
//# sourceMappingURL=refinement.js.map