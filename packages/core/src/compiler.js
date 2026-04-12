"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compilePromptBundle = compilePromptBundle;
const diagnostics_1 = require("./diagnostics");
const normalizers_1 = require("./normalizers");
const scorers_1 = require("./scorers");
const templates_1 = require("./templates");
const utils_1 = require("./utils");
const validators_1 = require("./validators");
function buildStyleDNA(brief, profile) {
    return (0, utils_1.uniqueClean)([
        profile.brandName,
        profile.voice,
        ...(profile.signatureMotifs ?? []),
        ...brief.genres,
        ...brief.mood,
        ...(brief.imagery ?? [])
    ]);
}
function compilePromptBundle(brief, profile, options = {}) {
    const normalizedBrief = (0, normalizers_1.normalizeBrief)(brief);
    const normalizedProfile = (0, normalizers_1.normalizeProfile)(profile);
    const diagnostics = [
        ...(0, validators_1.validateBrief)(normalizedBrief),
        ...(0, validators_1.validateProfile)(normalizedProfile),
        ...(0, diagnostics_1.buildCompileDiagnostics)(normalizedBrief, normalizedProfile)
    ];
    const hasError = diagnostics.some((item) => item.level === 'error');
    if (hasError) {
        return {
            version: '0.3.0',
            generatedAt: new Date().toISOString(),
            briefId: normalizedBrief.id || 'unknown-brief',
            profileId: normalizedProfile.id || 'unknown-profile',
            styleDNA: [],
            diagnostics,
            scoreCard: (0, scorers_1.buildScoreCard)(normalizedBrief, normalizedProfile),
            outputs: []
        };
    }
    const outputs = normalizedBrief.targets.map((target) => (0, templates_1.buildTargetOutput)(target, normalizedBrief, normalizedProfile));
    if (options.includeGenericOutput) {
        outputs.push((0, templates_1.buildTargetOutput)('generic', normalizedBrief, normalizedProfile));
    }
    if ((normalizedBrief.constraints?.length ?? 0) === 0) {
        diagnostics.push({ level: 'info', code: 'CONSTRAINTS_EMPTY', message: 'Adding constraints usually improves downstream output quality.' });
    }
    return {
        version: '0.3.0',
        generatedAt: new Date().toISOString(),
        briefId: normalizedBrief.id,
        profileId: normalizedProfile.id,
        styleDNA: buildStyleDNA(normalizedBrief, normalizedProfile),
        diagnostics,
        scoreCard: (0, scorers_1.buildScoreCard)(normalizedBrief, normalizedProfile),
        outputs
    };
}
//# sourceMappingURL=compiler.js.map