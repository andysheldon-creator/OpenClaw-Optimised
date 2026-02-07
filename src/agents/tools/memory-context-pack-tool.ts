import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const MemoryContextPackSchema = Type.Object({
  query: Type.String({ description: "Natural language query" }),
  sessionKey: Type.Optional(Type.String({ description: "Session key for attribution" })),
  traceId: Type.Optional(Type.String({ description: "Trace identifier for downstream systems" })),
  maxChars: Type.Optional(Type.Number({ description: "Maximum characters for the context pack" })),
  filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export function createMemoryContextPackTool(): AnyAgentTool {
  return {
    label: "Memory Context Pack",
    name: "memory_context_pack",
    description: "Build a compact context pack from memory for downstream prompts.",
    parameters: MemoryContextPackSchema,
    execute: async () =>
      jsonResult({
        ok: false,
        tool: "memory_context_pack",
        error: {
          code: "not_configured",
          message: "Memory context pack pipeline is not configured.",
          retryable: false,
        },
        pack: "",
        sources: [],
      }),
  };
}
