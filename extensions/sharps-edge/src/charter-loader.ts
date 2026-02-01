/**
 * SHARPS EDGE - Charter Context Loader
 *
 * Injects project charter, build status, and task queue into
 * the agent's context via the before_agent_start hook.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { SharpsEdgeConfig } from "./types.js";

/**
 * Read a file from the workspace, returning empty string if missing.
 */
async function readWorkspaceFile(workspaceDir: string, relativePath: string): Promise<string> {
  try {
    return await fs.readFile(path.join(workspaceDir, relativePath), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Truncate content to a max length with a marker.
 */
function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const head = content.slice(0, Math.floor(maxChars * 0.8));
  return head + "\n\n[...truncated, read full file for details...]";
}

/**
 * Register the charter loader on the plugin API.
 * Injects project context into every agent turn via prependContext.
 */
export function registerCharterLoader(
  api: OpenClawPluginApi,
  cfg: SharpsEdgeConfig,
): void {
  const projectDir = cfg.projectDir ?? "projects/SHARPS-EDGE";

  api.on(
    "before_agent_start",
    async (_event, ctx) => {
      const workspaceDir = ctx.workspaceDir ?? api.resolvePath("~/.openclaw/workspace");

      // Load project files in parallel
      const [charter, buildStatus, tasks] = await Promise.all([
        readWorkspaceFile(workspaceDir, `${projectDir}/CHARTER.md`),
        readWorkspaceFile(workspaceDir, `${projectDir}/BUILD_STATUS.md`),
        readWorkspaceFile(workspaceDir, `${projectDir}/TASKS.md`),
      ]);

      // Only inject if we have charter content
      if (!charter) {
        api.logger.warn("sharps-edge: No charter found, skipping context injection");
        return;
      }

      // Build context with truncation to stay within token budget
      const maxPerFile = 4000;
      const sections: string[] = [
        "<sharps-edge-project-context>",
        "",
        "## Active Project Charter",
        truncate(charter, maxPerFile),
        "",
      ];

      if (buildStatus) {
        sections.push("## Current Build Status", truncate(buildStatus, maxPerFile), "");
      }

      if (tasks) {
        sections.push("## Task Queue", truncate(tasks, maxPerFile), "");
      }

      sections.push("</sharps-edge-project-context>");

      const prependContext = sections.join("\n");

      api.logger.info?.(
        `sharps-edge: Injecting project context (${prependContext.length} chars)`,
      );

      return { prependContext };
    },
    { priority: 5 }, // Run before other hooks
  );
}
