import type { Command } from "commander";
import { gitStatusCommand } from "../../commands/git.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";

export function registerGitCommand(program: Command) {
  const gitCmd = program
    .command("git")
    .description("Git utilities")
    .summary("git status wrapper");

  gitCmd
    .command("status")
    .description("Show the working tree status")
    .option("--json", "Output in JSON format", false)
    .option("--verbose", "Verbose logging", false)
    .action(async (opts) => {
      await gitStatusCommand(
        {
          json: Boolean(opts.json),
          verbose: Boolean(opts.verbose),
        },
        defaultRuntime,
      );
    });
}
