import { HostedProfileLibraryDocument, UpsertHostedProfileLibraryInput, upsertHostedProfileLibraryDocument } from '@prompt-compiler/core';
import { HostedProfileLibraryStore } from './profileLibraryStore';

// node:sqlite is experimental in Node 22/24 — suppress the warning when importing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDb };

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

const DDL = `
  CREATE TABLE IF NOT EXISTS profile_library_documents (
    account_id  TEXT NOT NULL,
    workspace_id TEXT,
    document    TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (account_id, workspace_id)
  );
`;

/**
 * A SQLite-backed HostedProfileLibraryStore.
 *
 * Uses Node.js built-in node:sqlite (Node 22.5+).
 * Pass ':memory:' for an ephemeral in-process store (useful for testing).
 * Pass a file path for a durable single-file database.
 *
 * All operations are synchronous, matching the HostedProfileLibraryStore
 * interface contract. Suitable for single-process deployments.
 */
export function createSqliteHostedProfileLibraryStore(dbPath: string): HostedProfileLibraryStore & { close(): void } {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const stmtGet = db.prepare(
    'SELECT document FROM profile_library_documents WHERE account_id = ? AND (workspace_id = ? OR (workspace_id IS NULL AND ? IS NULL))'
  );

  const stmtUpsert = db.prepare(`
    INSERT INTO profile_library_documents (account_id, workspace_id, document, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (account_id, workspace_id) DO UPDATE SET
      document = excluded.document,
      updated_at = excluded.updated_at
  `);

  const stmtList = db.prepare(
    'SELECT document FROM profile_library_documents WHERE account_id = ?'
  );

  return {
    get(accountId: string, workspaceId?: string): HostedProfileLibraryDocument | undefined {
      const ws = workspaceId ?? null;
      const row = stmtGet.get(accountId, ws, ws);
      if (!row) return undefined;
      try {
        return JSON.parse(row['document'] as string) as HostedProfileLibraryDocument;
      } catch {
        return undefined;
      }
    },

    upsert(input: UpsertHostedProfileLibraryInput): HostedProfileLibraryDocument {
      const existing = this.get(input.accountId, input.workspaceId);
      const next = upsertHostedProfileLibraryDocument(existing, input);
      stmtUpsert.run(
        next.accountId,
        next.workspaceId ?? null,
        JSON.stringify(next),
        next.updatedAt
      );
      return next;
    },

    list(accountId: string): HostedProfileLibraryDocument[] {
      const rows = stmtList.all(accountId);
      const results: HostedProfileLibraryDocument[] = [];
      for (const row of rows) {
        try {
          results.push(JSON.parse(row['document'] as string) as HostedProfileLibraryDocument);
        } catch {
          // Skip corrupted rows.
        }
      }
      return results;
    },

    close(): void {
      db.close();
    }
  };
}
