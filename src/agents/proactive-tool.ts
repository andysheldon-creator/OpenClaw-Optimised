/**
 * Proactive assistance tool for Clawdis agent - meeting prebriefs, conflict detection, and context surfacing.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type Static, type TSchema, Type } from "@sinclair/typebox";

import { createProactiveService, isProactiveEnabled } from "./proactive.js";

type AnyAgentTool = AgentTool<TSchema, unknown>;

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive Tool Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ProactiveToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("get_prebrief"),
    Type.Literal("check_conflicts"),
    Type.Literal("surface_context"),
  ]),
  meetingId: Type.Optional(Type.String()),
  topic: Type.Optional(Type.String()),
  timeRangeMinutes: Type.Optional(Type.Number()),
});

export type ProactiveToolInput = Static<typeof ProactiveToolSchema>;

/**
 * Create the proactive assistance tool for agent use.
 */
export function createProactiveTool(): AnyAgentTool {
  return {
    label: "Proactive Assistant",
    name: "clawdis_proactive",
    description: `Proactively assist with meeting preparation and context surfacing. Use this to:
- Get prebriefs before meetings (attendee info, past discussions, relevant context)
- Check for schedule conflicts in a time range
- Surface relevant context for a topic from memory and past interactions

Actions:
- get_prebrief: Generate a prebrief for an upcoming meeting (requires meetingId or topic)
- check_conflicts: Check for scheduling conflicts in a time range (uses timeRangeMinutes, default 60)
- surface_context: Surface relevant memories and context for a topic (requires topic)

Best practices:
- Use get_prebrief before important meetings for context
- Check conflicts when scheduling new events
- Surface context when discussing topics that may have history`,
    parameters: ProactiveToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as ProactiveToolInput;
      const { action, meetingId, topic, timeRangeMinutes } = params;

      switch (action) {
        case "get_prebrief": {
          if (!meetingId && !topic) {
            return jsonResult({
              error: "validation",
              message: "get_prebrief requires meetingId or topic",
            });
          }

          // Check if proactive is enabled
          if (!isProactiveEnabled()) {
            return jsonResult({
              action: "get_prebrief",
              status: "disabled",
              message: "Proactive assistance is disabled in config",
            });
          }

          // Get proactive service and generate prebrief based on topic
          try {
            const service = await createProactiveService();
            if (!service) {
              return jsonResult({
                action: "get_prebrief",
                status: "unavailable",
                message: "Memory service not available for prebrief generation",
              });
            }

            // Surface relevant memories for the meeting topic
            const searchQuery = topic || meetingId || "";
            const memories = await service.surfaceRelevantMemories(searchQuery, undefined, {
              limit: 5,
              minScore: 0.4,
            });

            // Generate prebrief from memories
            return jsonResult({
              action: "get_prebrief",
              meetingId: meetingId ?? null,
              topic: topic ?? null,
              prebrief: {
                summary: `Context for "${topic || meetingId}"`,
                relevantContext: memories.map((m) => ({
                  content: m.content,
                  category: m.category,
                  relevance: `${(m.score * 100).toFixed(0)}%`,
                })),
                suggestedTalkingPoints: memories
                  .filter((m) => m.category === "reminder" || m.category === "context")
                  .slice(0, 3)
                  .map((m) => m.content.slice(0, 100)),
              },
              status: "success",
            });
          } catch (error) {
            return jsonResult({
              action: "get_prebrief",
              error: "service_error",
              message: String(error),
            });
          }
        }

        case "check_conflicts": {
          const rangeMinutes = timeRangeMinutes ?? 60;

          // TODO: Integrate with calendar service
          return jsonResult({
            action: "check_conflicts",
            timeRangeMinutes: rangeMinutes,
            conflicts: [],
            status: "not_implemented",
            message: "Conflict detection not yet connected to calendar service",
          });
        }

        case "surface_context": {
          if (!topic?.trim()) {
            return jsonResult({
              error: "validation",
              message: "surface_context requires topic",
            });
          }

          // Check if proactive is enabled
          if (!isProactiveEnabled()) {
            return jsonResult({
              action: "surface_context",
              topic,
              memories: [],
              status: "disabled",
              message: "Proactive assistance is disabled in config",
            });
          }

          // Get proactive service and surface memories
          try {
            const service = await createProactiveService();
            if (!service) {
              return jsonResult({
                action: "surface_context",
                topic,
                memories: [],
                status: "unavailable",
                message: "Memory service not available",
              });
            }

            const memories = await service.surfaceRelevantMemories(topic, undefined, {
              limit: 10,
              minScore: 0.4,
            });

            return jsonResult({
              action: "surface_context",
              topic,
              memories: memories.map((m) => ({
                id: m.id,
                content: m.content,
                category: m.category,
                score: m.score,
                createdAt: new Date(m.createdAt).toISOString(),
              })),
              count: memories.length,
              status: "success",
            });
          } catch (error) {
            return jsonResult({
              action: "surface_context",
              topic,
              error: "service_error",
              message: String(error),
            });
          }
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}
