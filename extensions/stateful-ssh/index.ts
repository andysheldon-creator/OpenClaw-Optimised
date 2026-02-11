import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import {
  createOpenSSHSessionTool,
  createExecuteSSHCommandTool,
  createCloseSSHSessionTool,
  createListSSHSessionsTool,
  cleanupSSHSessions,
} from "./src/ssh-tools.js";

export default function register(api: OpenClawPluginApi) {
  // Register all SSH tools with explicit names
  api.registerTool(
    (ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return [
        createOpenSSHSessionTool(api),
        createExecuteSSHCommandTool(api),
        createCloseSSHSessionTool(api),
        createListSSHSessionsTool(api),
      ];
    },
    {
      names: ["open_ssh_session", "execute_ssh_command", "close_ssh_session", "list_ssh_sessions"],
      optional: true
    }
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
