import type { AgentTool } from "@mariozechner/pi-agent-core";
import { toToolDefinitions } from "../pi-tool-definition-adapter.js";
import { normalizeToolName } from "../tool-policy.js";

// We always pass tools via `customTools` so our policy filtering, sandbox integration,
// and extended toolset remain consistent across providers.
type AnyAgentTool = AgentTool;

export function splitSdkTools(options: {
  tools: AnyAgentTool[];
  sandboxEnabled: boolean;
  excludeTools?: string[];
}): {
  builtInTools: AnyAgentTool[];
  customTools: ReturnType<typeof toToolDefinitions>;
} {
  let { tools } = options;
  // (#6) Filter out excluded tools to reduce API payload token usage.
  // Each excluded tool saves ~100-200 tokens per request.
  if (options.excludeTools && options.excludeTools.length > 0) {
    const excluded = new Set(
      options.excludeTools.map((t) => normalizeToolName(t.trim().toLowerCase())),
    );
    tools = tools.filter((tool) => !excluded.has(normalizeToolName(tool.name.toLowerCase())));
  }
  return {
    builtInTools: [],
    customTools: toToolDefinitions(tools),
  };
}
