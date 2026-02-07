/**
 * Experience Kit Builder (Component 6)
 *
 * Assembles the canonical ExperienceKit record from capture decision,
 * phenomenology extraction, and optional artifacts.
 */

import crypto from "node:crypto";
import type { MeridiaEvent } from "../event/normalizer.js";
import type {
  ExperienceKit,
  MeridiaExperienceKind,
  Phenomenology,
  ArtifactRef,
  CaptureDecision,
} from "../types.js";
import { sanitizeText } from "../sanitize/redact.js";

const CURRENT_VERSION = 2;

/**
 * Build an ExperienceKit from event + decision + phenomenology.
 */
export function buildExperienceKit(params: {
  event: MeridiaEvent;
  decision: CaptureDecision;
  phenomenology?: Phenomenology;
  topic?: string;
  summary?: string;
  context?: string;
  tags?: string[];
  artifacts?: ArtifactRef[];
}): ExperienceKit {
  const { event, decision, phenomenology, artifacts } = params;

  const kind: MeridiaExperienceKind =
    event.kind === "tool_result"
      ? "tool_result"
      : event.kind === "manual_capture"
        ? "manual"
        : event.kind === "session_boundary"
          ? "session_end"
          : "tool_result";

  const payload = event.payload as { args?: unknown; result?: unknown } | undefined;

  return {
    id: event.id ?? crypto.randomUUID(),
    ts: event.ts,
    kind,
    version: CURRENT_VERSION,
    session: event.session,
    tool: event.tool
      ? {
          name: event.tool.name ?? "unknown",
          callId: event.tool.callId ?? `${kind}-${event.id.slice(0, 8)}`,
          meta: event.tool.meta,
          isError: event.tool.isError ?? false,
        }
      : undefined,
    capture: decision,
    phenomenology,
    content: {
      topic: sanitizeText(params.topic ?? decision.reason),
      summary: sanitizeText(params.summary),
      context: sanitizeText(params.context),
      tags: params.tags,
    },
    artifacts: artifacts && artifacts.length > 0 ? artifacts : undefined,
    raw: payload
      ? {
          toolArgs: payload.args,
          toolResult: payload.result,
        }
      : undefined,
  };
}

/**
 * Convert an ExperienceKit back to a MeridiaExperienceRecord for backward compatibility
 * with the existing SQLite backend insertion logic.
 */
export function kitToLegacyRecord(
  kit: ExperienceKit,
): import("../types.js").MeridiaExperienceRecord {
  // Extract anchor phrases for legacy string[] format
  const anchorPhrases = kit.phenomenology?.anchors?.map((a) => a.phrase);
  const emotions = kit.phenomenology?.emotionalSignature?.primary;

  return {
    id: kit.id,
    ts: kit.ts,
    kind: kit.kind,
    session: kit.session,
    tool: kit.tool,
    capture: {
      score: kit.capture.significance,
      threshold: kit.capture.threshold,
      evaluation: {
        kind: "heuristic",
        score: kit.capture.significance,
        reason: kit.capture.reason,
      },
    },
    content: {
      topic: kit.content.topic,
      summary: kit.content.summary,
      context: kit.content.context,
      tags: kit.content.tags,
      anchors: anchorPhrases,
      facets: {
        emotions,
        uncertainty: kit.phenomenology?.uncertainties,
      },
    },
    phenomenology: kit.phenomenology,
    data: {
      args: kit.raw?.toolArgs,
      result: kit.raw?.toolResult,
    },
  };
}
