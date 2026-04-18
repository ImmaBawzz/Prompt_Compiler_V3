import { randomUUID } from 'node:crypto';
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
  // Phase 21
  addBundleReviewComment,
  addBundleReviewDecision,
  BundleReviewStore,
  canPublishReviewedBundle,
  createBundleReview,
  createInMemoryBundleReviewStore,
  markBundlePublished,
  submitBundleReview,
  // Phase 17
  createMarketplaceListing,
  canPublishToMarketplace,
  createInMemoryMarketplaceStore,
  MarketplaceStore,
  CreateMarketplaceListingInput,
  MarketplaceListingType,
  // Phase 22
  buildUsageQuotaSnapshot,
  createUsageMeteringEvent,
  createInMemoryUsageLedgerStore,
  resolveUsageQuotaPlan,
  signWebhookPayload,
  USAGE_DOMAIN_QUOTA_LIMITS,
  UsageLedgerStore,
  UsageMeteringDomain,
  UsageMeteringEventFilter
} from '@prompt-compiler/core';
import {
  BillingAccountStore,
  BillingSubscriptionStatus,
  createInMemoryBillingAccountStore
} from './billingAccountStore';
import type { LearningAwareFeedbackStore } from './sqliteFeedbackStore';
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

interface ApiExecuteRequestBody {
  content?: string;
  target?: string;
  bundleId?: string;
  profileId?: string;
  provider?: ProviderTarget;
  maxTokens?: number;
  temperature?: number;
  policy?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  };
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
  /** Optional: feature key for entitlement errors, allows clients to generate UX hints. */
  featureKey?: string;
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
  /** Bundle review store for Phase 21 review/approval lifecycle. */
  bundleReviewStore?: BundleReviewStore;
  /** Usage ledger store for Phase 22 commercial metering. */
  usageLedgerStore?: UsageLedgerStore;
  /** Billing account store for Phase 27 payment integration scaffolding. */
  billingAccountStore?: BillingAccountStore;
  /** Shared secret used to verify Stripe webhook signatures in local scaffolding. */
  stripeWebhookSecret?: string;
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

function authErrorStatus(error: { code: 'UNAUTHORIZED' | 'FORBIDDEN' }): number {
  return error.code === 'UNAUTHORIZED' ? 401 : 403;
}

function stripeWebhookSecret(options: ServerOptions): string {
  return options.stripeWebhookSecret ?? process.env['STRIPE_WEBHOOK_SECRET'] ?? 'stripe-dev-secret';
}

function buildStripeCheckoutUrl(sessionId: string): string {
  return `https://checkout.stripe.com/pay/${sessionId}`;
}

function buildStripePortalUrl(customerId: string): string {
  return `https://billing.stripe.com/p/session/${customerId}`;
}

function verifyStripeSignature(body: string, providedSignature: string | null, secret: string): boolean {
  if (!providedSignature) {
    return false;
  }
  const expected = signWebhookPayload(body, secret);
  return providedSignature === expected;
}

function mapStripeSubscriptionStatus(status: string | undefined): BillingSubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default:
      return 'checkout_pending';
  }
}

function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

interface BootstrapLearningBlock {
  profileId: string;
  feedbackCount: number;
  lastDerivedAt: string | null;
  currentWeights: {
    clarity: number;
    specificity: number;
    styleConsistency: number;
    targetReadiness: number;
  };
  pendingCandidates: number;
  divergenceAlert: boolean;
}

function resolveBootstrapLearningBlock(feedbackStore: FeedbackStore, profileId: string): BootstrapLearningBlock {
  const learningStore = feedbackStore as Partial<LearningAwareFeedbackStore>;
  if (typeof learningStore.getLearningSummary === 'function') {
    const summary = learningStore.getLearningSummary(profileId);
    return {
      profileId: summary.profileId,
      feedbackCount: summary.feedbackCount,
      lastDerivedAt: summary.lastDerivedAt,
      currentWeights: summary.currentWeights,
      pendingCandidates: summary.pendingCandidates,
      divergenceAlert: summary.divergenceAlert
    };
  }

  const records = feedbackStore.getByProfile(profileId);
  const aggregate = feedbackStore.getAggregate(profileId);
  return {
    profileId,
    feedbackCount: records.length,
    lastDerivedAt: null,
    currentWeights: aggregate.derivedWeights,
    pendingCandidates: 0,
    divergenceAlert: false
  };
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
      message: `Feature '${input.featureKey}' is not enabled for the current hosted session.`,
      featureKey: input.featureKey
    };
  }

  return null;
}

function requireWithinDomainQuota(input: {
  usageLedgerStore: UsageLedgerStore;
  accountId: string;
  domain: UsageMeteringDomain;
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: EntitlementKey[];
  unitsToConsume?: number;
}): ApiError | null {
  const mode = input.mode ?? 'hosted';
  if (mode !== 'hosted') {
    return null;
  }

  const quotaPlan = resolveUsageQuotaPlan(input.plan, input.entitlements);
  const limit = USAGE_DOMAIN_QUOTA_LIMITS[input.domain][quotaPlan];
  const units = Number(input.unitsToConsume ?? 1);
  if (!Number.isFinite(units) || units <= 0) {
    return {
      code: 'BAD_REQUEST',
      message: 'Invalid quota units requested.'
    };
  }

  if (limit < 0) {
    return null;
  }

  const summary = input.usageLedgerStore.summarizeAccount(input.accountId, { domain: input.domain, unit: 'request' });
  const used = summary.totalsByDomain[input.domain] ?? 0;
  if (used + units > limit) {
    return {
      code: 'FORBIDDEN',
      message: `Quota exceeded for '${input.domain}' on plan '${quotaPlan}'. Used ${used}/${limit} request units.`
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
  const bundleReviewStore = options.bundleReviewStore ?? createInMemoryBundleReviewStore();
  const usageLedgerStore = options.usageLedgerStore ?? createInMemoryUsageLedgerStore();
  const billingAccountStore = options.billingAccountStore ?? createInMemoryBillingAccountStore();

  // P29-5: Track processed Stripe webhook event IDs for idempotency (in-memory, sufficient for process lifetime).
  const processedStripeEventIds = new Set<string>();

  return http.createServer(async (req, res) => {

  const url = requestUrl(req);




    // Move handler after authCtx is defined
    const authCtx = resolveAuthContext(req, options.authConfig ?? {});

    // Full logic for POST /admin/learning/batch-recompute
    if (req.method === 'POST' && url && url.pathname === '/admin/learning/batch-recompute') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw);
        const accountId = payload.accountId;
        // 400 if missing accountId
        if (!accountId || typeof accountId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Missing or invalid accountId.' });
          return;
        }
        // 403 if not owner
        const ownerError = requireOwnerAccess(authCtx, accountId);
        if (ownerError) {
          errorResponse(res, authErrorStatus(ownerError), ownerError);
          return;
        }
        // 501 if feedbackStore is not LearningAwareFeedbackStore
        const learningStore = feedbackStore as unknown as import('./sqliteFeedbackStore').LearningAwareFeedbackStore;
        if (typeof learningStore.getLearningSummary !== 'function') {
          errorResponse(res, 501, { code: 'SERVER_ERROR', message: 'Learning store not available.' });
          return;
        }
        // Gather all profiles for this account
        const docs = profileLibraryStore.list(accountId);
        const profiles = docs.flatMap(doc => doc.profiles.map(p => ({ ...p, workspaceId: doc.workspaceId })));
        const recomputed: string[] = [];
        const skipped: Array<{ profileId: string; reason: string }> = [];
        const computedAt = new Date().toISOString();
        for (const profile of profiles) {
          const profileId = profile.id;
          const learningMode = profile.learningMode || 'manual';
          if (learningMode === 'manual' || learningMode === 'manual-review') {
            skipped.push({ profileId, reason: 'manual_mode' });
            continue;
          }
          let summary: import('./sqliteFeedbackStore').LearningSummary;
          try {
            summary = learningStore.getLearningSummary(profileId);
          } catch {
            skipped.push({ profileId, reason: 'error' });
            continue;
          }
          if (summary.divergenceAlert) {
            skipped.push({ profileId, reason: 'divergence_alert' });
            continue;
          }
          if (summary.feedbackCount < 5) {
            skipped.push({ profileId, reason: 'insufficient_feedback' });
            continue;
          }
          // Recompute (triggers derivation)
          try {
            learningStore.getAggregate(profileId);
            recomputed.push(profileId);
          } catch {
            skipped.push({ profileId, reason: 'error' });
          }
        }
        // Meter recomputes if in hosted mode and usageLedgerStore is present
        if (payload.mode === 'hosted' && usageLedgerStore && recomputed.length > 0 && authCtx.accountId) {
          usageLedgerStore.append(
            createUsageMeteringEvent({
              accountId: authCtx.accountId,
              domain: 'learning',
              action: 'batch-recompute',
              unit: 'request',
              unitsConsumed: recomputed.length,
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements,
              occurredAt: computedAt
            })
          );
        }
        json(res, 200, {
          ok: true,
          result: {
            recomputed,
            skipped,
            summary: {
              total: profiles.length,
              recomputed: recomputed.length,
              skipped: skipped.length
            },
            computedAt
          }
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
          return;
        }
        errorResponse(res, 500, { code: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
      }
      return;
    }


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

      // Phase 22 — attach usage summary when accountId is available so extension
      // and other surfaces can surface commercial state in a single call.
      const bootstrapAccountId = query.value?.accountId;
      const billingAccount = bootstrapAccountId
        ? billingAccountStore.get(bootstrapAccountId)
        : undefined;
      const bootstrapPlan = query.value?.plan ?? billingAccount?.plan;
      const bootstrapCreditBalance = query.value?.creditBalance ?? billingAccount?.creditBalance ?? null;
      const usageSummary = bootstrapAccountId
        ? usageLedgerStore.summarizeAccount(bootstrapAccountId)
        : undefined;
      const usageQuotas = usageSummary
        ? buildUsageQuotaSnapshot(usageSummary, bootstrapPlan, query.value?.grantedEntitlements)
        : undefined;
      const learningProfileId = url.searchParams.get('profileId') ?? undefined;

      const bootstrap = buildHostedSessionBootstrap({
        ...query.value,
        plan: bootstrapPlan,
        creditBalance: bootstrapCreditBalance,
        usageSummary,
        usageQuotas
      });

      const result = learningProfileId
        ? {
            ...bootstrap,
            learning: resolveBootstrapLearningBlock(feedbackStore, learningProfileId)
          }
        : bootstrap;

      json(res, 200, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/billing/checkout') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          accountId?: string;
          plan?: 'free' | 'pro' | 'studio';
          successUrl?: string;
          cancelUrl?: string;
        };

        if (!payload?.accountId || typeof payload.accountId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "accountId".' });
          return;
        }
        if (payload.plan !== 'pro' && payload.plan !== 'studio') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'plan must be pro or studio.' });
          return;
        }

        const ownerError = requireOwnerAccess(authCtx, payload.accountId);
        if (ownerError) {
          errorResponse(res, authErrorStatus(ownerError), ownerError);
          return;
        }

        const sessionId = `cs_test_${randomUUID().replace(/-/g, '')}`;
        const checkoutUrl = buildStripeCheckoutUrl(sessionId);
        const account = billingAccountStore.upsert({
          accountId: payload.accountId,
          pendingPlan: payload.plan,
          stripeCheckoutSessionId: sessionId,
          subscriptionStatus: 'checkout_pending',
          portalEnabled: false
        });

        json(res, 201, {
          ok: true,
          result: {
            provider: 'stripe',
            accountId: payload.accountId,
            targetPlan: payload.plan,
            sessionId,
            checkoutUrl,
            successUrl: payload.successUrl,
            cancelUrl: payload.cancelUrl,
            status: account.subscriptionStatus
          }
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

    if (req.method === 'POST' && url.pathname === '/billing/portal') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          accountId?: string;
          returnUrl?: string;
        };

        if (!payload?.accountId || typeof payload.accountId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "accountId".' });
          return;
        }

        const ownerError = requireOwnerAccess(authCtx, payload.accountId);
        if (ownerError) {
          errorResponse(res, authErrorStatus(ownerError), ownerError);
          return;
        }

        const account = billingAccountStore.get(payload.accountId);
        if (!account?.stripeCustomerId) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: 'No billing customer exists for this account yet.' });
          return;
        }

        json(res, 200, {
          ok: true,
          result: {
            provider: 'stripe',
            accountId: payload.accountId,
            portalUrl: buildStripePortalUrl(account.stripeCustomerId),
            returnUrl: payload.returnUrl
          }
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

    if (req.method === 'POST' && url.pathname === '/billing/webhooks/stripe') {
      try {
        const raw = await readBody(req);
        const signatureHeader = req.headers['stripe-signature'];
        const signature = typeof signatureHeader === 'string' ? signatureHeader : null;
        if (!verifyStripeSignature(raw, signature, stripeWebhookSecret(options))) {
          errorResponse(res, 401, { code: 'UNAUTHORIZED', message: 'Invalid Stripe webhook signature.' });
          return;
        }

        const payload = JSON.parse(raw) as {
          id?: string;
          type?: string;
          data?: {
            object?: {
              id?: string;
              customer?: string;
              subscription?: string;
              status?: string;
              metadata?: {
                accountId?: string;
                targetPlan?: 'free' | 'pro' | 'studio';
              };
              creditBalance?: number;
            };
          };
        };

        if (!payload?.type || !payload.data?.object) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Stripe webhook must include type and data.object.' });
          return;
        }

        // P29-5: Idempotency guard — silently ack duplicate webhook event IDs.
        if (payload.id) {
          if (processedStripeEventIds.has(payload.id)) {
            json(res, 200, { ok: true, result: { received: true, alreadyProcessed: true, eventId: payload.id } });
            return;
          }
          processedStripeEventIds.add(payload.id);
        }

        const object = payload.data.object;
        const targetAccountId = object.metadata?.accountId ?? (object.customer ? billingAccountStore.getByStripeCustomerId(object.customer)?.accountId : undefined);
        if (!targetAccountId) {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Stripe webhook does not map to a known accountId.' });
          return;
        }

        const existing = billingAccountStore.get(targetAccountId);
        const targetPlan = object.metadata?.targetPlan ?? existing?.pendingPlan ?? existing?.plan ?? 'free';

        switch (payload.type) {
          case 'checkout.session.completed': {
            billingAccountStore.upsert({
              accountId: targetAccountId,
              stripeCustomerId: object.customer,
              stripeCheckoutSessionId: object.id,
              pendingPlan: targetPlan,
              subscriptionStatus: 'checkout_pending'
            });
            break;
          }
          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            const mappedStatus = mapStripeSubscriptionStatus(object.status);
            billingAccountStore.upsert({
              accountId: targetAccountId,
              plan: mappedStatus === 'active' ? targetPlan : existing?.plan ?? 'free',
              pendingPlan: mappedStatus === 'active' ? undefined : targetPlan,
              stripeCustomerId: object.customer,
              stripeSubscriptionId: object.id ?? object.subscription,
              subscriptionStatus: mappedStatus,
              portalEnabled: Boolean(object.customer),
              creditBalance: typeof object.creditBalance === 'number' ? object.creditBalance : existing?.creditBalance
            });
            break;
          }
          case 'customer.subscription.deleted': {
            billingAccountStore.upsert({
              accountId: targetAccountId,
              plan: 'free',
              pendingPlan: undefined,
              stripeCustomerId: object.customer,
              stripeSubscriptionId: object.id ?? object.subscription,
              subscriptionStatus: 'canceled',
              portalEnabled: Boolean(object.customer)
            });
            break;
          }
          case 'invoice.payment_failed': {
            billingAccountStore.upsert({
              accountId: targetAccountId,
              stripeCustomerId: object.customer,
              subscriptionStatus: 'past_due'
            });
            break;
          }
          default:
            break;
        }

        json(res, 200, {
          ok: true,
          result: {
            received: true,
            eventType: payload.type,
            accountId: targetAccountId,
            account: billingAccountStore.get(targetAccountId)
          }
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

    if (req.method === 'POST' && url.pathname === '/execute/stream') {
      let streamStarted = false;
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiExecuteRequestBody;

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

        const execValidation = validateExecutionRequest({
          content: payload.content,
          target: payload.target ?? 'generic',
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          provider: payload.provider,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
          policy: payload.policy
        });
        if (!execValidation.valid) {
          errorResponse(res, 400, {
            code: 'VALIDATION_ERROR',
            message: `Invalid execution request: ${execValidation.errors.join('; ')}`
          });
          return;
        }

        const isDryRun = payload.provider.type === 'dry-run';
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

          if (authCtx.accountId) {
            const execQuotaError = requireWithinDomainQuota({
              usageLedgerStore,
              accountId: authCtx.accountId,
              domain: 'execute',
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements,
              unitsToConsume: 1
            });
            if (execQuotaError) {
              errorResponse(res, execQuotaError.code === 'BAD_REQUEST' ? 400 : 403, execQuotaError);
              return;
            }
          }
        }

        const request: ExecutionRequest = {
          content: payload.content.trim(),
          target: (payload.target ?? 'generic') as ExecutionRequest['target'],
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          provider: payload.provider,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
          policy: payload.policy
        };

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        streamStarted = true;

        writeSseEvent(res, 'started', {
          bundleId: request.bundleId,
          profileId: request.profileId,
          provider: request.provider.type,
          isDryRun,
          startedAt: new Date().toISOString()
        });

        writeSseEvent(res, 'progress', {
          stage: 'dispatching-provider-request'
        });

        const result = await executeCompiledOutput(request);

        if (!isDryRun && authCtx.accountId) {
          usageLedgerStore.append(
            createUsageMeteringEvent({
              accountId: authCtx.accountId,
              workspaceId: authCtx.workspaceId ?? undefined,
              domain: 'execute',
              action: 'execute-compiled-output',
              bundleId: payload.bundleId,
              profileId: payload.profileId,
              unit: 'request',
              unitsConsumed: 1,
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements
            })
          );

          writeSseEvent(res, 'progress', {
            stage: 'metered-usage-recorded'
          });
        }

        // P29-3: Unified provider telemetry on completed event.
        const resultObj = result as unknown as Record<string, unknown>;
        const telemetry = {
          provider: request.provider.type,
          isDryRun,
          latencyMs: typeof resultObj['latencyMs'] === 'number' ? resultObj['latencyMs'] : null,
          estimatedTokens: typeof resultObj['estimatedTokens'] === 'number' ? resultObj['estimatedTokens'] : null,
          completedAt: new Date().toISOString()
        };
        writeSseEvent(res, 'completed', { result, telemetry });
        res.end();
      } catch (error) {
        if (!streamStarted) {
          if (error instanceof SyntaxError) {
            errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body.' });
            return;
          }
          const message = error instanceof Error ? error.message : 'Unknown error';
          errorResponse(res, 500, { code: 'SERVER_ERROR', message });
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        writeSseEvent(res, 'error', { code: 'SERVER_ERROR', message });
        res.end();
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/execute') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as ApiExecuteRequestBody;

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
          temperature: payload.temperature,
          policy: payload.policy
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

          if (authCtx.accountId) {
            const execQuotaError = requireWithinDomainQuota({
              usageLedgerStore,
              accountId: authCtx.accountId,
              domain: 'execute',
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements,
              unitsToConsume: 1
            });
            if (execQuotaError) {
              errorResponse(res, execQuotaError.code === 'BAD_REQUEST' ? 400 : 403, execQuotaError);
              return;
            }
          }
        }

        const request: ExecutionRequest = {
          content: payload.content.trim(),
          target: (payload.target ?? 'generic') as ExecutionRequest['target'],
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          provider: payload.provider,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
          policy: payload.policy
        };

        const result = await executeCompiledOutput(request);

        // Phase 22 — record usage event for live execution only.
        if (!isDryRun && authCtx.accountId) {
          usageLedgerStore.append(
            createUsageMeteringEvent({
              accountId: authCtx.accountId,
              workspaceId: authCtx.workspaceId ?? undefined,
              domain: 'execute',
              action: 'execute-compiled-output',
              bundleId: payload.bundleId,
              profileId: payload.profileId,
              unit: 'request',
              unitsConsumed: 1,
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements
            })
          );
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

        // P30-4: Learning quota enforcement — block free-plan accounts once limit is reached.
        const feedbackAccountId = authCtx.accountId ?? (req.headers['x-account-id'] as string | undefined);
        if (feedbackAccountId && payload.mode === 'hosted') {
          const learningQuotaError = requireWithinDomainQuota({
            usageLedgerStore,
            accountId: feedbackAccountId,
            domain: 'learning',
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements
          });
          if (learningQuotaError) {
            errorResponse(res, 403, learningQuotaError);
            return;
          }
        }

        const saved = feedbackStore.save(record);

        // P30-4: Meter a learning/shadow-evaluation event after successful save.
        if (feedbackAccountId) {
          const learningEvent = createUsageMeteringEvent({
            accountId: feedbackAccountId,
            domain: 'learning',
            action: 'shadow-evaluation',
            unitsConsumed: 1,
            unit: 'request',
            bundleId: record.bundleId,
            profileId: record.profileId,
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements,
            occurredAt: record.createdAt
          });
          usageLedgerStore.append(learningEvent);
        }

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

    // P30-5: GET /learning/timeline — return learning summary for a profile.
    if (req.method === 'GET' && url.pathname === '/learning/timeline') {
      const profileId = url.searchParams.get('profileId');
      if (!profileId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query must include profileId.' });
        return;
      }
      const learningStore = feedbackStore as unknown as import('./sqliteFeedbackStore').LearningAwareFeedbackStore;
      if (typeof learningStore.getLearningSummary !== 'function') {
        errorResponse(res, 501, { code: 'SERVER_ERROR', message: 'Learning timeline not available with the current feedback store.' });
        return;
      }
      json(res, 200, { ok: true, result: learningStore.getLearningSummary(profileId) });
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
    // Phase 21 — Review, Approval, and Team Workflow Layer
    // POST /reviews/bundles
    // GET  /reviews/bundles/:bundleId?workspaceId=<id>
    // POST /reviews/bundles/:bundleId/submit
    // POST /reviews/bundles/:bundleId/comments
    // POST /reviews/bundles/:bundleId/decisions
    // -------------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/reviews/bundles') {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          bundleId?: string;
          workspaceId?: string;
          requiredApprovals?: number;
        };

        if (!payload?.bundleId || typeof payload.bundleId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "bundleId".' });
          return;
        }
        if (!payload.workspaceId || typeof payload.workspaceId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "workspaceId".' });
          return;
        }

        const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, payload.workspaceId, 'editor');
        if (roleError) {
          errorResponse(res, authErrorStatus(roleError), roleError);
          return;
        }

        const existing = bundleReviewStore.get(payload.bundleId, payload.workspaceId);
        if (existing) {
          json(res, 200, { ok: true, result: existing });
          return;
        }

        const review = createBundleReview({
          bundleId: payload.bundleId,
          workspaceId: payload.workspaceId,
          createdBy: authCtx.accountId!,
          requiredApprovals: payload.requiredApprovals
        });
        bundleReviewStore.save(review);
        json(res, 201, { ok: true, result: review });
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

    const bundleReviewMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)$/);
    if (bundleReviewMatch && req.method === 'GET') {
      const bundleId = decodeURIComponent(bundleReviewMatch[1]);
      const workspaceId = url.searchParams.get('workspaceId');
      if (!workspaceId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query must include workspaceId.' });
        return;
      }

      const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, workspaceId, 'viewer');
      if (roleError) {
        errorResponse(res, authErrorStatus(roleError), roleError);
        return;
      }

      const review = bundleReviewStore.get(bundleId, workspaceId);
      if (!review) {
        errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Bundle review not found.' });
        return;
      }

      json(res, 200, { ok: true, result: review });
      return;
    }

    const submitReviewMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/submit$/);
    if (submitReviewMatch && req.method === 'POST') {
      try {
        const bundleId = decodeURIComponent(submitReviewMatch[1]);
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { workspaceId?: string };

        if (!payload?.workspaceId || typeof payload.workspaceId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "workspaceId".' });
          return;
        }

        const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, payload.workspaceId, 'editor');
        if (roleError) {
          errorResponse(res, authErrorStatus(roleError), roleError);
          return;
        }

        const review = bundleReviewStore.get(bundleId, payload.workspaceId);
        if (!review) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Bundle review not found.' });
          return;
        }

        json(res, 200, { ok: true, result: bundleReviewStore.save(submitBundleReview(review)) });
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

    const reviewCommentsMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/comments$/);
    if (reviewCommentsMatch && req.method === 'POST') {
      try {
        const bundleId = decodeURIComponent(reviewCommentsMatch[1]);
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { workspaceId?: string; message?: string };

        if (!payload?.workspaceId || typeof payload.workspaceId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "workspaceId".' });
          return;
        }
        if (!payload.message || typeof payload.message !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "message".' });
          return;
        }

        const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, payload.workspaceId, 'viewer');
        if (roleError) {
          errorResponse(res, authErrorStatus(roleError), roleError);
          return;
        }

        const review = bundleReviewStore.get(bundleId, payload.workspaceId);
        if (!review) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Bundle review not found.' });
          return;
        }

        const updated = addBundleReviewComment(review, {
          authorAccountId: authCtx.accountId!,
          message: payload.message
        });
        json(res, 201, { ok: true, result: bundleReviewStore.save(updated) });
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

    const reviewDecisionsMatch = url.pathname.match(/^\/reviews\/bundles\/([^/]+)\/decisions$/);
    if (reviewDecisionsMatch && req.method === 'POST') {
      try {
        const bundleId = decodeURIComponent(reviewDecisionsMatch[1]);
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as {
          workspaceId?: string;
          decision?: 'approve' | 'request_changes';
          comment?: string;
        };

        if (!payload?.workspaceId || typeof payload.workspaceId !== 'string') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Request must include "workspaceId".' });
          return;
        }
        if (payload.decision !== 'approve' && payload.decision !== 'request_changes') {
          errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'decision must be approve or request_changes.' });
          return;
        }

        const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, payload.workspaceId, 'editor');
        if (roleError) {
          errorResponse(res, authErrorStatus(roleError), roleError);
          return;
        }

        const review = bundleReviewStore.get(bundleId, payload.workspaceId);
        if (!review) {
          errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Bundle review not found.' });
          return;
        }

        const updated = addBundleReviewDecision(review, {
          reviewerAccountId: authCtx.accountId!,
          decision: payload.decision,
          comment: payload.comment
        });
        json(res, 200, { ok: true, result: bundleReviewStore.save(updated) });
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
          workspaceId?: string;
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
        let workspaceReview = undefined;

        if (payload.workspaceId) {
          const roleError = requireWorkspaceRole(authCtx, workspaceMemberStore, payload.workspaceId, 'editor');
          if (roleError) {
            errorResponse(res, authErrorStatus(roleError), roleError);
            return;
          }

          if (!isDryRunPublish) {
            const review = bundleReviewStore.get(payload.bundleId, payload.workspaceId);
            const member = authCtx.accountId
              ? workspaceMemberStore.getMember(payload.workspaceId, authCtx.accountId)
              : undefined;

            if (!review || !member || !canPublishReviewedBundle(review, member.role)) {
              errorResponse(res, 403, {
                code: 'FORBIDDEN',
                message: 'Workspace publish requires an approved bundle review and an editor-or-owner role.'
              });
              return;
            }

            workspaceReview = review;
          }
        }

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

          if (authCtx.accountId) {
            const publishQuotaError = requireWithinDomainQuota({
              usageLedgerStore,
              accountId: authCtx.accountId,
              domain: 'publish',
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements,
              unitsToConsume: 1
            });
            if (publishQuotaError) {
              errorResponse(res, publishQuotaError.code === 'BAD_REQUEST' ? 400 : 403, publishQuotaError);
              return;
            }
          }
        }

        const createJobInput: CreatePublishJobInput = {
          bundleId: payload.bundleId,
          profileId: payload.profileId,
          workspaceId: payload.workspaceId,
          target: payload.target,
          jobId: payload.jobId,
          createdAt: payload.createdAt
        };

        const job = createPublishJob(createJobInput);
        const dispatched = await dispatchPublishJob({ job, payload: payload.publishPayload ?? {} });
        publishJobStore.save(dispatched);

        if (workspaceReview && dispatched.status === 'delivered') {
          bundleReviewStore.save(markBundlePublished(workspaceReview));
        }

        // Phase 22 — record usage event for live publish only.
        if (!isDryRunPublish && authCtx.accountId) {
          usageLedgerStore.append(
            createUsageMeteringEvent({
              accountId: authCtx.accountId,
              workspaceId: payload.workspaceId,
              domain: 'publish',
              action: 'publish-bundle',
              bundleId: payload.bundleId,
              profileId: payload.profileId,
              unit: 'request',
              unitsConsumed: 1,
              plan: payload.plan,
              mode: payload.mode,
              entitlements: payload.entitlements
            })
          );
        }

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
          plan?: 'free' | 'pro' | 'studio';
          mode?: 'local' | 'hosted';
          entitlements?: EntitlementKey[];
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

        const installQuotaError = requireWithinDomainQuota({
          usageLedgerStore,
          accountId: payload.accountId,
          domain: 'marketplace-install',
          plan: payload.plan,
          mode: payload.mode,
          entitlements: payload.entitlements,
          unitsToConsume: 1
        });
        if (installQuotaError) {
          errorResponse(res, installQuotaError.code === 'BAD_REQUEST' ? 400 : 403, installQuotaError);
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

        // Phase 22 — record usage event for marketplace installs.
        usageLedgerStore.append(
          createUsageMeteringEvent({
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            domain: 'marketplace-install',
            action: 'install-listing',
            listingId: payload.listingId,
            unit: 'request',
            unitsConsumed: 1,
            plan: payload.plan,
            mode: payload.mode,
            entitlements: payload.entitlements
          })
        );

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

    // -------------------------------------------------------------------------
    // Phase 22 — Usage metering query routes
    // GET /usage/events?accountId=<id>&domain=<d>&from=<t>&to=<t>&unit=<u>
    // GET /usage/summary?accountId=<id>&domain=<d>&from=<t>&to=<t>&unit=<u>
    // -------------------------------------------------------------------------

    if (req.method === 'GET' && url.pathname === '/usage/events') {
      const accountId = url.searchParams.get('accountId');
      if (!accountId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query parameter "accountId" is required.' });
        return;
      }

      const authErr = requireAuth(authCtx);
      if (authErr) {
        errorResponse(res, authErrorStatus(authErr), authErr);
        return;
      }

      // Only allow an account to query its own usage events.
      if (authCtx.accountId && authCtx.accountId !== accountId) {
        errorResponse(res, 403, { code: 'FORBIDDEN', message: 'You may only query usage events for your own account.' });
        return;
      }

      const filter: UsageMeteringEventFilter = {};
      const domain = url.searchParams.get('domain');
      if (domain) {
        filter.domain = domain as UsageMeteringEventFilter['domain'];
      }
      const unit = url.searchParams.get('unit');
      if (unit) {
        filter.unit = unit as UsageMeteringEventFilter['unit'];
      }
      const from = url.searchParams.get('from');
      if (from) {
        filter.from = from;
      }
      const to = url.searchParams.get('to');
      if (to) {
        filter.to = to;
      }
      const workspaceId = url.searchParams.get('workspaceId');
      if (workspaceId) {
        filter.workspaceId = workspaceId;
      }

      const events = usageLedgerStore.listByAccount(accountId, filter);
      json(res, 200, { ok: true, result: { events } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/usage/summary') {
      const accountId = url.searchParams.get('accountId');
      if (!accountId) {
        errorResponse(res, 400, { code: 'BAD_REQUEST', message: 'Query parameter "accountId" is required.' });
        return;
      }

      const authErr = requireAuth(authCtx);
      if (authErr) {
        errorResponse(res, authErrorStatus(authErr), authErr);
        return;
      }

      // Only allow an account to query its own usage summary.
      if (authCtx.accountId && authCtx.accountId !== accountId) {
        errorResponse(res, 403, { code: 'FORBIDDEN', message: 'You may only query usage summary for your own account.' });
        return;
      }

      const filter: UsageMeteringEventFilter = {};
      const domain = url.searchParams.get('domain');
      if (domain) {
        filter.domain = domain as UsageMeteringEventFilter['domain'];
      }
      const unit = url.searchParams.get('unit');
      if (unit) {
        filter.unit = unit as UsageMeteringEventFilter['unit'];
      }
      const from = url.searchParams.get('from');
      if (from) {
        filter.from = from;
      }
      const to = url.searchParams.get('to');
      if (to) {
        filter.to = to;
      }

      const summary = usageLedgerStore.summarizeAccount(accountId, filter);
      json(res, 200, { ok: true, result: { summary } });
      return;
    }

    errorResponse(res, 404, { code: 'NOT_FOUND', message: 'Route not found.' });
  });
}

if (require.main === module) {
  const storeType = process.env['PROFILE_STORE_TYPE'] ?? 'auto';
  const storeDir = process.env['PROFILE_STORE_DIR'];
  const sqlitePath = process.env['PROFILE_STORE_SQLITE'];
  const usageStoreType = process.env['USAGE_LEDGER_STORE_TYPE'] ?? 'auto';
  const usageSqlitePath = process.env['USAGE_LEDGER_SQLITE'];
  const billingStoreType = process.env['BILLING_ACCOUNT_STORE_TYPE'] ?? 'auto';
  const billingSqlitePath = process.env['BILLING_ACCOUNT_STORE_SQLITE'];
  const feedbackStoreType = process.env['FEEDBACK_STORE_TYPE'] ?? 'memory';
  const feedbackSqlitePath = process.env['FEEDBACK_STORE_SQLITE'];

  let store: HostedProfileLibraryStore;
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

  let usageLedgerStore: UsageLedgerStore;
  let usageStorageMode: string;

  if (usageStoreType === 'sqlite' || usageSqlitePath) {
    // Lazy import to avoid the experimental warning unless SQLite is selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteUsageLedgerStore } = require('./sqliteUsageLedgerStore') as typeof import('./sqliteUsageLedgerStore');
    const dbPath = usageSqlitePath ?? 'usage-ledger.db';
    usageLedgerStore = createSqliteUsageLedgerStore(dbPath);
    usageStorageMode = `sqlite (${dbPath})`;
  } else {
    usageLedgerStore = createInMemoryUsageLedgerStore();
    usageStorageMode = 'in-memory';
  }

  let billingAccountStore: BillingAccountStore;
  let billingStorageMode: string;

  if (billingStoreType === 'sqlite' || billingSqlitePath) {
    // Lazy import to avoid the experimental warning unless SQLite is selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteBillingAccountStore } = require('./sqliteBillingAccountStore') as typeof import('./sqliteBillingAccountStore');
    const dbPath = billingSqlitePath ?? 'billing-accounts.db';
    billingAccountStore = createSqliteBillingAccountStore(dbPath);
    billingStorageMode = `sqlite (${dbPath})`;
  } else {
    billingAccountStore = createInMemoryBillingAccountStore();
    billingStorageMode = 'in-memory';
  }

  let feedbackStore: FeedbackStore;
  let feedbackStorageMode: string;

  if (feedbackStoreType === 'sqlite' || feedbackSqlitePath) {
    // Lazy import to avoid the experimental warning unless SQLite is selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteFeedbackStore } = require('./sqliteFeedbackStore') as typeof import('./sqliteFeedbackStore');
    const dbPath = feedbackSqlitePath ?? 'feedback-store.db';
    feedbackStore = createSqliteFeedbackStore(dbPath);
    feedbackStorageMode = `sqlite (${dbPath})`;
  } else {
    feedbackStore = createInMemoryFeedbackStore();
    feedbackStorageMode = 'in-memory';
  }

  const server = createServer({ profileLibraryStore: store, usageLedgerStore, billingAccountStore, feedbackStore });
  server.listen(port, () => {
    console.log(
      `Prompt Compiler API listening on http://localhost:${port} [profile storage: ${storageMode}] [usage storage: ${usageStorageMode}] [billing storage: ${billingStorageMode}] [feedback storage: ${feedbackStorageMode}]`
    );
  });
}

