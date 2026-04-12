"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCompileDiagnostics = buildCompileDiagnostics;
function buildCorpus(brief) {
    return [
        brief.title,
        brief.concept,
        brief.notes,
        ...(brief.genres ?? []),
        ...(brief.mood ?? []),
        ...(brief.imagery ?? [])
    ]
        .join(' ')
        .toLowerCase();
}
function buildCompileDiagnostics(brief, profile) {
    const diagnostics = [];
    const conceptWordCount = brief.concept.split(/\s+/).filter(Boolean).length;
    if (conceptWordCount > 0 && conceptWordCount < 8) {
        diagnostics.push({
            level: 'warning',
            code: 'BRIEF_CONCEPT_VAGUE',
            message: 'Concept is short; add specificity to improve output quality.'
        });
    }
    const lowerCorpus = buildCorpus(brief);
    const avoidConflicts = (profile.avoid ?? []).filter((phrase) => lowerCorpus.includes(phrase.toLowerCase()));
    if (avoidConflicts.length > 0) {
        diagnostics.push({
            level: 'warning',
            code: 'PROFILE_BRIEF_TENSION',
            message: `Brief appears to include avoided profile language: ${avoidConflicts.join(', ')}.`
        });
    }
    const musicTargets = brief.targets.some((target) => target === 'suno' || target === 'udio');
    if (musicTargets && (brief.genres.length === 0 || brief.mood.length === 0)) {
        diagnostics.push({
            level: 'warning',
            code: 'TARGET_MUSIC_CONTEXT_THIN',
            message: 'Music targets work better with both genre and mood descriptors.'
        });
    }
    const visualTargets = brief.targets.some((target) => target === 'flux' || target === 'kling');
    if (visualTargets && brief.imagery?.length === 0) {
        diagnostics.push({
            level: 'warning',
            code: 'TARGET_VISUAL_CONTEXT_THIN',
            message: 'Visual targets are selected but imagery hints are missing.'
        });
    }
    return diagnostics;
}
//# sourceMappingURL=diagnostics.js.map