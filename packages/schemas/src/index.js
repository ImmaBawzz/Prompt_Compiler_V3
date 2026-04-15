"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemaPaths = void 0;
exports.validateBrief = validateBrief;
exports.validateProfile = validateProfile;
exports.validateFeedbackInput = validateFeedbackInput;
exports.validateExecutionRequest = validateExecutionRequest;
exports.validatePublishJob = validatePublishJob;
exports.validateMarketplaceListing = validateMarketplaceListing;
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
// JSON schema imports (inlined at compile time via resolveJsonModule)
const prompt_brief_schema_json_1 = __importDefault(require("../prompt-brief.schema.json"));
const brand_profile_schema_json_1 = __importDefault(require("../brand-profile.schema.json"));
const feedback_record_schema_json_1 = __importDefault(require("../feedback-record.schema.json"));
const execution_request_schema_json_1 = __importDefault(require("../execution-request.schema.json"));
const publish_job_schema_json_1 = __importDefault(require("../publish-job.schema.json"));
const marketplace_listing_schema_json_1 = __importDefault(require("../marketplace-listing.schema.json"));
// ---------------------------------------------------------------------------
// Schema file path constants
// ---------------------------------------------------------------------------
exports.schemaPaths = {
    promptBrief: 'packages/schemas/prompt-brief.schema.json',
    brandProfile: 'packages/schemas/brand-profile.schema.json',
    templatePack: 'packages/schemas/template-pack.schema.json',
    hostedProfileLibraryDocument: 'packages/schemas/hosted-profile-library-document.schema.json',
    profileLibrarySyncManifest: 'packages/schemas/profile-library-sync-manifest.schema.json',
    automationJob: 'packages/schemas/automation-job.schema.json'
};
// ---------------------------------------------------------------------------
// Pre-compiled validators (ajv 2020-12)
// strict: false — tolerates extra unknown fields in request payloads
// allErrors: true — collects all errors instead of stopping at first
// ---------------------------------------------------------------------------
const ajv = new _2020_1.default({ strict: false, allErrors: true });
(0, ajv_formats_1.default)(ajv);
const _validateBrief = ajv.compile(prompt_brief_schema_json_1.default);
const _validateProfile = ajv.compile(brand_profile_schema_json_1.default);
const _validateFeedback = ajv.compile(feedback_record_schema_json_1.default);
const _validateExecution = ajv.compile(execution_request_schema_json_1.default);
const _validatePublishJob = ajv.compile(publish_job_schema_json_1.default);
const _validateMarketplaceListing = ajv.compile(marketplace_listing_schema_json_1.default);
function toResult(fn, data) {
    const valid = fn(data);
    if (valid)
        return { valid: true, errors: [] };
    const errors = (fn.errors ?? []).map((e) => e.instancePath ? `${e.instancePath}: ${e.message ?? 'invalid'}` : (e.message ?? 'Unknown validation error'));
    return { valid: false, errors };
}
// ---------------------------------------------------------------------------
// Exported validator functions
// ---------------------------------------------------------------------------
/** Validate a PromptBrief object against the JSON schema. */
function validateBrief(data) {
    return toResult(_validateBrief, data);
}
/** Validate a BrandProfile object against the JSON schema. */
function validateProfile(data) {
    return toResult(_validateProfile, data);
}
/** Validate a FeedbackRecord (or create-feedback input) against the JSON schema. */
function validateFeedbackInput(data) {
    return toResult(_validateFeedback, data);
}
/** Validate an ExecutionRequest object against the JSON schema. */
function validateExecutionRequest(data) {
    return toResult(_validateExecution, data);
}
/** Validate a PublishJob object against the JSON schema. */
function validatePublishJob(data) {
    return toResult(_validatePublishJob, data);
}
/** Validate a MarketplaceListingDocument against the JSON schema. */
function validateMarketplaceListing(data) {
    return toResult(_validateMarketplaceListing, data);
}
//# sourceMappingURL=index.js.map