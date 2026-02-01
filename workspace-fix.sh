#!/bin/bash
ssh root@synology '/usr/local/bin/docker stop openclaw-gateway'

# Update the source file on Synology
ssh root@synology 'cat > /docker/openclaw/src/agents/workspace.ts' << 'ENDFILE'
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "url";

import { isSubagentSessionKey } from "../routing/session-key.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { resolveUserPath } from "../utils.js";

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(homedir(), ".openclaw", \`workspace-\${profile}\`);
  }
  return path.join(homedir(), ".openclaw", "workspace");
}

export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
export const DEFAULT_SOUL_FILENAME = "SOUL.md";
export const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_USER_FILENAME = "USER.md";
export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
export const DEFAULT_MEMORY_FILENAME = "MEMORY.md";
export const DEFAULT_MEMORY_ALT_FILENAME = "memory.md";

function resolveTemplateDir(): string {
  // Try multiple paths to handle different build/deployment scenarios
  const candidates: string[] = [];

  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));

    // Case 1: Bundled flat output (e.g., /app/dist/*.mjs)
    // Look for /app/docs/reference/templates
    candidates.push(
      path.resolve(moduleDir, "..", "docs", "reference", "templates"),
    );

    // Case 2: Nested dist structure (e.g., /app/dist/agents/workspace.js)
    // Look for /app/docs/reference/templates
    candidates.push(
      path.resolve(moduleDir, "..", "..", "docs", "reference", "templates"),
    );

    // Case 3: Dev mode (src/agents/workspace.ts)
    // Look for docs/reference/templates relative to project root
    candidates.push(
      path.resolve(moduleDir, "..", "..", "docs", "reference", "templates"),
    );
  } catch {
    // Ignore URL parsing errors
  }

  // Return the first path that exists
  for (const candidate of candidates) {
    if (fssync.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: use the original path computation (may not exist)
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../docs/reference/templates",
  );
}

const TEMPLATE_DIR = resolveTemplateDir();
END FILE

echo "File updated. Now rebuilding Docker image..."
ssh root@synology 'cd /docker/openclaw && /usr/local/bin/docker build --no-cache -t openclaw:local .'

echo "Build complete. Restarting container..."
ssh root@synology 'cd /docker/openclaw && /usr/local/bin/docker compose up -d'
