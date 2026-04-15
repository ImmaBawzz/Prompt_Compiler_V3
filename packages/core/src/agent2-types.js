"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BEHAVIORAL_WEIGHTS = void 0;
exports.createDefaultBehavioralWeights = createDefaultBehavioralWeights;
exports.DEFAULT_BEHAVIORAL_WEIGHTS = {
    'self-modification-threshold': 0.5,
    'code-change-confidence': 0.5,
    'test-first-priority': 0.5,
    'task-selection-breadth': 0.5,
    'git-push-eagerness': 0.5,
    'learning-cycle-frequency': 0.5,
    'shadow-eval-strictness': 0.5
};
function createDefaultBehavioralWeights(now = new Date().toISOString()) {
    return Object.keys(exports.DEFAULT_BEHAVIORAL_WEIGHTS).map((dimension) => ({
        dimension,
        currentValue: exports.DEFAULT_BEHAVIORAL_WEIGHTS[dimension],
        status: 'active',
        sampleCount: 0,
        updatedAt: now
    }));
}
//# sourceMappingURL=agent2-types.js.map