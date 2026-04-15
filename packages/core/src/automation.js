"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTOMATION_JOB_TYPE_VALUES = void 0;
exports.isAutomationJobType = isAutomationJobType;
exports.getRequiredFeatureForAutomationJob = getRequiredFeatureForAutomationJob;
exports.createAutomationJobEnvelope = createAutomationJobEnvelope;
const node_crypto_1 = require("node:crypto");
const utils_1 = require("./utils");
exports.AUTOMATION_JOB_TYPE_VALUES = ['profile-library-sync', 'compile-batch'];
const AUTOMATION_JOB_FEATURES = {
    'profile-library-sync': 'automation.jobs',
    'compile-batch': 'compute.batch'
};
function isAutomationJobType(value) {
    return typeof value === 'string' && exports.AUTOMATION_JOB_TYPE_VALUES.includes(value);
}
function getRequiredFeatureForAutomationJob(jobType) {
    return AUTOMATION_JOB_FEATURES[jobType];
}
function createJobId(jobType, accountId, createdAt) {
    const hash = (0, node_crypto_1.createHash)('sha256').update(`${jobType}:${accountId}:${createdAt}`).digest('hex').slice(0, 12);
    return `job-${(0, utils_1.slugify)(jobType)}-${hash}`;
}
function createAutomationJobEnvelope(input) {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    return {
        jobId: input.jobId ?? createJobId(input.jobType, input.accountId, createdAt),
        jobType: input.jobType,
        status: 'queued',
        accountId: input.accountId,
        workspaceId: input.workspaceId,
        requiredFeature: getRequiredFeatureForAutomationJob(input.jobType),
        creditsReserved: input.creditsRequested ?? 0,
        createdAt,
        updatedAt,
        inputSummary: input.inputSummary ?? {},
        resultSummary: input.resultSummary,
        error: input.error ?? null
    };
}
//# sourceMappingURL=automation.js.map