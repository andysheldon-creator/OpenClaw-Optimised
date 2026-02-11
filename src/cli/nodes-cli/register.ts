import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";

export async function registerNodesCli(program: Command) {
  const nodes = program
    .command("nodes")
    .description("Manage gateway-owned node pairing")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/nodes", "docs.openclaw.ai/cli/nodes")}\n`,
    );

  const { registerNodesStatusCommands } = await import("./register.status.js");
  const { registerNodesPairingCommands } = await import("./register.pairing.js");
  const { registerNodesInvokeCommands } = await import("./register.invoke.js");
  const { registerNodesNotifyCommand } = await import("./register.notify.js");
  const { registerNodesCanvasCommands } = await import("./register.canvas.js");
  const { registerNodesCameraCommands } = await import("./register.camera.js");
  const { registerNodesScreenCommands } = await import("./register.screen.js");
  const { registerNodesLocationCommands } = await import("./register.location.js");

  registerNodesStatusCommands(nodes);
  registerNodesPairingCommands(nodes);
  registerNodesInvokeCommands(nodes);
  registerNodesNotifyCommand(nodes);
  registerNodesCanvasCommands(nodes);
  registerNodesCameraCommands(nodes);
  registerNodesScreenCommands(nodes);
  registerNodesLocationCommands(nodes);
}
