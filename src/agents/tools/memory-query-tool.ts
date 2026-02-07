import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const MemoryQuerySchema = Type.Object({
  query: Type.String({ description: "Natural language query" }),
  sessionKey: Type.Optional(Type.String({ description: "Session key for attribution" })),
  traceId: Type.Optional(Type.String({ description: "Trace identifier for downstream systems" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results" })),
  filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export function createMemoryQueryTool(): AnyAgentTool {
  return {
    label: "Memory Query",
    name: "memory_query",
    description: "Query the memory pipeline for relevant context.",
    parameters: MemoryQuerySchema,
    execute: async () =>
      jsonResult({
        ok: false,
        tool: "memory_query",
        error: {
          code: "not_configured",
          message: "Memory query pipeline is not configured.",
          retryable: false,
        },
        results: [],
      }),
  };
}
