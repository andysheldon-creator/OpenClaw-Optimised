import type { ClawdbrainPluginApi } from "clawdbrain/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbrain/plugin-sdk";

import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbrainPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
