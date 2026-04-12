export interface StoredReviewArtifactSummary {
  workspaceId?: string;
  status?: string;
}

export function reviewArtifactName(bundleId: string): string {
  return `review-${bundleId}.json`;
}

export function parseStoredReviewArtifact(raw: string): StoredReviewArtifactSummary | undefined {
  try {
    const parsed = JSON.parse(raw) as { workspaceId?: unknown; status?: unknown; result?: { workspaceId?: unknown; status?: unknown } };
    const source = typeof parsed.result === 'object' && parsed.result ? parsed.result : parsed;

    return {
      workspaceId: typeof source.workspaceId === 'string' ? source.workspaceId : undefined,
      status: typeof source.status === 'string' ? source.status : undefined
    };
  } catch {
    return undefined;
  }
}
