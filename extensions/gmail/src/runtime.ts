import type { PluginRuntime } from "clawdbot/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setGmailRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getGmailRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Gmail runtime not initialized");
  }
  return runtime;
}
