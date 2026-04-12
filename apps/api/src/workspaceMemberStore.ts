import { WorkspaceMember, WorkspaceRole } from '@prompt-compiler/core';

export interface WorkspaceMemberStore {
  getMember(workspaceId: string, accountId: string): WorkspaceMember | undefined;
  listMembers(workspaceId: string): WorkspaceMember[];
  addMember(workspaceId: string, accountId: string, role: WorkspaceRole): WorkspaceMember;
  updateRole(workspaceId: string, accountId: string, role: WorkspaceRole): WorkspaceMember | undefined;
  removeMember(workspaceId: string, accountId: string): boolean;
}

function memberKey(workspaceId: string, accountId: string): string {
  return `${workspaceId}::${accountId}`;
}

export function createInMemoryWorkspaceMemberStore(): WorkspaceMemberStore {
  const members = new Map<string, WorkspaceMember>();

  return {
    getMember(workspaceId: string, accountId: string): WorkspaceMember | undefined {
      return members.get(memberKey(workspaceId, accountId));
    },

    listMembers(workspaceId: string): WorkspaceMember[] {
      const results: WorkspaceMember[] = [];
      for (const m of members.values()) {
        if (m.workspaceId === workspaceId) {
          results.push(m);
        }
      }
      return results;
    },

    addMember(workspaceId: string, accountId: string, role: WorkspaceRole): WorkspaceMember {
      const member: WorkspaceMember = {
        accountId,
        workspaceId,
        role,
        addedAt: new Date().toISOString()
      };
      members.set(memberKey(workspaceId, accountId), member);
      return member;
    },

    updateRole(workspaceId: string, accountId: string, role: WorkspaceRole): WorkspaceMember | undefined {
      const key = memberKey(workspaceId, accountId);
      const existing = members.get(key);
      if (!existing) return undefined;
      const updated: WorkspaceMember = { ...existing, role, addedAt: new Date().toISOString() };
      members.set(key, updated);
      return updated;
    },

    removeMember(workspaceId: string, accountId: string): boolean {
      return members.delete(memberKey(workspaceId, accountId));
    }
  };
}
