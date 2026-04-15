"use strict";
/**
 * Workspace governance types and role-permission helpers.
 * Lives in core so that any consumer can reason about roles without
 * taking a dependency on the API layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKSPACE_ROLE_VALUES = void 0;
exports.isWorkspaceRole = isWorkspaceRole;
exports.canWrite = canWrite;
exports.canAdmin = canAdmin;
exports.meetsMinRole = meetsMinRole;
exports.WORKSPACE_ROLE_VALUES = ['owner', 'editor', 'viewer'];
function isWorkspaceRole(value) {
    return value === 'owner' || value === 'editor' || value === 'viewer';
}
/** Returns true when the role grants write access to workspace assets. */
function canWrite(role) {
    return role === 'owner' || role === 'editor';
}
/** Returns true when the role grants admin operations (add/remove members, delete workspace). */
function canAdmin(role) {
    return role === 'owner';
}
/** Role ordinals for comparison (higher = more permissions). */
const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 };
/**
 * Returns true when `actual` satisfies or exceeds `minimum` in the role hierarchy.
 * Example: meetsMinRole('owner', 'editor') === true
 */
function meetsMinRole(actual, minimum) {
    return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}
//# sourceMappingURL=governance.js.map