export declare const schemaPaths: {
    readonly promptBrief: "packages/schemas/prompt-brief.schema.json";
    readonly brandProfile: "packages/schemas/brand-profile.schema.json";
    readonly templatePack: "packages/schemas/template-pack.schema.json";
    readonly hostedProfileLibraryDocument: "packages/schemas/hosted-profile-library-document.schema.json";
    readonly profileLibrarySyncManifest: "packages/schemas/profile-library-sync-manifest.schema.json";
    readonly automationJob: "packages/schemas/automation-job.schema.json";
};
export interface ValidationResult {
    valid: boolean;
    /** Human-readable error strings. Empty when valid. */
    errors: string[];
}
/** Validate a PromptBrief object against the JSON schema. */
export declare function validateBrief(data: unknown): ValidationResult;
/** Validate a BrandProfile object against the JSON schema. */
export declare function validateProfile(data: unknown): ValidationResult;
/** Validate a FeedbackRecord (or create-feedback input) against the JSON schema. */
export declare function validateFeedbackInput(data: unknown): ValidationResult;
/** Validate an ExecutionRequest object against the JSON schema. */
export declare function validateExecutionRequest(data: unknown): ValidationResult;
/** Validate a PublishJob object against the JSON schema. */
export declare function validatePublishJob(data: unknown): ValidationResult;
/** Validate a MarketplaceListingDocument against the JSON schema. */
export declare function validateMarketplaceListing(data: unknown): ValidationResult;
