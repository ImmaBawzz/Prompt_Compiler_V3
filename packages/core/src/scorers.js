"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScoreCard = buildScoreCard;
const utils_1 = require("./utils");
function buildScoreCard(brief, profile) {
    const clarityBase = brief.concept ? 70 : 20;
    const specificityBase = (brief.imagery?.length ?? 0) * 7 + (brief.structure?.length ?? 0) * 5 + (brief.constraints?.length ?? 0) * 4;
    const styleBase = (profile.signatureMotifs?.length ?? 0) * 8 + (profile.avoid?.length ?? 0) * 3 + (profile.voice ? 40 : 0);
    const targetBase = (brief.targets?.length ?? 0) * 12 + (brief.genres?.length ?? 0) * 5 + (brief.mood?.length ?? 0) * 4;
    return {
        clarity: (0, utils_1.clamp)(clarityBase + (brief.notes ? 10 : 0), 0, 100),
        specificity: (0, utils_1.clamp)(specificityBase + (brief.vocals ? 8 : 0) + (brief.key ? 6 : 0) + (brief.bpm ? 6 : 0), 0, 100),
        styleConsistency: (0, utils_1.clamp)(styleBase, 0, 100),
        targetReadiness: (0, utils_1.clamp)(targetBase, 0, 100)
    };
}
//# sourceMappingURL=scorers.js.map