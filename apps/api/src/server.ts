import http, { IncomingMessage, ServerResponse } from 'node:http';
import { resolveAuthContext, requireAuth, requireOwnerAccess, requireWorkspaceRole, AuthConfig } from './auth';
import {
  validateBrief,
  validateProfile,
  validateExecutionRequest,
  validateFeedbackInput
} from '@prompt-compiler/schemas';
import {
  buildHostedSessionBootstrap,
  compilePromptBundle,
  createAutomationJobEnvelope,
  createProfileLibrarySyncManifest,
  refinePromptBundle,
  executeWorkflowRecipe,
  autoCompile,
  BrandProfile,
  EntitlementKey,
  getRequiredFeatureForAutomationJob,
  hasFeatureAccess,
  HostedFeatureKey,
  HostedProfileLibraryDocument,
  isAutomationJobType,
  isAccessMode,
  isAccountPlan,
  isEntitlementKey,
  isWorkspaceRole,
  PromptBrief,
  RefinementHint,
  WorkflowRecipe,
  resolveEntitlements,
  TemplatePack,
  // Phase 14
  executeCompiledOutput,
  ExecutionRequest,
  ProviderTarget,
  // Phase 15
  createFeedbackRecord,
  createInMemoryFeedbackStore,
  FeedbackStore,
  CreateFeedbackInput,
  // Phase 16
  createPublishJob,
  dispatchPublishJob,
  createInMemoryPublishJobStore,
  PublishJobStore,
  CreatePublishJobInput,
  PublishTarget,
  // Phase 17
  createMarketplaceListing,
  canPublishToMarketplace,
  createInMemoryMarketplaceStore,
  MarketplaceStore,
  CreateMarketplaceListingInput,
  MarketplaceListingType
} from '@prompt-compiler/core';
import { createInMemoryHostedProfileLibraryStore, HostedProfileLibraryStore } from './profileLibraryStore';
import { createFileHostedProfileLibraryStore } from './fileProfileLibraryStore';
import { createInMemoryWorkspaceMemberStore, WorkspaceMemberStore } from './workspaceMemberStore';

const port = Number(process.env.PORT || 8787);

interface ApiCompileRequest {
  brief?: PromptBrief;
  profile?: BrandProfile;
  options?: { includeGenericOutput?: boolean };
  // Optional session context — used for entitlement enforcement seam.
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: EntitlementKey[];
}

interface ApiProfileLibraryManifestRequest {
  accountId?: string;
  workspaceId?: string;
  entitlements?: EntitlementKey[];
  profiles?: Array<BrandProfile & { version?: string; updatedAt?: string }>;
  templatePacks?: Array<TemplatePack & { version?: string; updatedAt?: string }>;
  generatedAt?: string;
  cursor?: string;
}

interface ApiProfileLibraryDocumentUpsertRequest {
  accountId?: string;
  workspaceId?: string;
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: EntitlementKey[];
  updatedAt?: string;
  profiles?: Array<BrandProfile & { version?: string; updatedAt?: string }>;
  templatePacks?: Array<TemplatePack & { version?: string; updatedAt?: string }>;
}

interface ApiAutomationJobRequest {
  accountId?: string;
  workspaceId?: string;
  jobType?: string;
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: EntitlementKey[];
  creditsRequested?: number;
  /** Current credit balance for this account — used for billing seam validation. */
  creditBalance?: number;
  createdAt?: string;
  updatedAt?: string;
  inputSummary?: Record<string, string | number | boolean>;
}

interface ApiError {
  code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVER_ERROR';
  message: string;
}

interface ServerOptions {
  profileLibraryStore?: HostedProfileLibraryStore;
  /** Auth configuration for hosted routes. Defaults to bypass (local dev). */
  authConfig?: AuthConfig;
  /** Workspace member store for RBAC checks on workspace routes. */
  workspaceMemberStore?: WorkspaceMemberStore;
  /** Feedback store for Phase 15 outcome signals. */
  feedbackStore?: FeedbackStore;
  /** Publish job store for Phase 16 publishing automation. */
  publishJobStore?: PublishJobStore;
  /** Marketplace store for Phase 17 profile marketplace. */
  marketplaceStore?: MarketplaceStore;
}

function requestUrl(req: IncomingMessage): URL | null {
  if (!req.url) {
    return null;
  }

  return new URL(req.url, 'http://localhost');
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function errorResponse(res: ServerResponse, statusCode: number, error: ApiError): void {
  json(res, statusCode, { ok: false, error });
}

function parseBootstrapQuery(url: URL):
  | { ok: true; value: Parameters<typeof buildHostedSessionBootstrap>[0] }
  | { ok: false; error: ApiError } {
  const planValue = url.searchParams.get('plan');
  if (planValue && !isAccountPlan(planValue)) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid plan '${planValue}'. Expected one of free, pro, studio.`
      }
    };
  }

  const modeValue = url.searchParams.get('mode');
  if (modeValue && !isAccessMode(modeValue)) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid mode '${modeValue}'. Expected one of local, hosted.`
      }
    };
  }

  const entitlementValues = [
    ...url.searchParams.getAll('entitlement'),
    ...(url.searchParams.get('entitlements')?.split(',') ?? [])
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const invalidEntitlement = entitlementValues.find((value) => !isEntitlementKey(value));
  if (invalidEntitlement) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid entitlement '${invalidEntitlement}'.`
      }
    };
  }

  const grantedEntitlements = entitlementValues.filter((value): value is EntitlementKey => isEntitlementKey(value));

  const creditBalanceValue = url.searchParams.get('creditBalance');
  const creditBalance = creditBalanceValue ? Number(creditBalanceValue) : null;
  if (creditBalanceValue && Number.isNaN(creditBalance)) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid creditBalance '${creditBalanceValue}'. Expected a number.`
      }
    };
  }

  return {
    ok: true,
    value: {
      accountId: url.searchParams.get('accountId') ?? undefined,
      workspaceId: url.searchParams.get('workspaceId') ?? undefined,
      plan: planValue && isAccountPlan(planValue) ? planValue : undefined,
      mode: modeValue && isAccessMode(modeValue) ? modeValue : undefined,
      grantedEntitlements,
      creditBalance
    }
  };
}

function requireFeatureAccess(input: {
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: EntitlementKey[];
  featureKey: HostedFeatureKey;
}): ApiError | null {
  const resolved = resolveEntitlements({
    plan: input.plan,
    mode: input.mode,
    grantedEntitlements: input.entitlements
  });

  if (!hasFeatureAccess(resolved, input.featureKey)) {
    return {
      code: 'FORBIDDEN',
      message: `Feature '${input.featureKey}' is not enabled for the current hosted session.`
    };
  }

  return null;
}

export function createServer(options: ServerOptions = {}): http.Server {
  const profileLibraryStore = options.profileLibraryStore ?? createInMemoryHostedProfileLibraryStore();
  const workspaceMemberStore = options.workspaceMemberStore ?? createInMemoryWorkspaceMemberStore();
  const feedbackStore = options.feedbackStore ?? createInMemoryFeedbackStore();
  const publishJobStore = options.publishJobStore ?? createInMemoryPublishJobStore();
  const marketplaceStore = options.marketplaceStore ?? createInMemoryMarketplaceStore();

  return http.createServer(async (req, res) => {
    const url = requestUrl(req);

    if (!url) {
      errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Missing request URL.' });
      return;
    }

    // Resolve identity for this request.  Public routes ignore the context;
    // protected routes call requireAuth / requireOwnerAccess before processing.
    const authCtx = resolveAuthContext(req, options.authConfig ?? {});

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, service: 'prompt-compiler-api', status: 'healthy' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/session/bootstrap') {
      const query = parseBootstrapQuery(url);
      if (!query.ok) {
        errorResponse(res, 400, query.error);
        return;
      }

      json(res, 200, { ok: true, result: buildHostedSessionBootstrap(query.value) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/compile') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiCompileRequest;
        if (!payload?.brief || !payload?.profile) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include both brief and profile objects.'
          });
          return;
        }

        const briefValidation = validateBrief(payload.brief);
        if (!briefValidation.valid) {
          errorResponse(res, 400, {
            code: 'VALIDATION_ERROR',
            message: `Invalid brief: ${briefValidation.errors.join('; ')}`
          });
          return;
        }

        const profileValidation = validateProfile(payload.profile);
        if (!profileValidation.valid) {
          errorResponse(res, 400, {
            code: 'VALIDATION_ERROR',
            message: `Invalid profile: ${profileValidation.errors.join('; ')}`
          });
          return;
        }

        const compileEntitlementError = requireFeatureAccess({
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          featureKey: 'local.compile'
        });
        if (compileEntitlementError) {
          errorResponse(res, 403, compileEntitlementError);
          return;
        }

        const result = compilePromptBundle(payload.brief, payload.profile, payload.options ?? {});
        const hasErrors = result.diagnostics.some((item) => item.level === 'error');
        if (hasErrors) {
          errorResponse(res, 422, {
            code: 'VALIDATION_ERROR',
            message: 'Compilation failed validation checks.'
          });
          return;
        }

        json(res, 200, { ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }

        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/libraries/profile-sync-manifest') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiProfileLibraryManifestRequest;

        if (!payload?.accountId) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include accountId.'
          });
          return;
        }

        const ownerError = requireOwnerAccess(authCtx, payload.accountId);
        if (ownerError) {
          errorResponse(res, ownerError.code === 'UNAUTHORIZED' ? 401 : 403, ownerError);
          return;
        }

        if (payload.entitlements && payload.entitlements.some((value) => !isEntitlementKey(value))) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request includes an invalid entitlement.'
          });
          return;
        }

        if ((payload.profiles ?? []).some((profile) => !profile || typeof profile.id !== 'string' || typeof profile.brandName !== 'string')) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Each profile must include string id and brandName fields.'
          });
          return;
        }

        if ((payload.templatePacks ?? []).some((templatePack) => !templatePack || typeof templatePack.id !== 'string' || typeof templatePack.name !== 'string')) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Each template pack must include string id and name fields.'
          });
          return;
        }

        json(res, 200, {
          ok: true,
          result: createProfileLibrarySyncManifest({
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            entitlements: payload.entitlements,
            profiles: payload.profiles,
            templatePacks: payload.templatePacks,
            generatedAt: payload.generatedAt,
            cursor: payload.cursor
          })
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/libraries/profile-assets') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiProfileLibraryDocumentUpsertRequest;

        if (!payload?.accountId) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include accountId.'
          });
          return;
        }

        const ownerError = requireOwnerAccess(authCtx, payload.accountId);
        if (ownerError) {
          errorResponse(res, ownerError.code === 'UNAUTHORIZED' ? 401 : 403, ownerError);
          return;
        }

        if (payload.entitlements && payload.entitlements.some((value) => !isEntitlementKey(value))) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request includes an invalid entitlement.'
          });
          return;
        }

        const accessError = requireFeatureAccess({
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          featureKey: 'profile.sync.managed'
        });

        if (accessError) {
          errorResponse(res, 403, accessError);
          return;
        }

        const next = profileLibraryStore.upsert({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          profiles: payload.profiles,
          templatePacks: payload.templatePacks,
          updatedAt: payload.updatedAt
        });
        json(res, 200, { ok: true, result: next });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/libraries/profile-assets') {
      const accountId = url.searchParams.get('accountId');
      if (!accountId) {
        errorResponse(res, 400, {
          code: 'BAD_REQUEST',
          message: 'Query must include accountId.'
        });
        return;
      }

      const ownerError = requireOwnerAccess(authCtx, accountId);
      if (ownerError) {
        errorResponse(res, ownerError.code === 'UNAUTHORIZED' ? 401 : 403, ownerError);
        return;
      }

      const planValue = url.searchParams.get('plan');
      if (planValue && !isAccountPlan(planValue)) {
        errorResponse(res, 400, {
          code: 'BAD_REQUEST',
          message: `Invalid plan '${planValue}'. Expected one of free, pro, studio.`
        });
        return;
      }

      const modeValue = url.searchParams.get('mode');
      if (modeValue && !isAccessMode(modeValue)) {
        errorResponse(res, 400, {
          code: 'BAD_REQUEST',
          message: `Invalid mode '${modeValue}'. Expected one of local, hosted.`
        });
        return;
      }

      const entitlementValues = [
        ...url.searchParams.getAll('entitlement'),
        ...(url.searchParams.get('entitlements')?.split(',') ?? [])
      ]
        .map((value) => value.trim())
        .filter(Boolean);

      const invalidEntitlement = entitlementValues.find((value) => !isEntitlementKey(value));
      if (invalidEntitlement) {
        errorResponse(res, 400, {
          code: 'BAD_REQUEST',
          message: `Invalid entitlement '${invalidEntitlement}'.`
        });
        return;
      }

      const entitlements = entitlementValues.filter((value): value is EntitlementKey => isEntitlementKey(value));
      const accessError = requireFeatureAccess({
        plan: planValue && isAccountPlan(planValue) ? planValue : undefined,
        mode: modeValue && isAccessMode(modeValue) ? modeValue : undefined,
        entitlements,
        featureKey: 'profile.sync.managed'
      });

      if (accessError) {
        errorResponse(res, 403, accessError);
        return;
      }

      const workspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const document = profileLibraryStore.get(accountId, workspaceId);

      if (!document) {
        errorResponse(res, 404, {
          code: 'NOT_FOUND',
          message: 'Hosted profile library document not found for the requested scope.'
        });
        return;
      }

      json(res, 200, {
        ok: true,
        result: {
          document,
          manifest: createProfileLibrarySyncManifest({
            accountId: document.accountId,
            workspaceId: document.workspaceId,
            entitlements,
            generatedAt: document.updatedAt,
            profiles: document.profiles,
            templatePacks: document.templatePacks
          })
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/automation/jobs') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiAutomationJobRequest;

        if (!payload?.accountId) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include accountId.'
          });
          return;
        }

        const ownerError = requireOwnerAccess(authCtx, payload.accountId);
        if (ownerError) {
          errorResponse(res, ownerError.code === 'UNAUTHORIZED' ? 401 : 403, ownerError);
          return;
        }

        if (!isAutomationJobType(payload.jobType)) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include a valid jobType.'
          });
          return;
        }

        if (payload.entitlements && payload.entitlements.some((value) => !isEntitlementKey(value))) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request includes an invalid entitlement.'
          });
          return;
        }

        const featureKey = getRequiredFeatureForAutomationJob(payload.jobType);
        const accessError = requireFeatureAccess({
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          featureKey
        });

        if (accessError) {
          errorResponse(res, 403, accessError);
          return;
        }

        json(res, 200, {
          ok: true,
          result: createAutomationJobEnvelope({
            jobType: payload.jobType,
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            creditsRequested: payload.creditsRequested,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            inputSummary: payload.inputSummary
          })
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/compile/refine') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          brief?: PromptBrief;
          profile?: BrandProfile;
          hints?: RefinementHint[];
          options?: { includeGenericOutput?: boolean };
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.brief || !payload?.profile) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include both brief and profile objects.'
          });
          return;
        }

        const refineEntitlementError = requireFeatureAccess({
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          featureKey: 'local.compile'
        });
        if (refineEntitlementError) {
          errorResponse(res, 403, refineEntitlementError);
          return;
        }

        const hints: RefinementHint[] = Array.isArray(payload.hints) ? payload.hints : [];
        const result = refinePromptBundle(payload.brief, payload.profile, { hints });
        const hasErrors = result.diagnostics.some((d) => d.level === 'error');

        if (hasErrors) {
          errorResponse(res, 422, {
            code: 'VALIDATION_ERROR',
            message: 'Refined compilation failed validation checks.'
          });
          return;
        }

        json(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/compile/auto') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          prompt?: string;
          autoRefine?: boolean;
          targets?: string[];
          profileOverride?: Partial<BrandProfile>;
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.prompt || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include a non-empty "prompt" string.'
          });
          return;
        }

        const autoEntitlementError = requireFeatureAccess({
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          featureKey: 'local.compile'
        });
        if (autoEntitlementError) {
          errorResponse(res, 403, autoEntitlementError);
          return;
        }

        const result = autoCompile({
          prompt: payload.prompt.trim(),
          autoRefine: Boolean(payload.autoRefine),
          targets: Array.isArray(payload.targets) ? (payload.targets as never) : undefined,
          profileOverride: payload.profileOverride
        });

        json(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/workflows/run') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          recipe?: WorkflowRecipe;
          brief?: PromptBrief;
          profile?: BrandProfile;
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.recipe || !payload?.brief || !payload?.profile) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Request must include recipe, brief, and profile.'
          });
          return;
        }

        // Enforce workflow.recipes entitlement when operating in hosted mode.
        if (payload.mode === 'hosted') {
          const workflowEntitlementError = requireFeatureAccess({
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements,
            featureKey: 'workflow.recipes'
          });
          if (workflowEntitlementError) {
            errorResponse(res, 403, workflowEntitlementError);
            return;
          }
        }

        if (!Array.isArray(payload.recipe.steps) || payload.recipe.steps.length === 0) {
          errorResponse(res, 400, {
            code: 'BAD_REQUEST',
            message: 'Workflow recipe must include at least one step.'
          });
          return;
        }

        const result = executeWorkflowRecipe(payload.recipe, payload.brief, payload.profile);
        json(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 14 — Provider Execution Bridge
    // POST /execute
    // -------------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/execute') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          content?: string;
          target?: string;
          bundleId?: string;
          profileId?: string;
          provider?: ProviderTarget;
          maxTokens?: number;
          temperature?: number;
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.content || typeof payload.content !== 'string' || !payload.content.trim()) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a non-empty "content" string.' });
          return;
        }
        if (!payload.bundleId || typeof payload.bundleId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "bundleId".' });
          return;
        }
        if (!payload.profileId || typeof payload.profileId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "profileId".' });
          return;
        }
        if (!payload.provider || typeof payload.provider !== 'object') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a "provider" object.' });
          return;
        }

        // Schema-level validation of the execution request shape.
        const execValidation = validateExecutionRequest({
          content: payload.content,
          target: payload.target ?? 'generic',
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          provider: payload.provider,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature
        });
        if (!execValidation.valid) {
          errorResponse(res, 400, {
            code: 'VALIDATION_ERROR',
            message: `Invalid execution request: ${execValidation.errors.join('; ')}`
          });
          return;
        }

        const isDryRun = payload.provider.type === 'dry-run';

        // Live execution requires compute.batch entitlement.
        if (!isDryRun) {
          const execEntitlementError = requireFeatureAccess({
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements,
            featureKey: 'compute.batch'
          });
          if (execEntitlementError) {
            errorResponse(res, 403, execEntitlementError);
            return;
          }
        }

        const request: ExecutionRequest = {
          content: payload.content.trim(),
          target: (payload.target ?? 'generic') as ExecutionRequest['target'],
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          provider: payload.provider,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature
        };

        const result = await executeCompiledOutput(request);
        json(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 15 — Feedback Scoring Loop
    // POST /feedback
    // GET  /feedback?profileId=<id>
    // GET  /feedback/aggregate?profileId=<id>
    // -------------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/feedback') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as CreateFeedbackInput & {
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.bundleId || typeof payload.bundleId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "bundleId".' });
          return;
        }
        if (!payload.profileId || typeof payload.profileId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "profileId".' });
          return;
        }
        if (typeof payload.score !== 'number') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a numeric "score" (1-5).' });
          return;
        }

        // Schema-level validation for the feedback record shape.
        // The POST body uses CreateFeedbackInput which maps to FeedbackRecord minus server-set fields.
        // We validate the fields that must be present and correct before creating the record.
        const feedbackValidation = validateFeedbackInput({
          feedbackId: 'pending',        // placeholder — server assigns final id
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          target: payload.target ?? 'generic',
          score: payload.score,
          notes: payload.notes,
          acceptedAt: payload.acceptedAt,
          createdAt: payload.createdAt ?? new Date().toISOString()
        });
        if (!feedbackValidation.valid) {
          errorResponse(res, 400, {
            code: 'VALIDATION_ERROR',
            message: `Invalid feedback input: ${feedbackValidation.errors.join('; ')}`
          });
          return;
        }

        let record;
        try {
          record = createFeedbackRecord({
            bundleId: payload.bundleId,
            profileId: payload.profileId,
            target: (payload.target ?? 'generic') as CreateFeedbackInput['target'],
            score: payload.score,
            notes: payload.notes,
            acceptedAt: payload.acceptedAt,
            createdAt: payload.createdAt
          });
        } catch (err) {
          errorResponse(res, 400, { code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : 'Invalid feedback data.' });
          return;
        }

        const saved = feedbackStore.save(record);
        json(res, 201, { ok: true, result: saved });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/feedback') {
      const profileId = url.searchParams.get('profileId');
      const bundleId = url.searchParams.get('bundleId');
      if (!profileId && !bundleId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query must include profileId or bundleId.' });
        return;
      }
      const records = profileId
        ? feedbackStore.getByProfile(profileId)
        : feedbackStore.getByBundle(bundleId!);
      json(res, 200, { ok: true, result: { records } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/feedback/aggregate') {
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query must include profileId.' });
        return;
      }
      json(res, 200, { ok: true, result: feedbackStore.getAggregate(profileId) });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 16 — Publishing Automation
    // POST /publish/jobs
    // GET  /publish/jobs/:jobId
    // -------------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/publish/jobs') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          jobId?: string;
          bundleId?: string;
          profileId?: string;
          target?: PublishTarget;
          publishPayload?: unknown;
          createdAt?: string;
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.bundleId || typeof payload.bundleId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "bundleId".' });
          return;
        }
        if (!payload.profileId || typeof payload.profileId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "profileId".' });
          return;
        }
        if (!payload.target || typeof payload.target.id !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a valid "target" with an id.' });
          return;
        }

        const isDryRunPublish = payload.target.kind === 'dry-run';
        if (!isDryRunPublish) {
          const publishAccessError = requireFeatureAccess({
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements,
            featureKey: 'workspace.shared'
          });
          if (publishAccessError) {
            errorResponse(res, 403, publishAccessError);
            return;
          }
        }

        const createJobInput: CreatePublishJobInput = {
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          target: payload.target,
          jobId: payload.jobId,
          createdAt: payload.createdAt
        };

        const job = createPublishJob(createJobInput);
        const dispatched = await dispatchPublishJob({ job, payload: payload.publishPayload ?? {} });
        publishJobStore.save(dispatched);
        json(res, 201, { ok: true, result: dispatched });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    const publishJobIdMatch = url.pathname.match(/^\/publish\/jobs\/([^/]+)$/);
    if (publishJobIdMatch && req.method === 'GET') {
      const jobId = decodeURIComponent(publishJobIdMatch[1]);
      const job = publishJobStore.getById(jobId);
      if (!job) {
        errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Publish job not found.' });
        return;
      }
      json(res, 200, { ok: true, result: job });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 17 — Profile Marketplace
    // GET  /marketplace/listings
    // POST /marketplace/listings
    // POST /marketplace/install
    // -------------------------------------------------------------------------

    if (req.method === 'GET' && url.pathname === '/marketplace/listings') {
      const listingType = url.searchParams.get('listingType') as MarketplaceListingType | null;
      const listings = marketplaceStore.list(
        listingType ? { listingType, status: 'published' } : { status: 'published' }
      );
      json(res, 200, { ok: true, result: { listings } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/marketplace/listings') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          listingId?: string;
          listingType?: MarketplaceListingType;
          publishedBy?: string;
          displayName?: string;
          description?: string;
          tags?: string[];
          listingPayload?: unknown;
          version?: string;
          publishedAt?: string;
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
        };

        if (!payload?.publishedBy || typeof payload.publishedBy !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "publishedBy".' });
          return;
        }
        if (!payload.displayName || typeof payload.displayName !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "displayName".' });
          return;
        }
        if (!payload.listingType) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "listingType" (brand-profile or template-pack).' });
          return;
        }
        if (!payload.listingPayload || typeof payload.listingPayload !== 'object') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a "listingPayload" object.' });
          return;
        }

        if (!canPublishToMarketplace((payload.entitlements ?? []) as EntitlementKey[])) {
          errorResponse(res, 403, { code: 'FORBIDDEN', message: "Publishing to the marketplace requires the 'pro.creator' entitlement." });
          return;
        }

        let listing;
        try {
          listing = createMarketplaceListing({
            publishedBy: payload.publishedBy,
            displayName: payload.displayName,
            listingType: payload.listingType,
            description: payload.description,
            tags: payload.tags,
            payload: payload.listingPayload as CreateMarketplaceListingInput['payload'],
            version: payload.version,
            publishedAt: payload.publishedAt,
            listingId: payload.listingId
          });
        } catch (err) {
          errorResponse(res, 400, { code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : 'Invalid listing data.' });
          return;
        }

        const saved = marketplaceStore.save(listing);
        json(res, 201, { ok: true, result: saved });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/marketplace/install') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          listingId?: string;
          accountId?: string;
          workspaceId?: string;
        };

        if (!payload?.listingId || typeof payload.listingId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "listingId".' });
          return;
        }
        if (!payload.accountId || typeof payload.accountId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "accountId".' });
          return;
        }

        const listing = marketplaceStore.getById(payload.listingId);
        if (!listing) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: `Marketplace listing '${payload.listingId}' not found.` });
          return;
        }
        if (listing.status !== 'published') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Listing is not published and cannot be installed.' });
          return;
        }

        const isProfileListing = listing.listingType === 'brand-profile';
        const libraryEntry = profileLibraryStore.upsert({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          profiles: isProfileListing
            ? [listing.payload as import('@prompt-compiler/core').VersionedBrandProfile]
            : [],
          templatePacks: isProfileListing
            ? []
            : [listing.payload as import('@prompt-compiler/core').VersionedTemplatePack]
        });

        marketplaceStore.incrementInstallCount(listing.listingId);
        json(res, 200, { ok: true, result: { installed: true, libraryEntry } });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    // --- Workspace membership routes ---
    // GET  /workspaces/:workspaceId/members           — list members (viewer+)
    // POST /workspaces/:workspaceId/members           — add member (owner only)
    // PATCH /workspaces/:workspaceId/members/:accountId — update role (owner only)
    // DELETE /workspaces/:workspaceId/members/:accountId — remove member (owner only)
    const wsListMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/members$/);
    const wsMemberMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/members\/([^/]+)$/);

    if (wsListMatch && req.method === 'GET') {
      const workspaceId = decodeURIComponent(wsListMatch[1]);
      const roleErr = requireWorkspaceRole(authCtx, workspaceMemberStore, workspaceId, 'viewer');
      if (roleErr) {
        errorResponse(res, roleErr.code === 'UNAUTHORIZED' ? 401 : 403, roleErr);
        return;
      }
      json(res, 200, { ok: true, result: { members: workspaceMemberStore.listMembers(workspaceId) } });
      return;
    }

    if (wsListMatch && req.method === 'POST') {
      try {
        const workspaceId = decodeURIComponent(wsListMatch[1]);
        const roleErr = requireWorkspaceRole(authCtx, workspaceMemberStore, workspaceId, 'owner');
        if (roleErr) {
          errorResponse(res, roleErr.code === 'UNAUTHORIZED' ? 401 : 403, roleErr);
          return;
        }

        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { accountId?: string; role?: string };

        if (!payload?.accountId || typeof payload.accountId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include accountId.' });
          return;
        }

        if (!isWorkspaceRole(payload.role)) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a valid role (owner, editor, viewer).' });
          return;
        }

        const member = workspaceMemberStore.addMember(workspaceId, payload.accountId, payload.role);
        json(res, 201, { ok: true, result: { member } });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (wsMemberMatch && req.method === 'PATCH') {
      try {
        const workspaceId = decodeURIComponent(wsMemberMatch[1]);
        const targetAccountId = decodeURIComponent(wsMemberMatch[2]);
        const roleErr = requireWorkspaceRole(authCtx, workspaceMemberStore, workspaceId, 'owner');
        if (roleErr) {
          errorResponse(res, roleErr.code === 'UNAUTHORIZED' ? 401 : 403, roleErr);
          return;
        }

        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { role?: string };

        if (!isWorkspaceRole(payload.role)) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include a valid role (owner, editor, viewer).' });
          return;
        }

        const updated = workspaceMemberStore.updateRole(workspaceId, targetAccountId, payload.role);
        if (!updated) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Member not found in workspace.' });
          return;
        }

        json(res, 200, { ok: true, result: { member: updated } });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        errorResponse(res, 500, { code: 'SERVER_ERROR', message });
      }
      return;
    }

    if (wsMemberMatch && req.method === 'DELETE') {
      const workspaceId = decodeURIComponent(wsMemberMatch[1]);
      const targetAccountId = decodeURIComponent(wsMemberMatch[2]);
      const roleErr = requireWorkspaceRole(authCtx, workspaceMemberStore, workspaceId, 'owner');
      if (roleErr) {
        errorResponse(res, roleErr.code === 'UNAUTHORIZED' ? 401 : 403, roleErr);
        return;
      }

      const removed = workspaceMemberStore.removeMember(workspaceId, targetAccountId);
      if (!removed) {
        errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Member not found in workspace.' });
        return;
      }

      json(res, 200, { ok: true, result: { removed: true } });
      return;
    }

    errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Route not found.' });
  });
}

if (require.main === module) {
  const storeType = process.env['PROFILE_STORE_TYPE'] ?? 'auto';
  const storeDir = process.env['PROFILE_STORE_DIR'];
  const sqlitePath = process.env['PROFILE_STORE_SQLITE'];

  let store: ReturnType<typeof createInMemoryHostedProfileLibraryStore>;
  let storageMode: string;

  if (storeType === 'sqlite' || sqlitePath) {
    // Lazy import to avoid the experimental warning unless SQLite is selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteHostedProfileLibraryStore } = require('./sqliteProfileLibraryStore') as typeof import('./sqliteProfileLibraryStore');
    const dbPath = sqlitePath ?? 'profile-library.db';
    store = createSqliteHostedProfileLibraryStore(dbPath);
    storageMode = `sqlite (${dbPath})`;
  } else if (storeDir) {
    store = createFileHostedProfileLibraryStore(storeDir);
    storageMode = `file (${storeDir})`;
  } else {
    store = createInMemoryHostedProfileLibraryStore();
    storageMode = 'in-memory';
  }

  const server = createServer({ profileLibraryStore: store });
  server.listen(port, () => {
    console.log(`Prompt Compiler API listening on http://localhost:${port} [storage: ${storageMode}]`);
  });
}

