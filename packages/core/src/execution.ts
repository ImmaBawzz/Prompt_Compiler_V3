/**
 * Provider Execution Bridge (Phase 14 & Phase 24)
 *
 * Sends compiled prompt outputs to AI provider endpoints via HTTP adapters
 * specific to each provider (OpenAI, Suno, Udio, FLUX, Kling).
 * A dry-run mode validates the request shape and returns a token estimate
 * without making a network call.
 *
 * Entitlement note: the /execute API route gates on `credits.compute`.
 * Local dry-run is always free and requires no entitlement check.
 */

import { randomUUID } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { ExecutionPolicy, ExecutionRequest, ExecutionResult, ProviderTargetType } from './types';

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
// Generic HTTP request utility
// ---------------------------------------------------------------------------

interface HttpResponse {
  statusCode: number;
  body: string;
}

function shouldRetryHttpStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function extractErrorMessageFromBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };

    if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
      return parsed.error.message.trim();
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function makeHttpRequest(
  url: URL,
  method: string,
  body: string,
  headers: Record<string, string>,
  policy?: ExecutionPolicy
): Promise<HttpResponse> {
  const timeoutMs = Math.max(1, policy?.timeoutMs ?? 30000);
  const maxRetries = Math.max(0, policy?.maxRetries ?? 0);
  const retryDelayMs = Math.max(0, policy?.retryDelayMs ?? 250);

  const attemptRequest = () =>
    new Promise<HttpResponse>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          timeout: timeoutMs
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () =>
            resolve({
              statusCode: res.statusCode ?? 0,
              body: data
            })
          );
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });
      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await attemptRequest();
      if (shouldRetryHttpStatus(response.statusCode) && attempt < maxRetries) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed.');
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

  let response: HttpResponse;
  try {
    response = await makeHttpRequest(endpoint, 'POST', bodyStr, headers, request.policy);
  } catch (error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'openai-compatible',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
      error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Network request failed.' }
    };
  }

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  if (response.statusCode >= 400) {
    const providerMessage =
      extractErrorMessageFromBody(response.body) ??
      `Provider returned HTTP ${response.statusCode}.`;

    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'openai-compatible',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: 'PROVIDER_ERROR',
        message: providerMessage
      }
    };
  }

  let parsed: OpenAICompatibleResponse;
  try {
    parsed = JSON.parse(response.body) as OpenAICompatibleResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'openai-compatible',
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
      provider: 'openai-compatible',
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
    provider: 'openai-compatible',
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: content,
    finishReason,
    executedAt,
    latencyMs
  };
}

// ---------------------------------------------------------------------------
// Suno music generation adapter
// ---------------------------------------------------------------------------

interface SunoCreateMusicRequest {
  prompt: string;
  tags?: string;
  title?: string;
  negative_tags?: string;
}

interface SunoClip {
  id?: string;
  title?: string;
  tags?: string;
}

interface SunoResponse {
  clips?: SunoClip[];
  error?: { message?: string };
  message?: string;
}

async function callSunoAdapter(
  request: ExecutionRequest,
  startMs: number
): Promise<ExecutionResult> {
  const provider = request.provider;
  const baseUrl = provider.baseUrl ?? 'https://api.suno.ai/api/custom_generate';
  const apiKey = provider.apiKey ?? process.env['SUNO_API_KEY'] ?? '';

  const endpoint = new URL(baseUrl);

  const body: SunoCreateMusicRequest = {
    prompt: request.content,
    tags: request.provider.model ?? 'rap',
    title: `Prompt from ${request.target}`
  };

  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(bodyStr)),
    Authorization: `Bearer ${apiKey}`,
    ...(provider.headers ?? {})
  };

  const requestId = randomUUID();

  let response: HttpResponse;
  try {
    response = await makeHttpRequest(endpoint, 'POST', bodyStr, headers, request.policy);
  } catch (error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'suno',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
      error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Network request failed.' }
    };
  }

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  if (response.statusCode >= 400) {
    const providerMessage =
      extractErrorMessageFromBody(response.body) ??
      `Suno returned HTTP ${response.statusCode}.`;

    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'suno',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'SUNO_ERROR', message: providerMessage }
    };
  }

  let parsed: SunoResponse;
  try {
    parsed = JSON.parse(response.body) as SunoResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'suno',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'PARSE_ERROR', message: 'Could not parse Suno response.' }
    };
  }

  if (parsed.error || parsed.message?.includes('error')) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'suno',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: 'SUNO_ERROR',
        message: parsed.error?.message ?? parsed.message ?? 'Suno returned an error.'
      }
    };
  }

  const clip = parsed.clips?.[0];
  const responseId = clip?.id ?? requestId;

  return {
    requestId,
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: 'suno',
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: `Generated clip ID: ${responseId}; Title: ${clip?.title ?? 'untitled'}`,
    finishReason: 'stop',
    executedAt,
    latencyMs
  };
}

// ---------------------------------------------------------------------------
// FLUX image generation adapter
// ---------------------------------------------------------------------------

interface FluxGenerateRequest {
  prompt: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
}

interface FluxImageResult {
  image?: string;
  id?: string;
}

interface FluxResponse {
  data?: FluxImageResult[];
  error?: { message?: string };
}

async function callFluxAdapter(
  request: ExecutionRequest,
  startMs: number
): Promise<ExecutionResult> {
  const provider = request.provider;
  const baseUrl = provider.baseUrl ?? 'https://api.flux.ai/v1/generate';
  const apiKey = provider.apiKey ?? process.env['FLUX_API_KEY'] ?? '';
  const model = provider.model ?? 'flux-pro';

  const endpoint = new URL(baseUrl);

  const body: FluxGenerateRequest = {
    prompt: request.content,
    width: 1024,
    height: 768
  };

  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(bodyStr)),
    Authorization: `Bearer ${apiKey}`,
    'X-Model': model,
    ...(provider.headers ?? {})
  };

  const requestId = randomUUID();

  let response: HttpResponse;
  try {
    response = await makeHttpRequest(endpoint, 'POST', bodyStr, headers, request.policy);
  } catch (error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'flux',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
      error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Network request failed.' }
    };
  }

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  if (response.statusCode >= 400) {
    const providerMessage =
      extractErrorMessageFromBody(response.body) ??
      `FLUX returned HTTP ${response.statusCode}.`;

    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'flux',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'FLUX_ERROR', message: providerMessage }
    };
  }

  let parsed: FluxResponse;
  try {
    parsed = JSON.parse(response.body) as FluxResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'flux',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'PARSE_ERROR', message: 'Could not parse FLUX response.' }
    };
  }

  if (parsed.error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'flux',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: 'FLUX_ERROR',
        message: parsed.error.message ?? 'FLUX returned an error.'
      }
    };
  }

  const image = parsed.data?.[0];
  const imageId = image?.id ?? requestId;

  return {
    requestId,
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: 'flux',
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: `Generated image ID: ${imageId}`,
    finishReason: 'stop',
    executedAt,
    latencyMs
  };
}

// ---------------------------------------------------------------------------
// Kling video generation adapter
// ---------------------------------------------------------------------------

interface KlingVideoRequest {
  prompt: string;
  model?: string;
  duration?: number;
  aspect_ratio?: string;
}

interface KlingVideo {
  id?: string;
  status?: string;
}

interface KlingResponse {
  data?: KlingVideo;
  error?: { message?: string };
}

async function callKlingAdapter(
  request: ExecutionRequest,
  startMs: number
): Promise<ExecutionResult> {
  const provider = request.provider;
  const baseUrl = provider.baseUrl ?? 'https://api.klingai.com/v1/videos/text2video';
  const apiKey = provider.apiKey ?? process.env['KLING_API_KEY'] ?? '';

  const endpoint = new URL(baseUrl);

  const body: KlingVideoRequest = {
    prompt: request.content,
    model: provider.model ?? 'kling-v1',
    duration: 10,
    aspect_ratio: '16:9'
  };

  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(bodyStr)),
    Authorization: `Bearer ${apiKey}`,
    ...(provider.headers ?? {})
  };

  const requestId = randomUUID();

  let response: HttpResponse;
  try {
    response = await makeHttpRequest(endpoint, 'POST', bodyStr, headers, request.policy);
  } catch (error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'kling',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
      error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Network request failed.' }
    };
  }

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  if (response.statusCode >= 400) {
    const providerMessage =
      extractErrorMessageFromBody(response.body) ??
      `Kling returned HTTP ${response.statusCode}.`;

    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'kling',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'KLING_ERROR', message: providerMessage }
    };
  }

  let parsed: KlingResponse;
  try {
    parsed = JSON.parse(response.body) as KlingResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'kling',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'PARSE_ERROR', message: 'Could not parse Kling response.' }
    };
  }

  if (parsed.error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'kling',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: 'KLING_ERROR',
        message: parsed.error.message ?? 'Kling returned an error.'
      }
    };
  }

  const video = parsed.data;
  const videoId = video?.id ?? requestId;

  return {
    requestId,
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: 'kling',
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: `Generated video ID: ${videoId}; Status: ${video?.status ?? 'processing'}`,
    finishReason: 'stop',
    executedAt,
    latencyMs
  };
}

// ---------------------------------------------------------------------------
// Udio music generation adapter
// ---------------------------------------------------------------------------

interface UdioCreateMusicRequest {
  prompt: string;
  tags?: string;
  title?: string;
}

interface UdioTrack {
  id?: string;
  title?: string;
  tags?: string;
}

interface UdioResponse {
  track?: UdioTrack;
  error?: { message?: string };
  message?: string;
}

async function callUdioAdapter(
  request: ExecutionRequest,
  startMs: number
): Promise<ExecutionResult> {
  const provider = request.provider;
  const baseUrl = provider.baseUrl ?? 'https://api.udio.com/api/custom_generate';
  const apiKey = provider.apiKey ?? process.env['UDIO_API_KEY'] ?? '';

  const endpoint = new URL(baseUrl);

  const body: UdioCreateMusicRequest = {
    prompt: request.content,
    tags: request.provider.model ?? 'pop',
    title: `Prompt from ${request.target}`
  };

  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(bodyStr)),
    Authorization: `Bearer ${apiKey}`,
    ...(provider.headers ?? {})
  };

  const requestId = randomUUID();

  let response: HttpResponse;
  try {
    response = await makeHttpRequest(endpoint, 'POST', bodyStr, headers, request.policy);
  } catch (error) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'udio',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
      error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Network request failed.' }
    };
  }

  const latencyMs = Date.now() - startMs;
  const executedAt = new Date().toISOString();

  if (response.statusCode >= 400) {
    const providerMessage =
      extractErrorMessageFromBody(response.body) ??
      `Udio returned HTTP ${response.statusCode}.`;

    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'udio',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'UDIO_ERROR', message: providerMessage }
    };
  }

  let parsed: UdioResponse;
  try {
    parsed = JSON.parse(response.body) as UdioResponse;
  } catch {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'udio',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: { code: 'PARSE_ERROR', message: 'Could not parse Udio response.' }
    };
  }

  if (parsed.error || parsed.message?.includes('error')) {
    return {
      requestId,
      bundleId: request.bundleId,
      profileId: request.profileId,
      target: request.target,
      provider: 'udio',
      estimatedTokens: estimateTokens(request.content),
      isDryRun: false,
      finishReason: 'error',
      executedAt,
      latencyMs,
      error: {
        code: 'UDIO_ERROR',
        message: parsed.error?.message ?? parsed.message ?? 'Udio returned an error.'
      }
    };
  }

  const track = parsed.track;
  const trackId = track?.id ?? requestId;

  return {
    requestId,
    bundleId: request.bundleId,
    profileId: request.profileId,
    target: request.target,
    provider: 'udio',
    estimatedTokens: estimateTokens(request.content),
    isDryRun: false,
    responseText: `Generated track ID: ${trackId}; Title: ${track?.title ?? 'untitled'}`,
    finishReason: 'stop',
    executedAt,
    latencyMs
  };
}

// Kling video generation adapter
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a compiled prompt output against the configured provider.
 *
 * When `request.provider.type === 'dry-run'` no HTTP call is made; the
 * function returns immediately with an estimated token count and
 * `isDryRun: true`.
 *
 * Supports multiple provider types:
 * - openai-compatible: OpenAI or compatible endpoints
 * - suno: Suno music generation
 * - udio: Udio music generation
 * - flux: FLUX image generation
 * - kling: Kling video generation
 * - dry-run: Local validation only
 */
export async function executeCompiledOutput(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  const startMs = Date.now();

  if (request.provider.type === 'dry-run') {
    return executeDryRun(request, startMs);
  }

  switch (request.provider.type) {
    case 'openai-compatible':
      return callOpenAICompatible(request, startMs);
    case 'suno':
      return callSunoAdapter(request, startMs);
    case 'udio':
      return callUdioAdapter(request, startMs);
    case 'flux':
      return callFluxAdapter(request, startMs);
    case 'kling':
      return callKlingAdapter(request, startMs);
    default:
      return {
        requestId: randomUUID(),
        bundleId: request.bundleId,
        profileId: request.profileId,
        target: request.target,
        provider: request.provider.type,
        estimatedTokens: estimateTokens(request.content),
        isDryRun: false,
        finishReason: 'error',
        executedAt: new Date().toISOString(),
        latencyMs: Date.now() - startMs,
        error: {
          code: 'UNSUPPORTED_PROVIDER',
          message: `Provider type '${request.provider.type}' is not supported.`
        }
      };
  }
}
