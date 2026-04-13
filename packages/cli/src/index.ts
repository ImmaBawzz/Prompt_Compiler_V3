#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compilePromptBundle, createExportPlan, autoCompile, BrandProfile, PromptBrief, generateEntitlementUXMessage, HostedFeatureKey } from '@prompt-compiler/core';

type ArgValue = string | boolean;

interface CliArgs {
  briefPath: string;
  profilePath: string;
  includeGenericOutput: boolean;
  exportBundle: boolean;
  execute: boolean;
  providerConfigPath: string;
  policyTimeoutMs?: number;
  policyMaxRetries?: number;
  policyRetryDelayMs?: number;
  publish: boolean;
  publishConfigPath: string;
  installListingId?: string;
  marketplaceConfigPath: string;
  reviewConfigPath: string;
  reviewStart: boolean;
  reviewStatus: boolean;
  reviewComment?: string;
  reviewDecision?: 'approve' | 'request_changes';
  reviewBundleId?: string;
  outputPath?: string;
  showHelp: boolean;
  prompt?: string;
  autoRefine: boolean;
  stream: boolean;
}

interface ProviderExecutionConfig {
  apiBaseUrl?: string;
  provider: {
    id: string;
    type: 'dry-run' | 'openai-compatible';
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
  target?: string;
  maxTokens?: number;
  temperature?: number;
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: string[];
  policy?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  };
}

interface PublishConfig {
  apiBaseUrl?: string;
  target: {
    id: string;
    kind: 'dry-run' | 'webhook';
    url?: string;
    secret?: string;
    headers?: Record<string, string>;
  };
  publishPayload?: unknown;
  plan?: 'free' | 'pro' | 'studio';
  mode?: 'local' | 'hosted';
  entitlements?: string[];
}

interface MarketplaceConfig {
  apiBaseUrl?: string;
  accountId: string;
  workspaceId?: string;
}

interface ReviewConfig {
  apiBaseUrl?: string;
  accountId: string;
  workspaceId: string;
  requiredApprovals?: number;
}

interface CliError {
  code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'SERVER_ERROR';
  message: string;
}

interface CliResponse {
  ok: boolean;
  result?: unknown;
  error?: CliError;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8')) as T;
}

function parseArgs(argv = process.argv.slice(2)): Record<string, ArgValue> {
  const aliases = new Map<string, string>([
    ['b', 'brief'],
    ['p', 'profile'],
    ['o', 'output'],
    ['h', 'help']
  ]);

  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const rawKey = token.slice(2);
    const key = aliases.get(rawKey) ?? rawKey;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function toCliArgs(parsed: Record<string, ArgValue>): CliArgs {
  const reviewDecisionRaw = parsed['review-decision'];
  const reviewDecision =
    reviewDecisionRaw === 'approve' || reviewDecisionRaw === 'request_changes'
      ? reviewDecisionRaw
      : undefined;

  const reviewCommentRaw = parsed['review-comment'];
  const reviewComment = typeof reviewCommentRaw === 'string' ? reviewCommentRaw : undefined;

  return {
    briefPath: String(parsed.brief || 'examples/brief.cinematic-afterglow.json'),
    profilePath: String(parsed.profile || 'examples/profile.ljv-signal-core.json'),
    includeGenericOutput: Boolean(parsed['include-generic']),
    exportBundle: Boolean(parsed.export),
    execute: Boolean(parsed.execute),
    providerConfigPath: String(parsed['provider-config'] || 'provider-config.json'),
    policyTimeoutMs: parsed['policy-timeout'] ? Number(parsed['policy-timeout']) : undefined,
    policyMaxRetries: parsed['policy-retries'] ? Number(parsed['policy-retries']) : undefined,
    policyRetryDelayMs: parsed['policy-retry-delay'] ? Number(parsed['policy-retry-delay']) : undefined,
    publish: Boolean(parsed.publish),
    publishConfigPath: String(parsed['publish-config'] || 'publish-config.json'),
    installListingId: parsed['install-listing'] ? String(parsed['install-listing']) : undefined,
    marketplaceConfigPath: String(parsed['marketplace-config'] || 'marketplace-config.json'),
    reviewConfigPath: String(parsed['review-config'] || 'review-config.json'),
    reviewStart: Boolean(parsed['review-start']),
    reviewStatus: Boolean(parsed['review-status']),
    reviewComment,
    reviewDecision,
    reviewBundleId: parsed['review-bundle-id'] ? String(parsed['review-bundle-id']) : undefined,
    outputPath: parsed.output ? String(parsed.output) : undefined,
    showHelp: Boolean(parsed.help),
    prompt: parsed.prompt ? String(parsed.prompt) : undefined,
    autoRefine: Boolean(parsed['auto-refine']),
    stream: Boolean(parsed['stream'])
  };
}

function printHelp(): void {
  console.error(
    [
      'Prompt Compiler CLI',
      '',
      'Usage:',
      '  prompt-compiler --brief <path> --profile <path> [--include-generic] [--export] [--output <path>]',
      '  prompt-compiler --brief <path> --profile <path> --execute --provider-config <path> [--policy-timeout <ms>] [--policy-retries <n>] [--policy-retry-delay <ms>] [--output <path>]',
      '  prompt-compiler --brief <path> --profile <path> --publish --publish-config <path> [--output <path>]',
      '  prompt-compiler --install-listing <id> [--marketplace-config <path>] [--output <path>]',
      '  prompt-compiler --review-start [--review-status] [--review-comment <text>] [--review-decision <approve|request_changes>] [--review-config <path>] [--review-bundle-id <id>] [--brief <path> --profile <path>] [--output <path>]',
      '  prompt-compiler --prompt "<text>" [--auto-refine] [--output <path>]',
      '',
      'Options:',
      '  --brief, --b            Path to brief JSON file.',
      '  --profile, --p          Path to profile JSON file.',
      '  --include-generic       Include generic output target.',
      '  --prompt                Natural language prompt. Skips brief/profile files entirely.',
      '  --auto-refine           When used with --prompt, auto-apply refinement hints.',
      '  --export                Write export bundle files into workspace.',
      '  --execute               Send one compiled output to provider via API /execute.',
      '  --stream                Stream execution via SSE (/execute/stream). Prints progress to stderr.',
      '  --provider-config       Path to provider config JSON (default: provider-config.json).',  '  --policy-timeout        Execution timeout per attempt in milliseconds (overrides provider config).',
  '  --policy-retries        Number of retries after first failed attempt (overrides provider config).',
  '  --policy-retry-delay    Delay between retry attempts in milliseconds (overrides provider config).',      '  --publish               Submit compiled bundle to API /publish/jobs.',
      '  --publish-config        Path to publish config JSON (default: publish-config.json).',
      '  --install-listing       Install a marketplace listing by id via API /marketplace/install.',
      '  --marketplace-config    Path to marketplace config JSON (default: marketplace-config.json).',
      '  --review-start          Create/reopen and submit bundle review via API review routes.',
      '  --review-status         Fetch current review status for bundle/workspace scope.',
      '  --review-comment        Add a review comment message to the bundle review trail.',
      '  --review-decision       Submit review decision: approve or request_changes.',
      '  --review-config         Path to review config JSON (default: review-config.json).',
      '  --review-bundle-id      Explicit bundle id for review-only calls (skip compile).',
      '  --output, --o           Write command JSON response to file.',
      '  --help, --h             Show this help text.'
    ].join('\n')
  );
}

function createBundleId(brief: PromptBrief, result: { briefId: string; generatedAt: string }): string {
  return `${result.briefId || brief.id}-${result.generatedAt.replace(/[:.]/g, '-')}`;
}

function writeExportPlan(files: { path: string; content: string }[]): void {
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }
}

function writeResponse(response: CliResponse, outputPath?: string): void {
  const payload = JSON.stringify(response, null, 2);
  if (outputPath) {
    const resolvedPath = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${payload}\n`, 'utf8');
  }
  console.log(payload);
}

// P23: Format entitlement-aware error messages for the CLI.
function formatEntitlementError(
  featureKey?: string,
  currentStatusText?: string
): string {
  if (!featureKey) {
    return currentStatusText ?? 'Operation failed due to insufficient access.';
  }

  try {
    const uxMsg = generateEntitlementUXMessage(featureKey as HostedFeatureKey);
    return `${uxMsg.title}\n${uxMsg.message}${uxMsg.actionLabel ? `\n\nSuggestion: ${uxMsg.actionLabel}` : ''}`;
  } catch {
    return currentStatusText ?? 'Operation failed due to insufficient access.';
  }
}

async function executeFromCompileResult(
  args: CliArgs,
  brief: PromptBrief,
  result: {
    briefId: string;
    profileId: string;
    outputs: Array<{ target: string; content: string }>;
    generatedAt: string;
  }
): Promise<unknown> {
  const config = readJson<ProviderExecutionConfig>(args.providerConfigPath);
  if (!config.provider || !config.provider.id || !config.provider.type) {
    throw new Error('Provider config must include provider.id and provider.type.');
  }

  const selectedOutput = config.target
    ? result.outputs.find((output) => output.target === config.target)
    : result.outputs[0];

  if (!selectedOutput) {
    throw new Error(`No compiled output found for target '${config.target}'.`);
  }

  const bundleId = createBundleId(brief, result);
  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');

  // Build execution policy: CLI flags override provider config file values.
  const mergedPolicy: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } = {
    ...config.policy
  };
  if (args.policyTimeoutMs !== undefined) mergedPolicy.timeoutMs = args.policyTimeoutMs;
  if (args.policyMaxRetries !== undefined) mergedPolicy.maxRetries = args.policyMaxRetries;
  if (args.policyRetryDelayMs !== undefined) mergedPolicy.retryDelayMs = args.policyRetryDelayMs;
  const hasPolicy = Object.keys(mergedPolicy).length > 0;

  const executePayload = {
    content: selectedOutput.content,
    target: selectedOutput.target,
    bundleId,
    profileId: result.profileId,
    provider: config.provider,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    plan: config.plan,
    mode: config.mode,
    entitlements: config.entitlements,
    ...(hasPolicy ? { policy: mergedPolicy } : {})
  };

  const response = await fetch(`${apiBase}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(executePayload),
    signal: AbortSignal.timeout(10000)
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    result?: unknown;
    error?: { message?: string; featureKey?: string };
  };

  if (!response.ok || payload.ok === false) {
    // P23: Check for feature key and generate friendly message.
    const featureKey = (payload.error as { featureKey?: string } | undefined)?.featureKey;
    const friendlyMessage = formatEntitlementError(
      featureKey,
      payload.error?.message ?? `Execution failed with status ${response.status}`
    );
    throw new Error(friendlyMessage);
  }

  return payload.result;
}

// P29-2: Streaming execution via SSE. Prints progress events to stderr and returns the final result.
async function executeStreamFromCompileResult(
  args: CliArgs,
  brief: PromptBrief,
  result: {
    briefId: string;
    profileId: string;
    outputs: Array<{ target: string; content: string }>;
    generatedAt: string;
  }
): Promise<unknown> {
  const config = readJson<ProviderExecutionConfig>(args.providerConfigPath);
  if (!config.provider || !config.provider.id || !config.provider.type) {
    throw new Error('Provider config must include provider.id and provider.type.');
  }

  const selectedOutput = config.target
    ? result.outputs.find((output) => output.target === config.target)
    : result.outputs[0];

  if (!selectedOutput) {
    throw new Error(`No compiled output found for target '${config.target}'.`);
  }

  const bundleId = createBundleId(brief, result);
  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');

  const mergedPolicy: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } = {
    ...config.policy
  };
  if (args.policyTimeoutMs !== undefined) mergedPolicy.timeoutMs = args.policyTimeoutMs;
  if (args.policyMaxRetries !== undefined) mergedPolicy.maxRetries = args.policyMaxRetries;
  if (args.policyRetryDelayMs !== undefined) mergedPolicy.retryDelayMs = args.policyRetryDelayMs;
  const hasPolicy = Object.keys(mergedPolicy).length > 0;

  const executePayload = {
    content: selectedOutput.content,
    target: selectedOutput.target,
    bundleId,
    profileId: result.profileId,
    provider: config.provider,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    plan: config.plan,
    mode: config.mode,
    entitlements: config.entitlements,
    ...(hasPolicy ? { policy: mergedPolicy } : {})
  };

  const response = await fetch(`${apiBase}/execute/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(executePayload)
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json()) as { error?: { message?: string; featureKey?: string } };
    const featureKey = (payload.error as { featureKey?: string } | undefined)?.featureKey;
    const friendlyMessage = formatEntitlementError(
      featureKey,
      payload.error?.message ?? `Stream execute failed with status ${response.status}`
    );
    throw new Error(friendlyMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: unknown = undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      let eventName = '';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      if (!dataStr) continue;
      let data: unknown;
      try { data = JSON.parse(dataStr); } catch { continue; }
      if (eventName === 'error') {
        const errData = data as { message?: string } | null;
        throw new Error(errData?.message ?? 'Stream execution error');
      }
      if (eventName === 'completed') {
        finalResult = (data as { result?: unknown } | null)?.result;
        const telemetry = (data as { telemetry?: unknown } | null)?.telemetry;
        process.stderr.write(`[stream] completed ${JSON.stringify(telemetry ?? {})}\n`);
      } else {
        process.stderr.write(`[stream] ${eventName} ${JSON.stringify(data)}\n`);
      }
    }
  }

  return finalResult;
}

async function publishFromCompileResult(
  args: CliArgs,
  brief: PromptBrief,
  result: {
    briefId: string;
    profileId: string;
    generatedAt: string;
  }
): Promise<unknown> {
  const config = readJson<PublishConfig>(args.publishConfigPath);
  if (!config.target || !config.target.id || !config.target.kind) {
    throw new Error('Publish config must include target.id and target.kind.');
  }

  const bundleId = createBundleId(brief, result);
  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');

  const publishPayload = {
    bundleId,
    profileId: result.profileId,
    target: config.target,
    publishPayload: config.publishPayload ?? {},
    plan: config.plan,
    mode: config.mode,
    entitlements: config.entitlements
  };

  const response = await fetch(`${apiBase}/publish/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(publishPayload),
    signal: AbortSignal.timeout(10000)
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    result?: unknown;
    error?: { message?: string; featureKey?: string };
  };

  if (!response.ok || payload.ok === false) {
    // P23: Check for feature key and generate friendly message.
    const featureKey = (payload.error as { featureKey?: string } | undefined)?.featureKey;
    const friendlyMessage = formatEntitlementError(
      featureKey,
      payload.error?.message ?? `Publish failed with status ${response.status}`
    );
    throw new Error(friendlyMessage);
  }

  return payload.result;
}

async function runReviewActions(args: CliArgs, bundleId: string): Promise<Record<string, unknown>> {
  const config = readJson<ReviewConfig>(args.reviewConfigPath);
  if (!config.accountId || !config.workspaceId) {
    throw new Error('Review config must include accountId and workspaceId.');
  }

  if (args.reviewDecision && args.reviewDecision !== 'approve' && args.reviewDecision !== 'request_changes') {
    throw new Error('review-decision must be either approve or request_changes.');
  }

  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    'x-account-id': config.accountId,
    'x-workspace-id': config.workspaceId
  };

  const reviewResult: Record<string, unknown> = {};

  if (args.reviewStart) {
    const createResponse = await fetch(`${apiBase}/reviews/bundles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bundleId,
        workspaceId: config.workspaceId,
        ...(Number.isInteger(config.requiredApprovals) ? { requiredApprovals: config.requiredApprovals } : {})
      }),
      signal: AbortSignal.timeout(10000)
    });
    const createPayload = (await createResponse.json()) as {
      ok?: boolean;
      result?: unknown;
      error?: { message?: string };
    };
    if (!createResponse.ok || createPayload.ok === false) {
      throw new Error(createPayload.error?.message ?? `Review start failed with status ${createResponse.status}`);
    }
    reviewResult.start = createPayload.result;

    const submitResponse = await fetch(`${apiBase}/reviews/bundles/${encodeURIComponent(bundleId)}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId: config.workspaceId }),
      signal: AbortSignal.timeout(10000)
    });
    const submitPayload = (await submitResponse.json()) as {
      ok?: boolean;
      result?: unknown;
      error?: { message?: string };
    };
    if (!submitResponse.ok || submitPayload.ok === false) {
      throw new Error(submitPayload.error?.message ?? `Review submit failed with status ${submitResponse.status}`);
    }
    reviewResult.submit = submitPayload.result;
  }

  if (args.reviewComment) {
    const commentResponse = await fetch(`${apiBase}/reviews/bundles/${encodeURIComponent(bundleId)}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        workspaceId: config.workspaceId,
        message: args.reviewComment
      }),
      signal: AbortSignal.timeout(10000)
    });
    const commentPayload = (await commentResponse.json()) as {
      ok?: boolean;
      result?: unknown;
      error?: { message?: string };
    };
    if (!commentResponse.ok || commentPayload.ok === false) {
      throw new Error(commentPayload.error?.message ?? `Review comment failed with status ${commentResponse.status}`);
    }
    reviewResult.comment = commentPayload.result;
  }

  if (args.reviewDecision) {
    const decisionResponse = await fetch(`${apiBase}/reviews/bundles/${encodeURIComponent(bundleId)}/decisions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        workspaceId: config.workspaceId,
        decision: args.reviewDecision
      }),
      signal: AbortSignal.timeout(10000)
    });
    const decisionPayload = (await decisionResponse.json()) as {
      ok?: boolean;
      result?: unknown;
      error?: { message?: string };
    };
    if (!decisionResponse.ok || decisionPayload.ok === false) {
      throw new Error(decisionPayload.error?.message ?? `Review decision failed with status ${decisionResponse.status}`);
    }
    reviewResult.decision = decisionPayload.result;
  }

  if (args.reviewStatus || args.reviewStart || Boolean(args.reviewComment) || Boolean(args.reviewDecision)) {
    const statusResponse = await fetch(
      `${apiBase}/reviews/bundles/${encodeURIComponent(bundleId)}?workspaceId=${encodeURIComponent(config.workspaceId)}`,
      {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      }
    );
    const statusPayload = (await statusResponse.json()) as {
      ok?: boolean;
      result?: unknown;
      error?: { message?: string };
    };
    if (!statusResponse.ok || statusPayload.ok === false) {
      throw new Error(statusPayload.error?.message ?? `Review status failed with status ${statusResponse.status}`);
    }
    reviewResult.status = statusPayload.result;
  }

  return reviewResult;
}

async function installMarketplaceListing(args: CliArgs): Promise<unknown> {
  if (!args.installListingId) {
    throw new Error('Missing install listing id.');
  }

  const config = readJson<MarketplaceConfig>(args.marketplaceConfigPath);
  if (!config.accountId) {
    throw new Error('Marketplace config must include accountId.');
  }

  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');
  const response = await fetch(`${apiBase}/marketplace/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: args.installListingId,
      accountId: config.accountId,
      workspaceId: config.workspaceId
    }),
    signal: AbortSignal.timeout(10000)
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    result?: unknown;
    error?: { message?: string; featureKey?: string };
  };

  if (!response.ok || payload.ok === false) {
    // P23: Check for feature key and generate friendly message.
    const featureKey = (payload.error as { featureKey?: string } | undefined)?.featureKey;
    const friendlyMessage = formatEntitlementError(
      featureKey,
      payload.error?.message ?? `Install listing failed with status ${response.status}`
    );
    throw new Error(friendlyMessage);
  }

  return payload.result;
}

async function main(): Promise<number> {
  const args = toCliArgs(parseArgs());
  const wantsReviewActions =
    args.reviewStart || args.reviewStatus || Boolean(args.reviewComment) || Boolean(args.reviewDecision);

  if (args.showHelp) {
    printHelp();
    return 0;
  }

  if (args.installListingId) {
    try {
      const result = await installMarketplaceListing(args);
      writeResponse({ ok: true, result }, args.outputPath);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown install-listing error';
      writeResponse({ ok: false, error: { code: 'SERVER_ERROR', message } }, args.outputPath);
      return 1;
    }
  }

  if (wantsReviewActions && args.reviewBundleId) {
    try {
      const review = await runReviewActions(args, args.reviewBundleId);
      writeResponse({ ok: true, result: { bundleId: args.reviewBundleId, review } }, args.outputPath);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown review lifecycle error';
      writeResponse({ ok: false, error: { code: 'SERVER_ERROR', message } }, args.outputPath);
      return 1;
    }
  }

  // -- Auto-compile from natural language prompt --
  if (args.prompt) {
    try {
      const result = autoCompile({ prompt: args.prompt, autoRefine: args.autoRefine });
      const hasErrors = result.bundle.diagnostics.some((d) => d.level === 'error');
      if (hasErrors) {
        writeResponse(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Auto-compile produced validation errors.' } },
          args.outputPath
        );
        return 2;
      }
      writeResponse({ ok: true, result }, args.outputPath);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      writeResponse({ ok: false, error: { code: 'SERVER_ERROR', message } }, args.outputPath);
      return 1;
    }
  }

  try {
    const brief = readJson<PromptBrief>(args.briefPath);
    const profile = readJson<BrandProfile>(args.profilePath);
    const result = compilePromptBundle(brief, profile, {
      includeGenericOutput: args.includeGenericOutput
    });

    const hasErrors = result.diagnostics.some((item) => item.level === 'error');
    if (hasErrors) {
      writeResponse(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Compilation produced validation errors.'
          }
        },
        args.outputPath
      );
      return 2;
    }

    if (args.exportBundle) {
      writeExportPlan(createExportPlan(brief, profile, result));
      console.error('Export completed.');
    }

    let executionResult: unknown;
    if (args.execute || args.stream) {
      executionResult = args.stream
        ? await executeStreamFromCompileResult(args, brief, result)
        : await executeFromCompileResult(args, brief, result);
    }

    let publishResult: unknown;
    if (args.publish) {
      publishResult = await publishFromCompileResult(args, brief, result);
    }

    let reviewResult: Record<string, unknown> | undefined;
    if (wantsReviewActions) {
      const bundleId = args.reviewBundleId ?? createBundleId(brief, result);
      reviewResult = await runReviewActions(args, bundleId);
    }

    writeResponse(
      {
        ok: true,
        result: args.execute || args.stream || args.publish || wantsReviewActions
          ? {
              compilation: result,
              ...(args.execute ? { execution: executionResult } : {}),
              ...(args.publish ? { publish: publishResult } : {}),
              ...(wantsReviewActions ? { review: reviewResult } : {})
            }
          : result
      },
      args.outputPath
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeResponse(
      {
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message
        }
      },
      args.outputPath
    );
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
