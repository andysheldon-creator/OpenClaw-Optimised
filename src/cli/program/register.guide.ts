import type { Command } from "commander";
import { runGuideCommand } from "../../commands/guide.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";

export function registerGuideCommand(program: Command) {
  program
    .command("guide")
    .description("Show starter tasks to help you get started with OpenClaw")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/start/getting-started", "docs.openclaw.ai/start/getting-started")}\n`,
    )
    .action(async () => {
      await runGuideCommand();
    });
}
