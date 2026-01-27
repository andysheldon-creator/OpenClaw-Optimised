/**
 * Automations CLI registration.
 */

import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import {
  registerAutomationsListCommand,
  registerAutomationsHistoryCommand,
} from "./register.automations-simple.js";

export function registerAutomationsCli(program: Command) {
  const automations = program
    .command("automations")
    .alias("automation")
    .description("Manage automations (via Gateway)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/automations", "docs.clawdbrain.bot/cli/automations")}\n`,
    );

  registerAutomationsListCommand(automations);
  registerAutomationsHistoryCommand(automations);
}
