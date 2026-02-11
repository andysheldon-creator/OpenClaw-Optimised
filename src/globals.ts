import { getLogger, isFileLogLevelEnabled } from "./logging/logger.js";
import { theme } from "./terminal/theme.js";

let globalVerbose = false;
let globalYes = false;

export function setVerbose(v: boolean) {
  globalVerbose = v;
}

export function isVerbose() {
  return globalVerbose;
}

export function shouldLogVerbose() {
  return globalVerbose || isFileLogLevelEnabled("debug");
}

export function logVerbose(message: string) {
  if (!shouldLogVerbose()) {
    return;
  }
  try {
    getLogger().debug({ message }, "verbose");
  } catch {
    // ignore logger failures to avoid breaking verbose printing
  }
  if (!globalVerbose) {
    return;
  }
  console.log(theme.muted(message));
}

export function logVerboseConsole(message: string) {
  if (!globalVerbose) {
    return;
  }
  console.log(theme.muted(message));
}

export function setYes(v: boolean) {
  globalYes = v;
}

export function isYes() {
  return globalYes;
}

export const success = (...args: Parameters<typeof theme.success>) => theme.success(...args);
export const warn = (...args: Parameters<typeof theme.warn>) => theme.warn(...args);
export const info = (...args: Parameters<typeof theme.info>) => theme.info(...args);
export const danger = (...args: Parameters<typeof theme.error>) => theme.error(...args);
