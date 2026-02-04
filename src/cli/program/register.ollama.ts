/**
 * CLI registration for Ollama commands.
 *
 * Registers: moltbot ollama smoke [test]
 */
import type { Command } from "commander";

import { ollamaSmokeCommand } from "../../commands/ollama-smoke.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";
import { parsePositiveIntOrUndefined } from "./helpers.js";

export function registerOllamaCommands(program: Command) {
  const ollama = program
    .command("ollama")
    .description("Ollama-related commands (smoke tests, context management)");

  ollama
    .command("smoke [test]")
    .description("Run Ollama smoke tests (ping, truncate, guard)")
    .option("--json", "Output as JSON", false)
    .option("--native-url <url>", "Native API base URL (default: http://127.0.0.1:11434)")
    .option(
      "--openai-url <url>",
      "OpenAI-compatible API base URL (default: http://127.0.0.1:11434/v1)",
    )
    .option("--model <name>", "Model to use for tests (default: first available)")
    .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Tests:")}\n` +
        `  ping      Check Ollama availability via /api/tags and /v1/models\n` +
        `  truncate  Send 40k tokens, verify Ollama truncates to context window\n` +
        `  guard     Verify OverBudgetError is thrown locally before HTTP call\n`,
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["moltbot ollama smoke", "Run all smoke tests"],
          ["moltbot ollama smoke ping", "Run ping test only"],
          ["moltbot ollama smoke truncate", "Run truncation test only"],
          ["moltbot ollama smoke guard", "Run guard test only"],
          ["moltbot ollama smoke --json", "Output results as JSON"],
          ["moltbot ollama smoke --model llama3.1:8b", "Use specific model"],
        ])}`,
    )
    .action(async (test: string | undefined, opts) => {
      const timeout = parsePositiveIntOrUndefined(opts.timeout);
      if (opts.timeout !== undefined && timeout === undefined) {
        defaultRuntime.error("--timeout must be a positive integer (milliseconds)");
        defaultRuntime.exit(1);
        return;
      }

      await runCommandWithRuntime(defaultRuntime, async () => {
        await ollamaSmokeCommand(
          {
            test,
            json: Boolean(opts.json),
            nativeUrl: opts.nativeUrl as string | undefined,
            openaiUrl: opts.openaiUrl as string | undefined,
            model: opts.model as string | undefined,
            timeout,
          },
          defaultRuntime,
        );
      });
    });
}
