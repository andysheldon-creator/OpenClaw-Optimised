import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { Type } from "@sinclair/typebox";

import { createReceiptStore } from "./src/store.js";

const configSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  receiptsDir: Type.Optional(Type.String({ description: "Override receipts directory" })),
  includeParams: Type.Optional(Type.Boolean({ default: true })),
});

const plugin = {
  id: "action-receipts",
  name: "Action Receipts",
  description: "Record tool calls as local receipts for debugging and safety audits.",
  configSchema,
  register(api: ClawdbotPluginApi) {
    const store = createReceiptStore({ api });

    api.registerHook(["before_tool_call"], async (event, ctx) => {
      await store.onBeforeToolCall(event, ctx);
      return undefined;
    });

    api.registerHook(["after_tool_call"], async (event, ctx) => {
      await store.onAfterToolCall(event, ctx);
      return undefined;
    });

    api.registerCli((cli) => {
      cli.command(
        "receipts:list",
        "List recent action receipts",
        (yargs) =>
          yargs.option("limit", { type: "number", default: 20 }).option("session", {
            type: "string",
            describe: "Filter by session key",
          }),
        async (argv) => {
          const rows = await store.list({ limit: argv.limit as number, sessionKey: argv.session as any });
          for (const r of rows) {
            // eslint-disable-next-line no-console
            console.log(`${r.createdAt}\t${r.toolName}\t${r.sessionKey ?? ""}\t${r.id}`);
          }
        },
      );

      cli.command(
        "receipts:show <id>",
        "Show a specific receipt",
        (yargs) => yargs.positional("id", { type: "string", demandOption: true }),
        async (argv) => {
          const receipt = await store.read(String(argv.id));
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(receipt, null, 2));
        },
      );
    });
  },
};

export default plugin;
