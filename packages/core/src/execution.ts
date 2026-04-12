/**
 * Provider Execution Bridge (Phase 14)
 *
 * Sends compiled prompt outputs to AI provider endpoints via a generic
 * OpenAI-compatible HTTP adapter.  A dry-run mode validates the request
 * shape and returns a token estimate without making a network call.
 *
 * Entitlement note: the /execute API route gates on `credits.compute`.
 * Local dry-run is always free and requires no entitlement check.
 */

import { randomUUID } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { ExecutionRequest, ExecutionResult, ProviderTargetType } from './types';

// ---------------------------------------------------------------------------
// Token estimation heuristic (no external deps)
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: ~4 characters per token (GPT family heuristic).
 * Good enough for cost awareness in dry-run mode.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Dry-run adapter
// ---------------------------------------------------------------------------

function executeDryRun(request: ExecutionRequest, startMs: number): ExecutionResult {
  return {
    requestId: randomUUID(),
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: 'dry-run' as ProviderTargetType,
    estimatedTokens: estimateTokens(request.content),
    isDryRun: true,
    finishReason: 'dry-run',
    executedAt: new Date().toISOString(),
    latencyMs: Date.now() - startMs
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible HTTP adapter
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: 'user';
  content: string;
}

interface OpenAICompatibleRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  temperature: number;
}

interface OpenAICompatibleChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface OpenAICompatibleResponse {
  choices?: OpenAICompatibleChoice[];
  error?: { code?: string; message?: string };
}

async function callOpenAICompatible(
  request: ExecutionRequest,
  startMs: number
): Promise<ExecutionResult> {
  const provider = request.provider;
  const baseUrl = provider.baseUrl ?? 'https://api.openai.com/v1';
  const model = provider.model ?? 'gpt-4o-mini';
  const apiKey = provider.apiKey ?? process.env['PROVIDER_API_KEY'] ?? '';
  const maxTokens = request.maxTokens ?? 512;
  const temperature = request.temperature ?? 0.7;

  const endpoint = new URL('/chat/completions', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  const body: OpenAICompatibleRequest = {
    model,
    messages: [{ role: 'user', content: request.content }],
    max_tokens: maxTokens,
    temperature
  };

  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(bodyStr)),
    Authorization: `Bearer ${apiKey}`,
    ...(provider.headers ?? {})
  };

  const requestId = randomUUID();

  const responseText = await new Promise<string>((resolve, reject) => {
    const lib = endpoint.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: endpoint.pathname,
        method: 'POST',
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => resolve(data));
      }
    );

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  let parsed: OpenAICompatibleResponse;
  try {
    parsed = JSON.parse(responseText) as OpenAICompatibleResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: provider.type,
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'PARSE_ERROR', message: 'Could not parse provider response.' }
    };
  }

  if (parsed.error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: provider.type,
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: parsed.error.code ?? 'PROVIDER_ERROR',
        message: parsed.error.message ?? 'Provider returned an error.'
      }
    };
  }

  const choice = parsed.choices?.[0];
  const content = choice?.message?.content ?? '';
  const finishReason = (choice?.finish_reason as ExecutionResult['finishReason']) ?? 'stop';

  return {
    requestId,
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: provider.type,
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: content,
    finishReason,
    executedAt,
    latencyMs
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a compiled prompt output against the configured provider.
 *
 * When `request.provider.type === 'dry-run'` no HTTP call is made; the
 * function returns immediately with an estimated token count and
 * `isDryRun: true`.
 */
export async function executeCompiledOutput(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  const startMs = Date.now();

  if (request.provider.type === 'dry-run') {
    return executeDryRun(request, startMs);
  }

  // Only openai-compatible is supported in this release.
  return callOpenAICompatible(request, startMs);
}
