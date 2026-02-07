import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { MemoryIngestDependencies } from "../../memory/pipeline/ingest.js";
import type { AnyAgentTool } from "./common.js";
import { GraphitiClient } from "../../memory/graphiti/client.js";
import { runMemoryIngestionPipeline } from "../../memory/pipeline/ingest.js";
import { jsonResult } from "./common.js";

const MemoryIngestSchema = Type.Object({
  source: Type.Optional(Type.String({ description: "Source label for the ingestion request" })),
  sessionKey: Type.Optional(Type.String({ description: "Session key for attribution" })),
  traceId: Type.Optional(Type.String({ description: "Trace identifier for downstream systems" })),
  items: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.Optional(Type.String()),
        kind: Type.Optional(Type.String()),
        text: Type.Optional(Type.String()),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      { description: "Content items to ingest" },
    ),
  ),
});

export type MemoryIngestToolOptions = {
  config?: OpenClawConfig;
};

/**
 * Build pipeline dependencies from OpenClaw config.
 * Creates a Graphiti client if graphiti is enabled, and passes
 * entity extraction config through.
 */
function buildPipelineDeps(config?: OpenClawConfig): MemoryIngestDependencies {
  const deps: MemoryIngestDependencies = {};

  const graphitiCfg = config?.memory?.graphiti;
  if (graphitiCfg?.enabled) {
    deps.graphiti = new GraphitiClient({
      serverHost: graphitiCfg.serverHost,
      servicePort: graphitiCfg.servicePort,
      apiKey: graphitiCfg.apiKey,
      timeoutMs: graphitiCfg.timeoutMs,
    });
  }

  const entityCfg = config?.memory?.entityExtraction;
  if (entityCfg) {
    deps.entityExtractor = {
      enabled: entityCfg.enabled,
      minTextLength: entityCfg.minTextLength,
      maxEntitiesPerEpisode: entityCfg.maxEntitiesPerEpisode,
    };
  }

  return deps;
}

export function createMemoryIngestTool(options?: MemoryIngestToolOptions): AnyAgentTool {
  return {
    label: "Memory Ingest",
    name: "memory_ingest",
    description: "Ingest structured content into the memory pipeline.",
    parameters: MemoryIngestSchema,
    execute: async (_ctx, input) => {
      const deps = buildPipelineDeps(options?.config);

      const result = await runMemoryIngestionPipeline(
        {
          source: input?.source,
          sessionKey: input?.sessionKey,
          traceId: input?.traceId,
          items: input?.items,
        },
        deps,
      );

      return jsonResult({
        ok: result.ok,
        tool: "memory_ingest",
        runId: result.runId,
        batchId: result.batchId,
        warnings: result.warnings,
        contract: result.contract,
      });
    },
  };
}
