import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { theme } from "../../terminal/theme.js";
import { formatDocsLink } from "../../terminal/links.js";
import { formatHelpExamples } from "../help-format.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp-server")
    .description("Start Clawdbot as an MCP server (Model Context Protocol)")
    .option("-v, --verbose", "Enable verbose logging for debugging")
    .option("--version", "Print MCP server version and exit")
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ["clawdbot mcp-server", "Start MCP server with stdio transport."],
  ["clawdbot mcp-server --verbose", "Start with verbose logging for debugging."],
  ["clawdbot mcp-server --version", "Print MCP server version."],
])}

${theme.muted("Docs:")} ${formatDocsLink("/mcp", "docs.clawd.bot/mcp")}`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (opts.version) {
          const { createRequire } = await import("module");
          const require = createRequire(import.meta.url);
          const pkg = require("../../../package.json") as { version: string };
          defaultRuntime.log(`clawdbot-mcp-server ${pkg.version}`);
          return;
        }
        const { startMcpServer } = await import("../../mcp-server/index.js");
        await startMcpServer(opts, defaultRuntime);
      });
    });
}
