/**
 * File Destination
 *
 * Appends compliance events to a JSONL file.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ComplianceEmitter, ComplianceEvent, FileDestination } from "../types.js";

/**
 * Resolve path with ~ and environment variable expansion
 */
function resolvePath(filePath: string): string {
  let resolved = filePath;

  // Expand ~
  if (resolved.startsWith("~")) {
    resolved = path.join(os.homedir(), resolved.slice(1));
  }

  // Expand environment variables like ${VAR} or $VAR
  resolved = resolved.replace(/\$\{(\w+)\}|\$(\w+)/g, (_, p1, p2) => {
    const varName = p1 || p2;
    return process.env[varName] || "";
  });

  return resolved;
}

export function createFileEmitter(
  config: FileDestination,
  logger?: { warn: (msg: string) => void },
): ComplianceEmitter {
  const filePath = resolvePath(config.path);
  let initialized = false;

  async function ensureDir(): Promise<void> {
    if (initialized) {
      return;
    }
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      initialized = true;
    } catch (err) {
      logger?.warn(`[compliance:file] Failed to create directory: ${String(err)}`);
    }
  }

  async function emit(event: ComplianceEvent): Promise<void> {
    await ensureDir();
    try {
      const line = JSON.stringify(event) + "\n";
      await fs.appendFile(filePath, line, "utf-8");
    } catch (err) {
      logger?.warn(`[compliance:file] Failed to write event: ${String(err)}`);
    }
  }

  return { emit };
}
