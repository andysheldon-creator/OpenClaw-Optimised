/**
 * Test script for Feishu WebSocket connection
 * Run with: bun test_scripts/test_feishu_websocket.ts
 */

import { loadConfig } from "../src/config/config.js";
import { monitorFeishuProvider } from "../src/feishu/monitor.js";

async function main() {
  console.log("Testing Feishu WebSocket connection...\n");

  const cfg = loadConfig();

  const abortController = new AbortController();

  // Stop after 30 seconds for testing
  setTimeout(() => {
    console.log("\n[Test] 30 seconds elapsed, stopping...");
    abortController.abort();
  }, 30_000);

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.log("\n[Test] Received SIGINT, stopping...");
    abortController.abort();
  });

  try {
    await monitorFeishuProvider({
      config: cfg,
      abortSignal: abortController.signal,
      eventMode: "websocket",
      runtime: {
        log: (msg) => console.log(`[LOG] ${msg}`),
        error: (msg) => console.error(`[ERR] ${msg}`),
        exit: (code) => process.exit(code),
      },
      onMessage: async (ctx) => {
        console.log("\n[Message Received]");
        console.log(`  From: ${ctx.senderId} (${ctx.senderType})`);
        console.log(`  Chat: ${ctx.chatId} (${ctx.chatType})`);
        console.log(`  Text: ${ctx.text}`);
        console.log(`  Mentioned: ${ctx.wasMentioned}`);
        
        // Auto-reply with echo
        try {
          await ctx.reply(`Echo: ${ctx.text}`);
          console.log("  [Reply sent]");
        } catch (err) {
          console.error(`  [Reply failed]: ${err}`);
        }
      },
    });
  } catch (err) {
    if (abortController.signal.aborted) {
      console.log("[Test] Stopped gracefully.");
    } else {
      console.error("[Test] Error:", err);
      process.exit(1);
    }
  }
}

main();
