import type { OpenClawConfig, AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk";
import type { MeridiaExperienceRecord } from "../meridia/types.js";
import { createBackend } from "../meridia/db/index.js";
import { resolveMeridiaDir } from "../meridia/paths.js";

const ExperienceCaptureSchema = Type.Object({
  topic: Type.String({
    description:
      "What this experience is about. A brief description of the moment, interaction, or realization being captured.",
  }),
  reason: Type.Optional(
    Type.String({
      description: "Why this experience is significant.",
    }),
  ),
  significance: Type.Optional(
    Type.Number({
      description: "Significance score from 0.0 to 1.0. Default: 0.8.",
    }),
  ),
  tool_name: Type.Optional(
    Type.String({
      description: "Tool involved, if any. Default: 'experience_capture' (manual capture).",
    }),
  ),
  session_key: Type.Optional(
    Type.String({
      description: "Session key to associate with this record. Auto-detected if not provided.",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description: "Additional context. Becomes searchable.",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional tags for categorization.",
    }),
  ),
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createExperienceCaptureTool(opts?: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool {
  return {
    label: "ExperienceCapture",
    name: "experience_capture",
    description:
      "Manually capture a significant experience as a Meridia experiential continuity record. " +
      "Use this to deliberately preserve important moments, insights, breakthroughs, errors, " +
      "or relationship interactions that should persist across sessions.",
    parameters: ExperienceCaptureSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const topic = readStringParam(params, "topic", { required: true });
      const reason = readStringParam(params, "reason");
      const rawSignificance = readNumberParam(params, "significance");
      const toolName = readStringParam(params, "tool_name") ?? "experience_capture";
      const sessionKey =
        readStringParam(params, "session_key") ?? opts?.agentSessionKey ?? undefined;
      const context = readStringParam(params, "context");
      const tags = Array.isArray(params.tags)
        ? (params.tags as unknown[]).filter((t): t is string => typeof t === "string")
        : undefined;

      const significance = rawSignificance !== undefined ? clamp01(rawSignificance) : 0.8;

      try {
        const recordId = crypto.randomUUID();
        const now = new Date().toISOString();
        const record: MeridiaExperienceRecord = {
          id: recordId,
          ts: now,
          kind: "manual",
          session: { key: sessionKey },
          tool: {
            name: toolName,
            callId: `manual-${recordId.slice(0, 8)}`,
            meta: "manual_capture",
            isError: false,
          },
          capture: {
            score: significance,
            evaluation: {
              kind: "heuristic",
              score: significance,
              reason: reason ?? `Manual capture: ${topic}`,
            },
          },
          content: {
            topic,
            ...(reason ? { summary: reason } : {}),
            ...(context ? { context } : {}),
            ...(tags && tags.length > 0 ? { tags } : {}),
          },
          data: {
            args: { topic, ...(context ? { context } : {}), ...(tags ? { tags } : {}) },
            result: reason ? { reason } : undefined,
          },
        };

        const backend = createBackend({ cfg: opts?.config });
        await backend.insertExperienceRecord(record);

        const meridiaDir = resolveMeridiaDir(opts?.config);

        return jsonResult({
          success: true,
          recordId,
          timestamp: now,
          topic,
          significance,
          reason: record.capture.evaluation.reason,
          sessionKey: sessionKey ?? null,
          meridiaDir,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          error: `Experience capture failed: ${message}`,
        });
      }
    },
  };
}
