import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolFactory,
} from "../../src/plugins/types.js";
import {
  createOpenSSHSessionTool,
  createExecuteSSHCommandTool,
  createCloseSSHSessionTool,
  createListSSHSessionsTool,
  cleanupSSHSessions,
} from "./src/ssh-tools.js";

export default function register(api: OpenClawPluginApi) {
  // Register all SSH tools
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createOpenSSHSessionTool(api) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true }
  );

  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createExecuteSSHCommandTool(api) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true }
  );

  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createCloseSSHSessionTool(api) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true }
  );

  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createListSSHSessionsTool(api) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true }
  );

  // Register cleanup handler
  if (api.runtime) {
    // Hook into the runtime shutdown process if available
    process.on("beforeExit", () => {
      cleanupSSHSessions().catch((err) => {
        console.error("Error cleaning up SSH sessions:", err);
      });
    });

    process.on("SIGINT", () => {
      cleanupSSHSessions()
        .catch((err) => {
          console.error("Error cleaning up SSH sessions:", err);
        })
        .finally(() => {
          process.exit(0);
        });
    });

    process.on("SIGTERM", () => {
      cleanupSSHSessions()
        .catch((err) => {
          console.error("Error cleaning up SSH sessions:", err);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}
