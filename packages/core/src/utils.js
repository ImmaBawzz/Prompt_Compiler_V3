"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uniqueClean = uniqueClean;
exports.clamp = clamp;
exports.slugify = slugify;
function uniqueClean(values) {
    return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}
//# sourceMappingURL=utils.js.map