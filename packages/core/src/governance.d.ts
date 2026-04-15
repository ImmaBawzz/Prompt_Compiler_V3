/**
 * Workspace governance types and role-permission helpers.
 * Lives in core so that any consumer can reason about roles without
 * taking a dependency on the API layer.
 */
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';
export declare const WORKSPACE_ROLE_VALUES: readonly WorkspaceRole[];
export interface WorkspaceMember {
    accountId: string;
    workspaceId: string;
    role: WorkspaceRole;
    /** ISO 8601 timestamp when the membership was created or last updated. */
    addedAt: string;
}
export declare function isWorkspaceRole(value: unknown): value is WorkspaceRole;
/** Returns true when the role grants write access to workspace assets. */
export declare function canWrite(role: WorkspaceRole): boolean;
/** Returns true when the role grants admin operations (add/remove members, delete workspace). */
export declare function canAdmin(role: WorkspaceRole): boolean;
/**
 * Returns true when `actual` satisfies or exceeds `minimum` in the role hierarchy.
 * Example: meetsMinRole('owner', 'editor') === true
 */
export declare function meetsMinRole(actual: WorkspaceRole, minimum: WorkspaceRole): boolean;
