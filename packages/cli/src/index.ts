#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compilePromptBundle, createExportPlan, autoCompile, BrandProfile, PromptBrief } from '@prompt-compiler/core';

type ArgValue = string | boolean;

interface CliArgs {
  briefPath: string;
  profilePath: string;
  includeGenericOutput: boolean;
  exportBundle: boolean;
  execute: boolean;
  providerConfigPath: string;
  publish: boolean;
  publishConfigPath: string;
  installListingId?: string;
  marketplaceConfigPath: string;
  outputPath?: string;
  showHelp: boolean;
  prompt?: string;
  autoRefine: boolean;
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
  return {
    briefPath: String(parsed.brief || 'examples/brief.cinematic-afterglow.json'),
    profilePath: String(parsed.profile || 'examples/profile.ljv-signal-core.json'),
    includeGenericOutput: Boolean(parsed['include-generic']),
    exportBundle: Boolean(parsed.export),
    execute: Boolean(parsed.execute),
    providerConfigPath: String(parsed['provider-config'] || 'provider-config.json'),
    publish: Boolean(parsed.publish),
    publishConfigPath: String(parsed['publish-config'] || 'publish-config.json'),
    installListingId: parsed['install-listing'] ? String(parsed['install-listing']) : undefined,
    marketplaceConfigPath: String(parsed['marketplace-config'] || 'marketplace-config.json'),
    outputPath: parsed.output ? String(parsed.output) : undefined,
    showHelp: Boolean(parsed.help),
    prompt: parsed.prompt ? String(parsed.prompt) : undefined,
    autoRefine: Boolean(parsed['auto-refine'])
  };
}

function printHelp(): void {
  console.error(
    [
      'Prompt Compiler CLI',
      '',
      'Usage:',
      '  prompt-compiler --brief <path> --profile <path> [--include-generic] [--export] [--output <path>]',
      '  prompt-compiler --brief <path> --profile <path> --execute --provider-config <path> [--output <path>]',
      '  prompt-compiler --brief <path> --profile <path> --publish --publish-config <path> [--output <path>]',
      '  prompt-compiler --install-listing <id> [--marketplace-config <path>] [--output <path>]',
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
      '  --provider-config       Path to provider config JSON (default: provider-config.json).',
      '  --publish               Submit compiled bundle to API /publish/jobs.',
      '  --publish-config        Path to publish config JSON (default: publish-config.json).',
      '  --install-listing       Install a marketplace listing by id via API /marketplace/install.',
      '  --marketplace-config    Path to marketplace config JSON (default: marketplace-config.json).',
      '  --output, --o           Write command JSON response to file.',
      '  --help, --h             Show this help text.'
    ].join('\n')
  );
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

  const bundleId = `${result.briefId || brief.id}-${result.generatedAt.replace(/[:.]/g, '-')}`;
  const apiBase = (config.apiBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '');

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
    entitlements: config.entitlements
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
    error?: { message?: string };
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Execution failed with status ${response.status}`);
  }

  return payload.result;
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

  const bundleId = `${result.briefId || brief.id}-${result.generatedAt.replace(/[:.]/g, '-')}`;
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
    error?: { message?: string };
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Publish failed with status ${response.status}`);
  }

  return payload.result;
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
    error?: { message?: string };
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Install listing failed with status ${response.status}`);
  }

  return payload.result;
}

async function main(): Promise<number> {
  const args = toCliArgs(parseArgs());

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
    if (args.execute) {
      executionResult = await executeFromCompileResult(args, brief, result);
    }

    let publishResult: unknown;
    if (args.publish) {
      publishResult = await publishFromCompileResult(args, brief, result);
    }

    writeResponse(
      {
        ok: true,
        result: args.execute || args.publish
          ? {
              compilation: result,
              ...(args.execute ? { execution: executionResult } : {}),
              ...(args.publish ? { publish: publishResult } : {})
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
