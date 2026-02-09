import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { GraphService } from "../../services/memory/GraphService.js";
import { jsonResult, readStringParam } from "./common.js";

const RecallSchema = Type.Object({
  query: Type.String({
    description: "The topic or fact you want to recall from your long-term memory.",
  }),
});

export function createRecallMemoryTool(graphService: GraphService): AnyAgentTool {
  return {
    label: "Recall Memory (Graphiti)",
    name: "recall_memory",
    description:
      "Explicitly search your neural graph for facts, preferences, or past events. Use this when you need specific relational information.",
    parameters: RecallSchema,
    execute: async (_toolCallId, params) => {
      const query = readStringParam(params, "query", { required: true });
      const sessionId = params.sessionId || "default-session";

      try {
        const memories = await graphService.searchFacts(sessionId, query);

        if (!memories || memories.length === 0) {
          return jsonResult({
            message: "No specific long-term memories found for this query in the neural graph.",
            results: [],
          });
        }

        const formattedResults = memories.map((m: { content?: string }) => m.content);

        return jsonResult({
          message: `Found ${memories.length} relevant memories in the neural graph.`,
          memories: formattedResults,
        });
      } catch (error) {
        return jsonResult({
          error: "Failed to query neural graph.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
