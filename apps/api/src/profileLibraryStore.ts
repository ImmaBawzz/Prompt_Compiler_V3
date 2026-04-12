import { HostedProfileLibraryDocument, UpsertHostedProfileLibraryInput, upsertHostedProfileLibraryDocument } from '@prompt-compiler/core';

export interface HostedProfileLibraryStore {
  get(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined;
  upsert(input: UpsertHostedProfileLibraryInput): HostedProfileLibraryDocument;
}

function key(accountId: string, workspaceId?: string): string {
  return `${accountId}::${workspaceId ?? '*'}`;
}

export function createInMemoryHostedProfileLibraryStore(): HostedProfileLibraryStore {
  const documents = new Map<string, HostedProfileLibraryDocument>();

  return {
    get(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined {
      return documents.get(key(accountId, workspaceId));
    },
    upsert(input: UpsertHostedProfileLibraryInput): HostedProfileLibraryDocument {
      const mapKey = key(input.accountId, input.workspaceId);
      const next = upsertHostedProfileLibraryDocument(documents.get(mapKey), input);
      documents.set(mapKey, next);
      return next;
    }
  };
}
