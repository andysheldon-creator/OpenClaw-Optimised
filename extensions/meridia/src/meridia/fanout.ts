// Async graph and vector fanout for Meridia records.
// Extracted from compaction handler to enable per-capture dispatch.

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import {
  GraphitiClient,
  extractEntitiesFromEpisodes,
  writeEntitiesToGraph,
} from "openclaw/plugin-sdk";
import type { MeridiaDbBackend } from "./db/backend.js";
import type { MeridiaExperienceRecord } from "./types.js";

export type FanoutTarget = "graphiti" | "vector";

export type FanoutResult = {
  target: FanoutTarget;
  success: boolean;
  error?: string;
  durationMs: number;
};

type EpisodePayload = {
  id: string;
  text: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  timeRange?: { from: string; to: string };
  ts?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Graph Fanout
// ────────────────────────────────────────────────────────────────────────────

function buildGraphitiClient(cfg: OpenClawConfig): GraphitiClient | null {
  if (!cfg.memory?.graphiti?.enabled) {
    return null;
  }
  return new GraphitiClient({
    serverHost: cfg.memory.graphiti.serverHost,
    servicePort: cfg.memory.graphiti.servicePort,
    apiKey: cfg.memory.graphiti.apiKey,
    timeoutMs: cfg.memory.graphiti.timeoutMs ?? 30_000,
  });
}

/** Push a single record to the knowledge graph. */
export async function fanoutToGraph(
  record: MeridiaExperienceRecord,
  cfg: OpenClawConfig | undefined,
): Promise<FanoutResult> {
  const start = performance.now();
  if (!cfg) {
    return { target: "graphiti", success: false, error: "No config", durationMs: 0 };
  }

  const client = buildGraphitiClient(cfg);
  if (!client) {
    return {
      target: "graphiti",
      success: false,
      error: "Graphiti not enabled",
      durationMs: performance.now() - start,
    };
  }

  try {
    const text = [record.content?.topic, record.content?.summary, record.content?.context]
      .filter(Boolean)
      .join("\n\n");

    if (!text.trim()) {
      return {
        target: "graphiti",
        success: false,
        error: "No text content to push",
        durationMs: performance.now() - start,
      };
    }

    const result = await client.ingestEpisodes({
      episodes: [
        {
          id: record.id,
          kind: "episode" as const,
          text,
          tags: record.content?.tags ?? [],
          provenance: {
            source: "meridia-capture",
            temporal: { observedAt: record.ts, updatedAt: record.ts },
          },
          metadata: {
            toolName: record.tool?.name,
            sessionKey: record.session?.key,
            score: record.capture.score,
          },
        },
      ],
      traceId: `capture-${record.id.slice(0, 8)}`,
    });

    return {
      target: "graphiti",
      success: result.ok !== false,
      error: result.ok === false ? (result.error ?? "Unknown error") : undefined,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      target: "graphiti",
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    };
  }
}

/** Push a batch of episodes to the knowledge graph (used by compaction). */
export async function fanoutBatchToGraph(
  episodes: EpisodePayload[],
  cfg: OpenClawConfig | undefined,
  groupId: string = "meridia-experiences",
): Promise<FanoutResult> {
  const start = performance.now();
  if (!cfg) {
    return { target: "graphiti", success: false, error: "No config", durationMs: 0 };
  }

  const client = buildGraphitiClient(cfg);
  if (!client) {
    return {
      target: "graphiti",
      success: false,
      error: "Graphiti not enabled",
      durationMs: performance.now() - start,
    };
  }

  try {
    const contentObjects = episodes.map((ep) => ({
      id: ep.id,
      kind: "episode" as const,
      text: ep.text,
      tags: ep.tags ?? [],
      provenance: {
        source: "meridia-compaction",
        temporal: {
          observedAt: ep.timeRange?.from ?? ep.ts,
          updatedAt: ep.ts,
        },
      },
      metadata: { groupId, ...ep.metadata },
    }));

    const result = await client.ingestEpisodes({
      episodes: contentObjects,
      traceId: `compaction-${crypto.randomUUID().slice(0, 8)}`,
    });

    if (!result.ok) {
      return {
        target: "graphiti",
        success: false,
        error: result.error ?? "Unknown Graphiti error",
        durationMs: performance.now() - start,
      };
    }

    // Entity extraction (best-effort)
    if (cfg.memory?.entityExtraction?.enabled !== false) {
      try {
        const entityContent = contentObjects.map((c) => ({
          id: c.id,
          kind: c.kind,
          text: c.text,
        }));
        const entityCfg = cfg.memory?.entityExtraction;
        const extraction = extractEntitiesFromEpisodes(entityContent, {
          enabled: entityCfg?.enabled,
          minTextLength: entityCfg?.minTextLength,
          maxEntitiesPerEpisode: entityCfg?.maxEntitiesPerEpisode,
        });

        if (extraction.entities.length > 0) {
          const writeResult = await writeEntitiesToGraph({
            entities: extraction.entities,
            relations: extraction.relations,
            client,
          });
          if (writeResult.warnings.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
              `[fanout] Entity extraction warnings: ${writeResult.warnings.map((w: { message: string }) => w.message).join("; ")}`,
            );
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[fanout] Entity extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { target: "graphiti", success: true, durationMs: performance.now() - start };
  } catch (err) {
    return {
      target: "graphiti",
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Vector Fanout
// ────────────────────────────────────────────────────────────────────────────

/** Dispatch a record for embedding + vector indexing. */
export async function fanoutToVector(
  record: MeridiaExperienceRecord,
  _cfg: OpenClawConfig | undefined,
  backend: MeridiaDbBackend,
): Promise<FanoutResult> {
  const start = performance.now();
  const sqliteBackend = backend as MeridiaDbBackend & {
    vecAvailable?: boolean;
    insertEmbedding?: (id: string, embedding: Float32Array) => Promise<boolean>;
  };

  if (!sqliteBackend.vecAvailable || !sqliteBackend.insertEmbedding) {
    return {
      target: "vector",
      success: false,
      error: "Vector support not available",
      durationMs: performance.now() - start,
    };
  }

  // Embedding generation is deferred to the caller; this is a placeholder
  // for when an embedding model is integrated.
  return {
    target: "vector",
    success: false,
    error: "Embedding generation not yet implemented",
    durationMs: performance.now() - start,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Fire-and-Forget Dispatch
// ────────────────────────────────────────────────────────────────────────────

/** Fire-and-forget wrapper: logs errors, never throws. */
export function dispatchFanout(fn: () => Promise<FanoutResult>, label: string): void {
  fn().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[fanout:${label}] dispatch error: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
