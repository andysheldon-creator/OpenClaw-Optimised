import { existsSync, accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Binary names to search for in PATH.
 * kiro-cli is the primary name, q is an alias.
 */
const CLI_BINARY_NAMES = ["kiro-cli", "q"];

/**
 * Windows executable extensions to check.
 * Empty string is included to check the bare name first.
 */
const WINDOWS_EXTENSIONS = ["", ".cmd", ".bat", ".exe"];

/**
 * Checks if a file exists and is executable.
 * On Windows, existence is sufficient (no X_OK check needed).
 * @param filePath Path to check
 * @returns true if file exists and is executable
 */
function isExecutable(filePath: string): boolean {
  try {
    if (process.platform === "win32") {
      return existsSync(filePath);
    }
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Searches for kiro-cli in the system PATH.
 * On Windows, also checks .cmd, .bat, .exe extensions.
 * @returns Full path to kiro-cli binary, or null if not found
 *
 * @example
 * ```ts
 * const cliPath = findKiroCli();
 * if (cliPath) {
 *   console.log(`Found kiro-cli at: ${cliPath}`);
 * } else {
 *   console.log("kiro-cli not found");
 * }
 * ```
 */
export function findKiroCli(): string | null {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const pathEntries = pathEnv.split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32" ? WINDOWS_EXTENSIONS : [""];

  for (const name of CLI_BINARY_NAMES) {
    for (const dir of pathEntries) {
      for (const ext of extensions) {
        const candidate = join(dir, name + ext);
        if (isExecutable(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

/**
 * Checks if the current environment is WSL2.
 * Reads /proc/version on Linux to detect WSL2.
 * @returns true if running in WSL2
 */
export function isWSL2(): boolean {
  if (process.platform !== "linux") return false;

  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const version = readFileSync("/proc/version", "utf8");
    // WSL2 includes "microsoft" and "WSL2" in /proc/version
    return (
      version.toLowerCase().includes("microsoft") &&
      version.toLowerCase().includes("wsl2")
    );
  } catch {
    return false;
  }
}
