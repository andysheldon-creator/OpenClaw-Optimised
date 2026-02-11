import type { Command } from "commander";
import { CHANNEL_TARGET_DESCRIPTION } from "../../../infra/outbound/channel-target.js";

export type MessageCliHelpers = {
  withMessageBase: (command: Command) => Command;
  withMessageTarget: (command: Command) => Command;
  withRequiredMessageTarget: (command: Command) => Command;
  runMessageAction: (action: string, opts: Record<string, unknown>) => Promise<void>;
};

export function createMessageCliHelpers(
  message: Command,
  messageChannelOptions: string,
): MessageCliHelpers {
  const withMessageBase = (command: Command) =>
    command
      .option("--channel <channel>", `Channel: ${messageChannelOptions}`)
      .option("--account <id>", "Channel account id (accountId)")
      .option("--json", "Output result as JSON", false)
      .option("--dry-run", "Print payload and skip sending", false)
      .option("--verbose", "Verbose logging", false);

  const withMessageTarget = (command: Command) =>
    command.option("-t, --target <dest>", CHANNEL_TARGET_DESCRIPTION);
  const withRequiredMessageTarget = (command: Command) =>
    command.requiredOption("-t, --target <dest>", CHANNEL_TARGET_DESCRIPTION);

  const runMessageAction = async (action: string, opts: Record<string, unknown>) => {
    const { setVerbose, danger } = await import("../../../globals.js");
    const { ensurePluginRegistryLoaded } = await import("../../plugin-registry.js");
    const { createDefaultDeps } = await import("../../deps.js");
    const { defaultRuntime } = await import("../../../runtime.js");
    const { runCommandWithRuntime } = await import("../../cli-utils.js");
    const { messageCommand } = await import("../../../commands/message.js");

    setVerbose(Boolean(opts.verbose));
    ensurePluginRegistryLoaded();
    const deps = createDefaultDeps();
    await runCommandWithRuntime(
      defaultRuntime,
      async () => {
        await messageCommand(
          {
            ...(() => {
              const { account, ...rest } = opts;
              return {
                ...rest,
                accountId: typeof account === "string" ? account : undefined,
              };
            })(),
            action,
          },
          deps,
          defaultRuntime,
        );
      },
      (err) => {
        defaultRuntime.error(danger(String(err)));
        defaultRuntime.exit(1);
      },
    );
  };

  // `message` is only used for `message.help({ error: true })`, keep the
  // command-specific helpers grouped here.
  void message;

  return {
    withMessageBase,
    withMessageTarget,
    withRequiredMessageTarget,
    runMessageAction,
  };
}
