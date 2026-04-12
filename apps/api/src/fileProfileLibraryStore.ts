import fs from 'node:fs';
import path from 'node:path';
import { HostedProfileLibraryDocument, UpsertHostedProfileLibraryInput, upsertHostedProfileLibraryDocument } from '@prompt-compiler/core';
import { HostedProfileLibraryStore } from './profileLibraryStore';

function safeKey(accountId: string, workspaceId?: string): string {
  // Sanitize to allow only filesystem-safe characters.
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const suffix = workspaceId ? `__${sanitize(workspaceId)}` : '';
  return `${sanitize(accountId)}${suffix}.json`;
}

/**
 * A file-backed HostedProfileLibraryStore with atomic writes.
 * Each account/workspace scope is stored as a JSON file in `dir`.
 * Writes use write-to-tmp + rename to avoid partial-write corruption.
 * Suitable for single-process local API runs.
 */
export function createFileHostedProfileLibraryStore(dir: string): HostedProfileLibraryStore {
  fs.mkdirSync(dir, { recursive: true });

  function filePath(accountId: string, workspaceId?: string): string {
    return path.join(dir, safeKey(accountId, workspaceId));
  }

  function read(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined {
    const fp = filePath(accountId, workspaceId);
    if (!fs.existsSync(fp)) {
      return undefined;
    }
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      return JSON.parse(raw) as HostedProfileLibraryDocument;
    } catch {
      return undefined;
    }
  }

  function write(doc: HostedProfileLibraryDocument): void {
    const fp = filePath(doc.accountId, doc.workspaceId);
    const tmp = `${fp}.tmp`;
    // Atomic write: write to .tmp then rename so readers never see a partial file.
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf-8');
    fs.renameSync(tmp, fp);
  }

  return {
    get(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined {
      return read(accountId, workspaceId);
    },
    upsert(input: UpsertHostedProfileLibraryInput): HostedProfileLibraryDocument {
      const existing = read(input.accountId, input.workspaceId);
      const next = upsertHostedProfileLibraryDocument(existing, input);
      write(next);
      return next;
    },
    list(accountId: string): HostedProfileLibraryDocument[] {
      const prefix = safeKey(accountId, undefined).replace(/\.json$/, '');
      const results: HostedProfileLibraryDocument[] = [];
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (!entry.endsWith('.json')) continue;
          // Match files belonging to this accountId (exact match or with workspace suffix).
          const stem = entry.slice(0, -5);
          if (stem === prefix || stem.startsWith(`${prefix}__`)) {
            const doc = read(accountId, stem === prefix ? undefined : stem.slice(prefix.length + 2));
            if (doc) results.push(doc);
          }
        }
      } catch {
        // Directory read failure — return empty rather than throwing.
      }
      return results;
    }
  };
}

