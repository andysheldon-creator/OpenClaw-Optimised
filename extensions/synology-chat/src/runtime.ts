import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setSynologyChatRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getSynologyChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Synology Chat runtime not initialized - plugin not registered");
  }
  return runtime;
}

// 導出必要的組件以便正確處理 webhook
export { synologyChatPlugin } from "./channel.js";
