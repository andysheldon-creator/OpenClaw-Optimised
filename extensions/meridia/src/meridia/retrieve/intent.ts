/**
 * Retrieval Intent Parser
 *
 * Parses search queries and reconstitution options into a structured
 * retrieval intent for the hybrid retriever.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type RetrievalIntent = {
  /** Free-text query */
  query?: string;
  /** Time window for results */
  timeWindow?: { from: string; to: string };
  /** Session scope */
  sessionKey?: string;
  /** Tool filter */
  toolName?: string;
  /** Minimum significance */
  minScore?: number;
  /** Maximum results per source */
  maxResults: number;
  /** Tag filter */
  tag?: string;
  /** Emotional filter (e.g. "felt like frustrated") */
  emotionalFilter?: {
    emotions?: string[];
    minIntensity?: number;
    engagementQuality?: string;
  };
};

// ────────────────────────────────────────────────────────────────────────────
// Intent builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a retrieval intent for reconstitution (session bootstrap).
 */
export function buildReconstitutionIntent(params: {
  lookbackHours: number;
  minScore: number;
  maxResults: number;
  sessionKey?: string;
}): RetrievalIntent {
  const now = new Date();
  const from = new Date(now.getTime() - params.lookbackHours * 60 * 60 * 1000);

  return {
    timeWindow: { from: from.toISOString(), to: now.toISOString() },
    minScore: params.minScore,
    maxResults: params.maxResults,
    sessionKey: params.sessionKey,
  };
}

/**
 * Build a retrieval intent from search tool parameters.
 */
export function buildSearchIntent(params: {
  query?: string;
  sessionKey?: string;
  toolName?: string;
  minScore?: number;
  from?: string;
  to?: string;
  limit?: number;
  tag?: string;
}): RetrievalIntent {
  return {
    query: params.query,
    timeWindow:
      params.from || params.to
        ? {
            from: params.from ?? "1970-01-01",
            to: params.to ?? new Date().toISOString(),
          }
        : undefined,
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    minScore: params.minScore,
    maxResults: params.limit ?? 20,
    tag: params.tag,
  };
}
