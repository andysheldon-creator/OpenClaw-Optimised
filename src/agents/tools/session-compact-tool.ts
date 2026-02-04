import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import {
  loadSessionStore,
  resolveStorePath,
  updateSessionStore,
  type SessionEntry,
} from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { compactEmbeddedPiRun } from "../pi-embedded-runner/runs.js";
import { readStringParam } from "./common.js";

const SessionCompactToolSchema = Type.Object({
  instructions: Type.Optional(Type.String({ minLength: 1 })),
});

export function createSessionCompactTool(opts?: {
  agentSessionKey?: string;
  agentSessionId?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  return {
    label: "Session Compact",
    name: "session_compact",
    description:
      "Trigger semantic session compaction (equivalent to /compact). Use when conversation history is getting large or before topic switches.",
    parameters: SessionCompactToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const instructions = readStringParam(params, "instructions")?.trim() || undefined;

      const sessionKey = opts?.agentSessionKey?.trim();
      if (!sessionKey) {
        throw new Error("session_compact requires agentSessionKey");
      }
      const sessionId = opts?.agentSessionId?.trim();
      if (!sessionId) {
        return {
          content: [
            {
              type: "text",
              text: "session_compact is unavailable (missing sessionId). Use /compact instead.",
            },
          ],
          details: { ok: false, compacted: false, reason: "missing sessionId" },
        };
      }

      const cfg = opts?.config ?? loadConfig();
      const result = await compactEmbeddedPiRun(sessionId, instructions);

      if (result.ok && result.compacted && result.result?.summary) {
        // Best-effort: bump compactionCount for UI/status; ignore failures.
        try {
          const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
          const storePath = resolveStorePath(cfg.session?.store, { agentId });
          const store = loadSessionStore(storePath);
          const entry = store[sessionKey];
          const nextCount = (entry?.compactionCount ?? 0) + 1;
          const updates: Partial<SessionEntry> = {
            compactionCount: nextCount,
            updatedAt: Date.now(),
          };
          if (result.result.tokensAfter && result.result.tokensAfter > 0) {
            updates.totalTokens = result.result.tokensAfter;
            updates.inputTokens = undefined;
            updates.outputTokens = undefined;
          }
          await updateSessionStore(storePath, (next) => {
            next[sessionKey] = { ...(next[sessionKey] ?? {}), ...updates };
          });
        } catch {
          // Ignore store update failures.
        }

        enqueueSystemEvent("Session compacted.", { sessionKey });

        const tokensLine =
          typeof result.result.tokensBefore === "number"
            ? `Tokens before: ${result.result.tokensBefore}${
                typeof result.result.tokensAfter === "number"
                  ? `; after: ${result.result.tokensAfter}`
                  : ""
              }`
            : undefined;

        const text = [
          "Session compaction complete.",
          tokensLine,
          "",
          "Summary:",
          result.result.summary,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text", text }],
          details: result,
        };
      }

      const reason = result.reason?.trim() || (result.ok ? "not compacted" : "error");
      return {
        content: [
          {
            type: "text",
            text: `Session compaction did not run: ${reason}. You can try /compact.`,
          },
        ],
        details: result,
      };
    },
  };
}
