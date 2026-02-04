/**
 * Experience Capture Tool
 *
 * Manually capture a significant experience as a Meridia experiential record.
 * This allows the agent to deliberately record moments it deems important,
 * beyond the automatic hook-based capture system.
 *
 * Writes to both JSONL (primary) and SQLite (secondary) via the dual-write
 * storage layer.
 */

import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { MeridiaExperienceRecord } from "../../meridia/types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

// ── Schema ──────────────────────────────────────────────────────────

const ExperienceCaptureSchema = Type.Object({
  topic: Type.String({
    description:
      "What this experience is about. A brief description of the moment, " +
      "interaction, or realization being captured. Example: 'breakthrough in debugging session'",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "Why this experience is significant. What makes it worth preserving " +
        "for future sessions. Example: 'discovered a novel approach to async error handling'",
    }),
  ),
  significance: Type.Optional(
    Type.Number({
      description:
        "Significance score from 0.0 to 1.0. How important this experience is. " +
        "Default: 0.8. Use 0.9+ for critical moments, 0.6-0.8 for notable moments.",
    }),
  ),
  tool_name: Type.Optional(
    Type.String({
      description:
        "The tool involved in this experience, if any. " +
        "Example: 'exec', 'write', 'message'. Default: 'experience_capture' (manual capture).",
    }),
  ),
  session_key: Type.Optional(
    Type.String({
      description: "Session key to associate with this record. Auto-detected if not provided.",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description:
        "Additional context about the experience. Free-form text that provides " +
        "background or detail. This becomes searchable in FTS.",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional tags for categorization. Example: ['debugging', 'relationship', 'creative']",
    }),
  ),
});

// ── Tool Factory ────────────────────────────────────────────────────

export function createExperienceCaptureTool(opts?: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  return {
    label: "ExperienceCapture",
    name: "experience_capture",
    description:
      "Manually capture a significant experience as a Meridia experiential continuity record. " +
      "Use this to deliberately preserve important moments, insights, breakthroughs, errors, " +
      "or relationship interactions that should persist across sessions. " +
      "Records are stored in both JSONL and SQLite for search and reconstitution. " +
      "The automatic capture hook handles routine tool results — use this for " +
      "deliberate, agent-initiated captures of moments the agent recognizes as significant.",
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

      // Validate significance score
      const significance =
        rawSignificance !== undefined ? Math.max(0, Math.min(1, rawSignificance)) : 0.8;

      try {
        const { appendExperientialRecord, dateKeyUtc, resolveMeridiaDir } =
          await import("../../meridia/storage.js");

        const recordId = crypto.randomUUID();
        const now = new Date().toISOString();
        const meridiaDir = resolveMeridiaDir(opts?.config);
        const dateKey = dateKeyUtc(new Date());
        const recordPath = path.join(meridiaDir, "records", "experiential", `${dateKey}.jsonl`);

        // Build the record data with topic, context, and tags
        const recordData: Record<string, unknown> = {
          topic,
          ...(context ? { context } : {}),
          ...(tags && tags.length > 0 ? { tags } : {}),
        };

        const record: MeridiaExperienceRecord = {
          id: recordId,
          ts: now,
          sessionKey,
          sessionId: undefined,
          runId: undefined,
          tool: {
            name: toolName,
            callId: `manual-${recordId.slice(0, 8)}`,
            meta: "manual_capture",
            isError: false,
          },
          data: {
            args: recordData,
            result: reason ? { reason } : undefined,
          },
          evaluation: {
            kind: "heuristic",
            score: significance,
            recommendation: "capture",
            reason: reason ?? `Manual capture: ${topic}`,
          },
        };

        // Write via dual-write (JSONL primary + SQLite secondary)
        await appendExperientialRecord(recordPath, record, opts?.config);

        return jsonResult({
          success: true,
          recordId,
          timestamp: now,
          topic,
          significance,
          reason: record.evaluation.reason,
          sessionKey: sessionKey ?? null,
          storagePath: recordPath,
          note:
            "Experience captured and stored. It will be searchable via experience_search " +
            "and available for future session reconstitution.",
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
