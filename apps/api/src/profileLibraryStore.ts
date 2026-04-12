import { HostedProfileLibraryDocument, UpsertHostedProfileLibraryInput, upsertHostedProfileLibraryDocument } from '@prompt-compiler/core';

export interface HostedProfileLibraryStore {
  get(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined;
  upsert(input: UpsertHostedProfileLibraryInput): HostedProfileLibraryDocument;
  /** List all documents for the given accountId across all workspace scopes. */
  list(accountId: string): HostedProfileLibraryDocument[];
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
    },
    list(accountId: string): HostedProfileLibraryDocument[] {
      const results: HostedProfileLibraryDocument[] = [];
      for (const [k, doc] of documents) {
        if (k.startsWith(`${accountId}::`) || k === `${accountId}::*`) {
          results.push(doc);
        }
      }
      return results;
    }
  };
}
