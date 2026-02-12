import { Command } from "commander";
import { theme } from "../../terminal/theme.js";
import { registerProgramCommands } from "./command-registry.js";
import { createProgramContext } from "./context.js";
import { configureProgramHelp } from "./help.js";
import { registerPreActionHooks } from "./preaction.js";

export function buildProgram() {
  const program = new Command();
  const ctx = createProgramContext();
  const argv = process.argv;

  configureProgramHelp(program, ctx);
  registerPreActionHooks(program, ctx.programVersion);

  // Catch --key/--api-key usage early to provide a helpful hint (often mistaken for provider-specific flags)
  program.option("--key <value>", "Shorthand for API key (not supported directly)", {
    hidden: true,
  });
  program.option("--api-key <value>", "Shorthand for API key (not supported directly)", {
    hidden: true,
  });

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.key || opts.apiKey) {
      console.warn(
        theme.warn(
          `\n[openclaw] Warning: --key and --api-key are not supported global options. If you are trying to set an API key during onboard, use --anthropic-api-key (or --openai-api-key, etc) instead.\n`,
        ),
      );
    }
  });

  registerProgramCommands(program, ctx, argv);

  return program;
}
