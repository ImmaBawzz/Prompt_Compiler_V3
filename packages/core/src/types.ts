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
