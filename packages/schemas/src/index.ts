import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

// JSON schema imports (inlined at compile time via resolveJsonModule)
import briefSchema from '../prompt-brief.schema.json';
import profileSchema from '../brand-profile.schema.json';
import feedbackSchema from '../feedback-record.schema.json';
import executionSchema from '../execution-request.schema.json';
import publishJobSchema from '../publish-job.schema.json';
import marketplaceListingSchema from '../marketplace-listing.schema.json';

// ---------------------------------------------------------------------------
// Schema file path constants
// ---------------------------------------------------------------------------

export const schemaPaths = {
  promptBrief: 'packages/schemas/prompt-brief.schema.json',
  brandProfile: 'packages/schemas/brand-profile.schema.json',
  templatePack: 'packages/schemas/template-pack.schema.json',
  hostedProfileLibraryDocument: 'packages/schemas/hosted-profile-library-document.schema.json',
  profileLibrarySyncManifest: 'packages/schemas/profile-library-sync-manifest.schema.json',
  automationJob: 'packages/schemas/automation-job.schema.json'
} as const;

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error strings. Empty when valid. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Pre-compiled validators (ajv 2020-12)
// strict: false — tolerates extra unknown fields in request payloads
// allErrors: true — collects all errors instead of stopping at first
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

const _validateBrief = ajv.compile(briefSchema);
const _validateProfile = ajv.compile(profileSchema);
const _validateFeedback = ajv.compile(feedbackSchema);
const _validateExecution = ajv.compile(executionSchema);
const _validatePublishJob = ajv.compile(publishJobSchema);
const _validateMarketplaceListing = ajv.compile(marketplaceListingSchema);

function toResult(fn: ReturnType<typeof ajv.compile>, data: unknown): ValidationResult {
  const valid = fn(data) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (fn.errors ?? []).map((e) =>
    e.instancePath ? `${e.instancePath}: ${e.message ?? 'invalid'}` : (e.message ?? 'Unknown validation error')
  );
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Exported validator functions
// ---------------------------------------------------------------------------

/** Validate a PromptBrief object against the JSON schema. */
export function validateBrief(data: unknown): ValidationResult {
  return toResult(_validateBrief, data);
}

/** Validate a BrandProfile object against the JSON schema. */
export function validateProfile(data: unknown): ValidationResult {
  return toResult(_validateProfile, data);
}

/** Validate a FeedbackRecord (or create-feedback input) against the JSON schema. */
export function validateFeedbackInput(data: unknown): ValidationResult {
  return toResult(_validateFeedback, data);
}

/** Validate an ExecutionRequest object against the JSON schema. */
export function validateExecutionRequest(data: unknown): ValidationResult {
  return toResult(_validateExecution, data);
}

/** Validate a PublishJob object against the JSON schema. */
export function validatePublishJob(data: unknown): ValidationResult {
  return toResult(_validatePublishJob, data);
}

/** Validate a MarketplaceListingDocument against the JSON schema. */
export function validateMarketplaceListing(data: unknown): ValidationResult {
  return toResult(_validateMarketplaceListing, data);
}
