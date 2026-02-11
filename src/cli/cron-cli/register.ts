import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";

export async function registerCronCli(program: Command) {
  const cron = program
    .command("cron")
    .description("Manage cron jobs (via Gateway)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/cron", "docs.openclaw.ai/cli/cron")}\n`,
    );

  const { registerCronStatusCommand, registerCronListCommand, registerCronAddCommand } =
    await import("./register.cron-add.js");
  const { registerCronEditCommand } = await import("./register.cron-edit.js");
  const { registerCronSimpleCommands } = await import("./register.cron-simple.js");

  registerCronStatusCommand(cron);
  registerCronListCommand(cron);
  registerCronAddCommand(cron);
  registerCronSimpleCommands(cron);
  registerCronEditCommand(cron);
}
