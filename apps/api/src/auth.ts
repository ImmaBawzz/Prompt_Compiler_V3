import type { IncomingMessage } from 'node:http';
import { WorkspaceRole, meetsMinRole } from '@prompt-compiler/core';
import type { WorkspaceMemberStore } from './workspaceMemberStore';

/**
 * Resolved identity and authentication state for a single request.
 */
export interface AuthContext {
  /** Whether the request passed authentication. */
  authenticated: boolean;
  /** Account ID extracted from the x-account-id header after successful auth. */
  accountId: string | null;
  /** Workspace ID extracted from the x-workspace-id header after successful auth. */
  workspaceId: string | null;
  /** Raw bearer token presented by the caller (null when bypassed or absent). */
  token: string | null;
}

/**
 * Configuration for the auth middleware seam.
 *
 * Design intent: local-first default (bypassAuth unset → bypass).
 * Real auth providers plug in by setting bypassAuth: false and supplying
 * apiKeys or a custom validateToken implementation in the future.
 */
export interface AuthConfig {
  /**
   * When false, bearer token validation is enforced.
   * When true or absent, all requests are treated as authenticated (local dev default).
   */
  bypassAuth?: boolean;
  /**
   * Static API keys accepted as valid Bearer tokens.
   * If non-empty, the request token must match one of these values.
   * If empty or absent, any well-formed Bearer token is accepted.
   */
  apiKeys?: string[];
}

export interface AuthError {
  code: 'UNAUTHORIZED' | 'FORBIDDEN';
  message: string;
}

/**
 * Resolve auth context from request headers.
 *
 * Identity propagation contract:
 *   x-account-id  → AuthContext.accountId
 *   x-workspace-id → AuthContext.workspaceId
 *   Authorization: Bearer <token> → validated token
 *
 * Default behavior (no config supplied) is bypass — backward-compatible
 * with all existing routes that do not pass an AuthConfig.
 */
export function resolveAuthContext(req: IncomingMessage, config: AuthConfig = {}): AuthContext {
  // Default bypass: auth is not enforced when bypassAuth is not explicitly false.
  if (config.bypassAuth !== false) {
    const accountId = headerString(req, 'x-account-id');
    const workspaceId = headerString(req, 'x-workspace-id');
    return { authenticated: true, accountId, workspaceId, token: null };
  }

  // Auth is required — extract and validate Bearer token.
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader) {
    return unauthenticated(null);
  }

  const spaceIdx = authHeader.indexOf(' ');
  if (spaceIdx === -1) {
    return unauthenticated(null);
  }

  const scheme = authHeader.slice(0, spaceIdx).toLowerCase();
  const token = authHeader.slice(spaceIdx + 1).trim();

  if (scheme !== 'bearer' || !token) {
    return unauthenticated(null);
  }

  const validKeys = config.apiKeys ?? [];
  if (validKeys.length > 0 && !validKeys.includes(token)) {
    return unauthenticated(token);
  }

  const accountId = headerString(req, 'x-account-id');
  const workspaceId = headerString(req, 'x-workspace-id');
  return { authenticated: true, accountId, workspaceId, token };
}

/**
 * Guard: require a successfully authenticated context.
 * Returns null on success, AuthError on failure.
 */
export function requireAuth(context: AuthContext): AuthError | null {
  if (!context.authenticated) {
    return { code: 'UNAUTHORIZED', message: 'Authentication required.' };
  }
  return null;
}

/**
 * Guard: require the authenticated identity to own the target account.
 * Passes when context has no accountId set (identity not yet scoped) or when
 * context.accountId matches targetAccountId exactly.
 * Returns null on success, AuthError on failure.
 */
export function requireOwnerAccess(context: AuthContext, targetAccountId: string): AuthError | null {
  if (!context.authenticated) {
    return { code: 'UNAUTHORIZED', message: 'Authentication required.' };
  }
  if (context.accountId !== null && context.accountId !== targetAccountId) {
    return { code: 'FORBIDDEN', message: 'Access denied: account boundary violation.' };
  }
  return null;
}

/**
 * Guard: require the authenticated identity has at least `minimumRole` in the target workspace.
 * Checks the caller's accountId (from AuthContext) against the workspace member store.
 * Returns null on success, AuthError on failure.
 */
export function requireWorkspaceRole(
  context: AuthContext,
  memberStore: WorkspaceMemberStore,
  workspaceId: string,
  minimumRole: WorkspaceRole
): AuthError | null {
  if (!context.authenticated) {
    return { code: 'UNAUTHORIZED', message: 'Authentication required.' };
  }

  if (!context.accountId) {
    return { code: 'FORBIDDEN', message: 'No account identity on request — cannot check workspace role.' };
  }

  const member = memberStore.getMember(workspaceId, context.accountId);
  if (!member) {
    return { code: 'FORBIDDEN', message: `Account '${context.accountId}' is not a member of workspace '${workspaceId}'.` };
  }

  if (!meetsMinRole(member.role, minimumRole)) {
    return {
      code: 'FORBIDDEN',
      message: `Operation requires '${minimumRole}' role; account has '${member.role}'.`
    };
  }

  return null;
}

// --- helpers ---

function unauthenticated(token: string | null): AuthContext {
  return { authenticated: false, accountId: null, workspaceId: null, token };
}

function headerString(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}
