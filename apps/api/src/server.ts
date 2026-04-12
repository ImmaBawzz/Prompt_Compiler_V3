import http, { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildHostedSessionBootstrap,
  compilePromptBundle,
  createAutomationJobEnvelope,
  createProfileLibrarySyncManifest,
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
  PromptBrief,
  resolveEntitlements,
  TemplatePack
} from '@prompt-compiler/core';
import { createInMemoryHostedProfileLibraryStore, HostedProfileLibraryStore } from './profileLibraryStore';

const port = Number(process.env.PORT || 8787);

interface ApiCompileRequest {
  brief?: PromptBrief;
  profile?: BrandProfile;
  options?: { includeGenericOutput?: boolean };
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
  createdAt?: string;
  updatedAt?: string;
  inputSummary?: Record<string, string | number | boolean>;
}

interface ApiError {
  code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVER_ERROR';
  message: string;
}

interface ServerOptions {
  profileLibraryStore?: HostedProfileLibraryStore;
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

  return http.createServer(async (req, res) => {
    const url = requestUrl(req);

    if (!url) {
      errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Missing request URL.' });
      return;
    }

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

    errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Route not found.' });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`Prompt Compiler API listening on http://localhost:${port}`);
  });
}
