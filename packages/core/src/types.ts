export type CompileTarget = 'suno' | 'udio' | 'flux' | 'kling' | 'youtube' | 'generic';

export interface PromptBrief {
  id: string;
  title: string;
  concept: string;
  targets: CompileTarget[];
  genres: string[];
  mood: string[];
  energy?: number;
  bpm?: number;
  key?: string;
  vocals?: string;
  imagery?: string[];
  structure?: string[];
  constraints?: string[];
  notes?: string;
}

export interface BrandProfile {
  id: string;
  brandName: string;
  voice: string;
  signatureMotifs?: string[];
  preferredLanguage?: string;
  avoid?: string[];
  formatPreferences?: Record<string, string>;
  toneWeights?: Record<string, number>;
}

export interface TemplatePack {
  id: string;
  name: string;
  templates?: Record<string, Record<string, unknown>>;
}

export interface CompileOptions {
  includeGenericOutput?: boolean;
  templatePack?: TemplatePack;
  scoreWeights?: Partial<ScoreWeights>;
}

export interface Diagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface ScoreCard {
  clarity: number;
  specificity: number;
  styleConsistency: number;
  targetReadiness: number;
}

export interface ScoreWeights {
  clarity: number;
  specificity: number;
  styleConsistency: number;
  targetReadiness: number;
}

export interface CompiledTargetOutput {
  target: CompileTarget;
  title: string;
  format: 'text' | 'tags' | 'markdown';
  content: string;
}

export interface CompilationBundle {
  version: string;
  generatedAt: string;
  briefId: string;
  profileId: string;
  styleDNA: string[];
  diagnostics: Diagnostic[];
  scoreCard: ScoreCard;
  outputs: CompiledTargetOutput[];
}

export type AccountPlan = 'free' | 'pro' | 'studio';

export type AccessMode = 'local' | 'hosted';

export type EntitlementKey = 'free.local' | 'pro.creator' | 'studio.team' | 'credits.compute';

export type HostedFeatureKey =
  | 'local.compile'
  | 'local.export'
  | 'template-pack.default'
  | 'profile.sync.managed'
  | 'template-pack.premium'
  | 'export.packaging.branded'
  | 'workspace.shared'
  | 'access.rbac'
  | 'workflow.recipes'
  | 'automation.jobs'
  | 'compute.batch';

export interface ResolveEntitlementsInput {
  accountId?: string;
  workspaceId?: string;
  plan?: AccountPlan;
  mode?: AccessMode;
  grantedEntitlements?: EntitlementKey[];
  creditBalance?: number | null;
  usageSummary?: UsageAccountSummary;
  usageQuotas?: UsageQuotaSnapshot;
}

export interface FeatureAccess {
  key: HostedFeatureKey;
  enabled: boolean;
  source: EntitlementKey[];
  description: string;
  hostedOnly: boolean;
}

export interface ResolvedEntitlements {
  plan: AccountPlan;
  mode: AccessMode;
  entitlements: EntitlementKey[];
  features: FeatureAccess[];
  creditBalance: number | null;
}

export interface HostedSessionBootstrap {
  account: {
    accountId: string;
    workspaceId?: string;
    plan: AccountPlan;
    mode: AccessMode;
  };
  entitlements: ResolvedEntitlements;
  flags: {
    localFirst: boolean;
    hostedSyncEnabled: boolean;
    workflowAutomationEnabled: boolean;
    billingEnabled: boolean;
  };
  usage?: HostedUsageOverview;
}

export type SyncAssetType = 'brand-profile' | 'template-pack';

export interface SyncManifestAsset {
  assetId: string;
  assetType: SyncAssetType;
  displayName: string;
  version: string;
  updatedAt: string;
  checksum: string;
  workspaceScoped: boolean;
  deleted: boolean;
}

export interface VersionedBrandProfile extends BrandProfile {
  version?: string;
  updatedAt?: string;
}

export interface VersionedTemplatePack extends TemplatePack {
  version?: string;
  updatedAt?: string;
}

export interface CreateProfileLibrarySyncManifestInput {
  accountId: string;
  workspaceId?: string;
  entitlements?: EntitlementKey[];
  profiles?: VersionedBrandProfile[];
  templatePacks?: VersionedTemplatePack[];
  generatedAt?: string;
  cursor?: string;
}

export interface ProfileLibrarySyncManifest {
  manifestVersion: string;
  generatedAt: string;
  accountId: string;
  workspaceId?: string;
  cursor: string;
  entitlements: EntitlementKey[];
  assets: SyncManifestAsset[];
}

export interface HostedProfileLibraryDocument {
  documentVersion: string;
  accountId: string;
  workspaceId?: string;
  profiles: VersionedBrandProfile[];
  templatePacks: VersionedTemplatePack[];
  updatedAt: string;
}

export interface UpsertHostedProfileLibraryInput {
  accountId: string;
  workspaceId?: string;
  profiles?: VersionedBrandProfile[];
  templatePacks?: VersionedTemplatePack[];
  updatedAt?: string;
}

// --- Refinement ---

export type RefinementHintType =
  | 'boost-specificity'
  | 'reduce-vagueness'
  | 'add-constraint'
  | 'adjust-tone'
  | 'add-target'
  | 'remove-target';

export interface RefinementHint {
  type: RefinementHintType;
  /** When set, the hint applies only to this compilation target. */
  target?: CompileTarget;
  /** For add-constraint: the constraint text to append. */
  value?: string;
  /** Human-readable rationale surfaced in the Studio panel. */
  note?: string;
}

export interface RefinementContext {
  hints: RefinementHint[];
  /** Original bundle used to suggest which hints to surface. */
  priorBundle?: CompilationBundle;
}

// --- Workflow Recipes ---

export type WorkflowStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  label?: string;
  briefOverride?: Partial<PromptBrief>;
  profileOverride?: Partial<BrandProfile>;
  refinements?: RefinementHint[];
  options?: CompileOptions;
}

export interface WorkflowRecipe {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStepResult {
  stepId: string;
  status: WorkflowStepStatus;
  bundle?: CompilationBundle;
  error?: string;
}

export interface WorkflowRunResult {
  recipeId: string;
  completedAt: string;
  steps: WorkflowStepResult[];
}

export type AutomationJobType = 'profile-library-sync' | 'compile-batch';

export type AutomationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface AutomationJobEnvelope {
  jobId: string;
  jobType: AutomationJobType;
  status: AutomationJobStatus;
  accountId: string;
  workspaceId?: string;
  requiredFeature: HostedFeatureKey;
  creditsReserved: number;
  createdAt: string;
  updatedAt: string;
  inputSummary: Record<string, string | number | boolean>;
  resultSummary?: Record<string, string | number | boolean>;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface CreateAutomationJobInput {
  jobId?: string;
  jobType: AutomationJobType;
  accountId: string;
  workspaceId?: string;
  creditsRequested?: number;
  createdAt?: string;
  updatedAt?: string;
  inputSummary?: Record<string, string | number | boolean>;
  resultSummary?: Record<string, string | number | boolean>;
  error?: {
    code: string;
    message: string;
  } | null;
}

// --- Auto Compile ---

export interface AutoCompileRequest {
  /** Raw natural language description. No JSON required. */
  prompt: string;
  /** Override which compilation targets to emit. Defaults to heuristic detection. */
  targets?: CompileTarget[];
  /** Partial brand profile to merge over the default. */
  profileOverride?: Partial<BrandProfile>;
  /** When true, automatically apply derived refinement hints and include a refined bundle. */
  autoRefine?: boolean;
}

export interface AutoCompileResult {
  /** The PromptBrief derived from the natural language prompt. */
  derivedBrief: PromptBrief;
  /** The initial compilation bundle. */
  bundle: CompilationBundle;
  /** Refinement hints derived from the initial bundle. */
  hints: RefinementHint[];
  /** Refined bundle — present only when autoRefine is true and hints were derived. */
  refinedBundle?: CompilationBundle;
}

// --- Provider Execution Bridge (Phase 14 & Phase 24) ---

/**
 * Provider types supported for live execution.
 * - 'openai-compatible': OpenAI API or OpenAI-compatible endpoint (Claude, etc.)
 * - 'suno': Suno API for music/audio generation
 * - 'udio': Udio API for music/audio generation
 * - 'flux': FLUX API for image generation
 * - 'kling': Kling API for video generation
 * - 'dry-run': No network call; returns token estimate only
 */
export type ProviderTargetType = 'openai-compatible' | 'suno' | 'udio' | 'flux' | 'kling' | 'dry-run';

export interface ProviderTarget {
  /** Unique identifier for this provider config. */
  id: string;
  type: ProviderTargetType;
  /** Base URL for the API endpoint. Required for openai-compatible and providers that need it. */
  baseUrl?: string;
  /** Model/version identifier (e.g. 'gpt-4o', 'suno-v4'). */
  model?: string;
  /** API key — passed as Bearer token or custom auth header. Omit to use PROVIDER_API_KEY env var. */
  apiKey?: string;
  /** Extra headers to merge into the request. */
  headers?: Record<string, string>;
}

export interface ExecutionPolicy {
  /** Request timeout per attempt in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Number of retries after the first failed attempt. Defaults to 0. */
  maxRetries?: number;
  /** Delay between retry attempts in milliseconds. Defaults to 250. */
  retryDelayMs?: number;
}

export interface ExecutionRequest {
  /** The compiled output text to send to the provider. */
  content: string;
  /** Which compile target this content was generated for. */
  target: CompileTarget;
  /** Bundle that produced this content. */
  bundleId: string;
  /** Profile that shaped this output. */
  profileId: string;
  /** Provider configuration. */
  provider: ProviderTarget;
  /** Max tokens to request from the provider. Defaults to 512. */
  maxTokens?: number;
  /** Temperature for provider call. Defaults to 0.7. */
  temperature?: number;
  /** Optional network execution policy (timeouts + retry behavior). */
  policy?: ExecutionPolicy;
}

export interface ExecutionResult {
  requestId: string;
  bundleId: string;
  profileId: string;
  target: CompileTarget;
  provider: ProviderTargetType;
  /** Estimated token count (always present; dry-run uses heuristic). */
  estimatedTokens: number;
  /** True when the call was a dry-run (no provider call was made). */
  isDryRun: boolean;
  /** Provider response text — present only after a live call. */
  responseText?: string;
  /** Finish reason from the provider. */
  finishReason?: 'stop' | 'length' | 'error' | 'dry-run';
  executedAt: string;
  /** Latency in milliseconds. 0 for dry-run. */
  latencyMs: number;
  error?: {
    code: string;
    message: string;
  };
}

// --- Feedback Scoring Loop (Phase 15) ---

export interface FeedbackRecord {
  /** Unique feedback event ID. */
  feedbackId: string;
  bundleId: string;
  profileId: string;
  /** Which target output this feedback applies to. */
  target: CompileTarget;
  /** 1 (poor) to 5 (excellent). */
  score: 1 | 2 | 3 | 4 | 5;
  /** Optional freetext notes from the user. */
  notes?: string;
  /** When the user accepted / used this output downstream. */
  acceptedAt?: string;
  createdAt: string;
}

export interface CreateFeedbackInput {
  feedbackId?: string;
  bundleId: string;
  profileId: string;
  target: CompileTarget;
  score: number;
  notes?: string;
  acceptedAt?: string;
  createdAt?: string;
}

export interface ScoreWeights {
  clarity: number;
  specificity: number;
  styleConsistency: number;
  targetReadiness: number;
}

export interface FeedbackAggregate {
  profileId: string;
  totalRecords: number;
  averageScore: number;
  acceptedCount: number;
  derivedWeights: ScoreWeights;
}

// --- Publishing Automation (Phase 16) ---

export type PublishTargetKind = 'webhook' | 'dry-run';

export interface PublishTarget {
  id: string;
  kind: PublishTargetKind;
  /** Destination URL for webhook targets. */
  url?: string;
  /** Secret used to sign the payload (HMAC-SHA256 in X-Signature header). */
  secret?: string;
  /** Extra headers to include in the publish request. */
  headers?: Record<string, string>;
}

export type PublishJobStatus = 'queued' | 'dispatched' | 'delivered' | 'failed';

export interface PublishJob {
  jobId: string;
  bundleId: string;
  profileId: string;
  workspaceId?: string;
  target: PublishTarget;
  status: PublishJobStatus;
  createdAt: string;
  updatedAt: string;
  /** HTTP status from the remote endpoint (if applicable). */
  remoteStatus?: number;
  /** Response body excerpt (first 500 chars). */
  responseExcerpt?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreatePublishJobInput {
  jobId?: string;
  bundleId: string;
  profileId: string;
  workspaceId?: string;
  target: PublishTarget;
  createdAt?: string;
}

// --- Review, Approval, and Team Workflow Layer (Phase 21) ---

export type BundleReviewStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published';

export type BundleReviewDecisionType = 'approve' | 'request_changes';

export interface BundleReviewComment {
  commentId: string;
  bundleId: string;
  workspaceId: string;
  authorAccountId: string;
  message: string;
  createdAt: string;
}

export interface BundleReviewDecision {
  decisionId: string;
  bundleId: string;
  workspaceId: string;
  reviewerAccountId: string;
  decision: BundleReviewDecisionType;
  comment?: string;
  createdAt: string;
}

export interface BundleReviewRecord {
  bundleId: string;
  workspaceId: string;
  createdBy: string;
  status: BundleReviewStatus;
  requiredApprovals: number;
  comments: BundleReviewComment[];
  decisions: BundleReviewDecision[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  publishedAt?: string;
}

export interface CreateBundleReviewInput {
  bundleId: string;
  workspaceId: string;
  createdBy: string;
  requiredApprovals?: number;
  createdAt?: string;
}

export interface CreateBundleReviewCommentInput {
  commentId?: string;
  authorAccountId: string;
  message: string;
  createdAt?: string;
}

export interface CreateBundleReviewDecisionInput {
  decisionId?: string;
  reviewerAccountId: string;
  decision: BundleReviewDecisionType;
  comment?: string;
  createdAt?: string;
}

// --- Commercial Readiness Layer (Phase 22) ---

export type UsageMeteringDomain = 'execute' | 'publish' | 'marketplace-install' | 'learning';

export type UsageMeteringUnit = 'request' | 'token';

export interface UsageMeteringEvent {
  eventId: string;
  accountId: string;
  workspaceId?: string;
  domain: UsageMeteringDomain;
  action: string;
  unitsConsumed: number;
  unit: UsageMeteringUnit;
  bundleId?: string;
  profileId?: string;
  listingId?: string;
  plan?: AccountPlan;
  mode?: AccessMode;
  entitlements?: EntitlementKey[];
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface CreateUsageMeteringEventInput {
  eventId?: string;
  accountId: string;
  workspaceId?: string;
  domain: UsageMeteringDomain;
  action: string;
  unitsConsumed?: number;
  unit?: UsageMeteringUnit;
  bundleId?: string;
  profileId?: string;
  listingId?: string;
  plan?: AccountPlan;
  mode?: AccessMode;
  entitlements?: EntitlementKey[];
  occurredAt?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface UsageMeteringEventFilter {
  workspaceId?: string;
  domain?: UsageMeteringDomain;
  unit?: UsageMeteringUnit;
  from?: string;
  to?: string;
}

export interface UsageAccountSummary {
  accountId: string;
  totalEvents: number;
  totalsByDomain: Record<UsageMeteringDomain, number>;
  totalsByUnit: Record<UsageMeteringUnit, number>;
  mostRecentEventAt?: string;
}

export interface UsageQuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}

export type UsageQuotaSnapshot = Record<UsageMeteringDomain, UsageQuotaStatus>;

export interface HostedUsageOverview {
  summary?: UsageAccountSummary;
  quotas?: UsageQuotaSnapshot;
  creditsRemaining: number | null;
}

// --- Profile Marketplace (Phase 17) ---

export type MarketplaceListingType = 'brand-profile' | 'template-pack';

export type MarketplaceListingStatus = 'draft' | 'published' | 'archived';

export interface MarketplaceListingDocument {
  listingId: string;
  listingType: MarketplaceListingType;
  status: MarketplaceListingStatus;
  /** Account that published this listing. */
  publishedBy: string;
  displayName: string;
  description?: string;
  tags?: string[];
  /** Entitlement required to publish. Browsing is always free. */
  requiredEntitlement: Extract<EntitlementKey, 'pro.creator' | 'studio.team'>;
  /** Serialized profile or template-pack payload. */
  payload: VersionedBrandProfile | VersionedTemplatePack;
  version: string;
  publishedAt: string;
  updatedAt: string;
  /** Download / install count. */
  installCount: number;
}

export interface CreateMarketplaceListingInput {
  listingId?: string;
  listingType: MarketplaceListingType;
  publishedBy: string;
  displayName: string;
  description?: string;
  tags?: string[];
  payload: VersionedBrandProfile | VersionedTemplatePack;
  version?: string;
  publishedAt?: string;
}
