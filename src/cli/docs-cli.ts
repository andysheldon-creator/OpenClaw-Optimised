import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerDocsCli(program: Command) {
  program
    .command("docs")
    .description("Search the live OpenClaw docs")
    .argument("[query...]", "Search query")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/docs", "docs.openclaw.ai/cli/docs")}\n`,
    )
    .action(async (queryParts: string[]) => {
      const { runCommandWithRuntime } = await import("./cli-utils.js");
      const { defaultRuntime } = await import("../runtime.js");
      const { docsSearchCommand } = await import("../commands/docs.js");

      await runCommandWithRuntime(defaultRuntime, async () => {
        await docsSearchCommand(queryParts, defaultRuntime);
      });
    });
}
