import { randomUUID } from "node:crypto";

import { definePlugin } from "clawdbot/plugin-sdk";

import { createReceiptStore } from "./src/store.js";

export default definePlugin({
  id: "action-receipts",
  register(api) {
    const store = createReceiptStore();

    api.on("before_tool_call", async (event, ctx) => {
      const anyCtx = ctx as any;
      store.setPending(
        {
          sessionKey: ctx.sessionKey,
          toolName: event.toolName,
          toolCallId: typeof anyCtx.toolCallId === "string" ? anyCtx.toolCallId : undefined,
        },
        {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          params: event.params,
        },
      );
    });

    api.on("tool_result_persist", async (event, ctx) => {
      const toolName = event.toolName ?? ctx.toolName;
      if (!toolName) return;

      const receipt = store.takePending({
        sessionKey: ctx.sessionKey,
        toolName,
        toolCallId: ctx.toolCallId ?? event.toolCallId,
      });
      if (!receipt) return;

      const message: any = { ...event.message };
      message.actionReceipt = {
        id: receipt.id,
        createdAt: receipt.createdAt,
        toolName,
        params: receipt.params,
      };

      return { message };
    });

    api.on("after_tool_call", async (_event, _ctx) => {
      // Receipt persistence happens at tool_result_persist.
    });
  },
});
