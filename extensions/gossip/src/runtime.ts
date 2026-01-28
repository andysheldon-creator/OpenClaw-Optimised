import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: unknown = null;
let resolvePath: ((input: string) => string) | null = null;

export function setGossipRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function setGossipResolvePath(fn: (input: string) => string): void {
  resolvePath = fn;
}

export function getGossipRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Gossip runtime not initialized");
  }
  return runtime as PluginRuntime;
}

/** Resolve user path (e.g. ~/.openclaw). Uses API resolvePath when set; otherwise falls back to process.env.HOME. */
export function getGossipResolveUserPath(pathInput: string): string {
  if (resolvePath) {
    return resolvePath(pathInput);
  }
  const trimmed = pathInput.trim();
  if (trimmed.startsWith("~/") || trimmed === "~") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return trimmed === "~" ? home : `${home}${trimmed.slice(1)}`;
  }
  return trimmed;
}
