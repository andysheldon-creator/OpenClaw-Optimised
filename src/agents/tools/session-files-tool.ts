import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { listFiles } from "../../sessions/files/storage.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { jsonResult, readStringParam } from "./common.js";

const SessionFilesListSchema = Type.Object({
  sessionId: Type.String({ description: "Session ID to list files for" }),
});

export function createSessionFilesListTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const cfg = options.config;
  if (!cfg) {
    return null;
  }
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  return {
    label: "Session Files List",
    name: "session_files_list",
    description: "List all files stored for a session",
    parameters: SessionFilesListSchema,
    execute: async (_toolCallId, params) => {
      const sessionId = readStringParam(params, "sessionId", { required: true });
      try {
        const files = await listFiles({ sessionId, agentId });
        return jsonResult({ files });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ files: [], error: message });
      }
    },
  };
}
