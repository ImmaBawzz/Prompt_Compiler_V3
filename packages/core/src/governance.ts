/**
 * Workspace governance types and role-permission helpers.
 * Lives in core so that any consumer can reason about roles without
 * taking a dependency on the API layer.
 */

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export const WORKSPACE_ROLE_VALUES: readonly WorkspaceRole[] = ['owner', 'editor', 'viewer'];

export interface WorkspaceMember {
  accountId: string;
  workspaceId: string;
  role: WorkspaceRole;
  /** ISO 8601 timestamp when the membership was created or last updated. */
  addedAt: string;
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'owner' || value === 'editor' || value === 'viewer';
}

/** Returns true when the role grants write access to workspace assets. */
export function canWrite(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'editor';
}

/** Returns true when the role grants admin operations (add/remove members, delete workspace). */
export function canAdmin(role: WorkspaceRole): boolean {
  return role === 'owner';
}

/** Role ordinals for comparison (higher = more permissions). */
const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Returns true when `actual` satisfies or exceeds `minimum` in the role hierarchy.
 * Example: meetsMinRole('owner', 'editor') === true
 */
export function meetsMinRole(actual: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}
