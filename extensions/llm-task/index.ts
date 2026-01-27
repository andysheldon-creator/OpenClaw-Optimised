import type { ClawdbrainPluginApi } from "../../src/plugins/types.js";

import { createLlmTaskTool } from "./src/llm-task-tool.js";

export default function register(api: ClawdbrainPluginApi) {
  api.registerTool(createLlmTaskTool(api), { optional: true });
}
