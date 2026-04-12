"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBrief = normalizeBrief;
exports.normalizeProfile = normalizeProfile;
const utils_1 = require("./utils");
const VALID_TARGETS = new Set([
    'suno',
    'udio',
    'flux',
    'kling',
    'youtube',
    'generic'
]);
function cleanText(value) {
    return (value ?? '').trim();
}
function normalizeStringList(values) {
    return (0, utils_1.uniqueClean)((values ?? []).map((item) => item.trim()));
}
function normalizeTargets(values) {
    const targets = (values ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter((value) => VALID_TARGETS.has(value));
    return (0, utils_1.uniqueClean)(targets);
}
function normalizeBrief(brief) {
    return {
        ...brief,
        id: cleanText(brief.id),
        title: cleanText(brief.title),
        concept: cleanText(brief.concept),
        targets: normalizeTargets(brief.targets),
        genres: normalizeStringList(brief.genres),
        mood: normalizeStringList(brief.mood),
        key: cleanText(brief.key),
        vocals: cleanText(brief.vocals),
        imagery: normalizeStringList(brief.imagery),
        structure: normalizeStringList(brief.structure),
        constraints: normalizeStringList(brief.constraints),
        notes: cleanText(brief.notes)
    };
}
function normalizeProfile(profile) {
    return {
        ...profile,
        id: cleanText(profile.id),
        brandName: cleanText(profile.brandName),
        voice: cleanText(profile.voice),
        preferredLanguage: cleanText(profile.preferredLanguage),
        signatureMotifs: normalizeStringList(profile.signatureMotifs),
        avoid: normalizeStringList(profile.avoid)
    };
}
//# sourceMappingURL=normalizers.js.map