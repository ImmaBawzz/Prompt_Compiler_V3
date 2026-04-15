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
import { ExecutionRequest, ExecutionResult } from './types';
/**
 * Rough token estimate: ~4 characters per token (GPT family heuristic).
 * Good enough for cost awareness in dry-run mode.
 */
export declare function estimateTokens(text: string): number;
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
export declare function executeCompiledOutput(request: ExecutionRequest): Promise<ExecutionResult>;
