import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * Validates and resolves a path within an agent's workspace.
 * Prevents path traversal attacks and ensures the path stays within workspace bounds.
 */
export function validateAndResolvePath(
  workspaceRoot: string,
  requestedPath: string,
): { absolutePath: string; normalizedPath: string } {
  // Normalize the requested path
  const normalizedPath = path.normalize(requestedPath || "/");

  // Check for suspicious patterns
  if (normalizedPath.includes("..")) {
    throw errorShape(ErrorCodes.INVALID_PATH, "Path contains '..' segments");
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(workspaceRoot, normalizedPath.replace(/^\/+/, ""));

  // Ensure the resolved path is still within workspace bounds
  if (!absolutePath.startsWith(workspaceRoot)) {
    throw errorShape(ErrorCodes.PATH_OUTSIDE_WORKSPACE, "Path escapes workspace boundary");
  }

  return { absolutePath, normalizedPath };
}

/**
 * Gets the workspace root for an agent and verifies it exists.
 */
export async function getAndValidateWorkspace(agentId: string): Promise<string> {
  const cfg = loadConfig();
  const workspaceRoot = resolveAgentWorkspaceDir(cfg, agentId);

  try {
    const stats = await fs.stat(workspaceRoot);
    if (!stats.isDirectory()) {
      throw errorShape(ErrorCodes.WORKSPACE_NOT_FOUND, "Workspace path is not a directory");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw errorShape(ErrorCodes.WORKSPACE_NOT_FOUND, `Workspace not found at ${workspaceRoot}`);
    }
    throw error;
  }

  return workspaceRoot;
}

/**
 * Gets file/directory stats in a format suitable for the API.
 */
export async function getFileStats(absolutePath: string, relativePath: string) {
  const stats = await fs.stat(absolutePath);
  return {
    path: relativePath,
    name: path.basename(absolutePath),
    kind: stats.isDirectory() ? ("dir" as const) : ("file" as const),
    sizeBytes: stats.isFile() ? stats.size : undefined,
    modifiedAt: stats.mtime.toISOString(),
    permissions: formatPermissions(stats.mode),
  };
}

/**
 * Formats Unix permissions as a readable string (e.g., "rw-r--r--").
 */
function formatPermissions(mode: number): string {
  const perms = mode & 0o777;
  const owner = formatPermissionTriplet((perms >> 6) & 0o7);
  const group = formatPermissionTriplet((perms >> 3) & 0o7);
  const other = formatPermissionTriplet(perms & 0o7);
  return `${owner}${group}${other}`;
}

function formatPermissionTriplet(bits: number): string {
  return `${bits & 0o4 ? "r" : "-"}${bits & 0o2 ? "w" : "-"}${bits & 0o1 ? "x" : "-"}`;
}
