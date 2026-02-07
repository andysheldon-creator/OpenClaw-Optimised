import type { MeridiaDbBackend, RecordQueryResult } from "./meridia/db/backend.js";
import { isMeridiaUri, resolveKitUri } from "./meridia/kit/resolver.js";

// Types duck-typed to match core MemorySearchManager interface

type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory";
  citation?: string;
};

type MemoryProviderStatus = {
  backend: "builtin" | "qmd";
  provider: string;
  custom?: Record<string, unknown>;
};

type MemoryEmbeddingProbeResult = { ok: boolean; error?: string };

function buildMeridiaSnippet(result: RecordQueryResult): string {
  const r = result.record;
  const parts: string[] = [];
  if (r.content?.topic) {
    parts.push(r.content.topic);
  }
  if (r.content?.summary) {
    parts.push(r.content.summary);
  }
  if (r.content?.context) {
    parts.push(r.content.context);
  }
  // Include phenomenology in snippet when available
  if (r.phenomenology?.emotionalSignature?.primary?.length) {
    parts.push(`[${r.phenomenology.emotionalSignature.primary.join(", ")}]`);
  }
  if (r.phenomenology?.engagementQuality) {
    parts.push(`(${r.phenomenology.engagementQuality})`);
  }
  if (parts.length === 0 && r.kind) {
    parts.push(`[${r.kind}]`);
  }
  return parts.join(" — ").slice(0, 700);
}

export class MeridiaSearchAdapter {
  constructor(private backend: MeridiaDbBackend) {}

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const results = await this.backend.searchRecords(query, {
      limit: opts?.maxResults ?? 6,
      minScore: opts?.minScore,
    });
    return results.map((r) => ({
      path: `meridia://${r.record.id}`,
      startLine: 0,
      endLine: 0,
      score: r.rank ?? r.record.capture.score ?? 0.5,
      snippet: buildMeridiaSnippet(r),
      source: "memory" as const,
      citation: `[meridia:${r.record.id}]`,
    }));
  }

  /**
   * Resolve meridia:// URIs to rendered experience kit text.
   * This makes stored experience kits inspectable via the virtual FS.
   */
  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const { relPath } = params;

    // Check for meridia:// URI scheme
    if (isMeridiaUri(relPath)) {
      const result = await resolveKitUri(relPath, this.backend);
      if (result) {
        return result;
      }
    }

    // Also handle bare IDs (e.g. from search results that strip the scheme)
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidLike.test(relPath)) {
      const result = await resolveKitUri(`meridia://${relPath}`, this.backend);
      if (result) {
        return result;
      }
    }

    return { text: "", path: "" };
  }

  async status(): Promise<MemoryProviderStatus> {
    const stats = await this.backend.getStats();
    return {
      backend: "builtin",
      provider: "meridia",
      custom: {
        type: "meridia",
        recordCount: stats.recordCount,
        traceCount: stats.traceCount,
        sessionCount: stats.sessionCount,
      },
    };
  }

  async sync(): Promise<void> {
    // no-op
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    return { ok: true };
  }

  async probeVectorAvailability(): Promise<boolean> {
    const sqliteBackend = this.backend as MeridiaDbBackend & { vecAvailable?: boolean };
    return sqliteBackend.vecAvailable ?? false;
  }

  async close(): Promise<void> {
    await this.backend.close();
  }
}
