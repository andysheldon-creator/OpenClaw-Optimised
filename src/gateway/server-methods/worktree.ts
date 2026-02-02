import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateWorktreeListParams,
  validateWorktreeReadParams,
  validateWorktreeWriteParams,
  validateWorktreeDeleteParams,
  validateWorktreeMoveParams,
  validateWorktreeMkdirParams,
  type WorktreeListParams,
  type WorktreeListResult,
  type WorktreeReadParams,
  type WorktreeReadResult,
  type WorktreeWriteParams,
  type WorktreeWriteResult,
  type WorktreeDeleteParams,
  type WorktreeDeleteResult,
  type WorktreeMoveParams,
  type WorktreeMoveResult,
  type WorktreeMkdirParams,
  type WorktreeMkdirResult,
  type WorktreeFileEntry,
} from "../protocol/index.js";
import { validateAndResolvePath, getAndValidateWorkspace, getFileStats } from "./worktree-utils.js";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const worktreeHandlers: GatewayRequestHandlers = {
  "worktree.list": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeListParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.list params: ${formatValidationErrors(validateWorktreeListParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeListParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath, normalizedPath } = validateAndResolvePath(
        workspaceRoot,
        request.path || "/",
      );

      // Check that the path exists and is a directory
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_A_DIRECTORY, "Path is not a directory"),
        );
        return;
      }

      // Read directory contents
      const dirents = await fs.readdir(absolutePath, { withFileTypes: true });

      // Filter and process entries
      const entries: WorktreeFileEntry[] = [];

      for (const dirent of dirents) {
        // Skip hidden files unless requested
        if (!request.includeHidden && dirent.name.startsWith(".")) {
          continue;
        }

        const entryAbsPath = path.join(absolutePath, dirent.name);
        const entryRelPath = path.join(normalizedPath, dirent.name);

        try {
          const entry = await getFileStats(entryAbsPath, entryRelPath);
          entries.push(entry);

          // If recursive, process subdirectories
          if (request.recursive && dirent.isDirectory()) {
            const subResult = await listRecursive(
              workspaceRoot,
              entryRelPath,
              request.includeHidden || false,
            );
            entries.push(...subResult);
          }
        } catch {
          // Skip entries that can't be stat'd (permissions, etc.)
          continue;
        }
      }

      const result: WorktreeListResult = {
        path: normalizedPath,
        entries,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
      }
    }
  },

  "worktree.read": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeReadParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.read params: ${formatValidationErrors(validateWorktreeReadParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeReadParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath, normalizedPath } = validateAndResolvePath(workspaceRoot, request.path);

      // Check that the path exists and is a file
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_A_FILE, "Path is not a file"));
        return;
      }

      // Check file size
      const maxBytes = request.maxBytes || DEFAULT_MAX_FILE_SIZE;
      if (stats.size > maxBytes) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.FILE_TOO_LARGE, `File exceeds ${maxBytes} bytes`),
        );
        return;
      }

      // Read file content
      const encoding = request.encoding || "utf8";
      let content: string;

      if (encoding === "base64") {
        const buffer = await fs.readFile(absolutePath);
        content = buffer.toString("base64");
      } else {
        try {
          content = await fs.readFile(absolutePath, "utf8");
        } catch (error) {
          if ((error as Error).message?.includes("invalid")) {
            respond(
              false,
              undefined,
              errorShape(ErrorCodes.INVALID_ENCODING, "File contains invalid UTF-8"),
            );
            return;
          }
          throw error;
        }
      }

      // TODO: Apply redaction (deferred to later phase)
      const redacted = false;

      const result: WorktreeReadResult = {
        path: normalizedPath,
        content,
        encoding,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        redacted,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          respond(false, undefined, errorShape(ErrorCodes.FILE_NOT_FOUND, "File not found"));
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
        }
      }
    }
  },

  "worktree.write": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeWriteParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.write params: ${formatValidationErrors(validateWorktreeWriteParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeWriteParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath, normalizedPath } = validateAndResolvePath(workspaceRoot, request.path);

      // Check if file already exists
      let fileExists = false;
      try {
        await fs.stat(absolutePath);
        fileExists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      // Handle overwrite check
      const overwrite = request.overwrite !== false; // Default to true
      if (fileExists && !overwrite) {
        respond(false, undefined, errorShape(ErrorCodes.FILE_EXISTS, "File already exists"));
        return;
      }

      // Create parent directories if needed
      const createDirs = request.createDirs !== false; // Default to true
      if (createDirs) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      } else {
        // Verify parent exists
        try {
          const parentStat = await fs.stat(path.dirname(absolutePath));
          if (!parentStat.isDirectory()) {
            respond(
              false,
              undefined,
              errorShape(ErrorCodes.PARENT_NOT_FOUND, "Parent is not a directory"),
            );
            return;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            respond(false, undefined, errorShape(ErrorCodes.PARENT_NOT_FOUND, "Parent not found"));
            return;
          }
          throw error;
        }
      }

      // Write the file
      const encoding = request.encoding || "utf8";
      if (encoding === "base64") {
        const buffer = Buffer.from(request.content, "base64");
        await fs.writeFile(absolutePath, buffer);
      } else {
        await fs.writeFile(absolutePath, request.content, "utf8");
      }

      // Get final stats
      const stats = await fs.stat(absolutePath);

      const result: WorktreeWriteResult = {
        path: normalizedPath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        created: !fileExists,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOSPC") {
          respond(false, undefined, errorShape(ErrorCodes.DISK_FULL, "No space left on device"));
        } else if (nodeError.code === "EACCES") {
          respond(false, undefined, errorShape(ErrorCodes.PERMISSION_DENIED, "Permission denied"));
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
        }
      }
    }
  },

  "worktree.delete": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeDeleteParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.delete params: ${formatValidationErrors(validateWorktreeDeleteParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeDeleteParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath, normalizedPath } = validateAndResolvePath(workspaceRoot, request.path);

      // Prevent deletion of workspace root
      if (absolutePath === workspaceRoot) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.CANNOT_DELETE_ROOT, "Cannot delete workspace root"),
        );
        return;
      }

      // Check that the path exists
      const stats = await fs.stat(absolutePath);
      const kind = stats.isDirectory() ? ("dir" as const) : ("file" as const);

      // For directories, check if recursive is needed
      if (stats.isDirectory()) {
        const recursive = request.recursive || false;
        if (!recursive) {
          const entries = await fs.readdir(absolutePath);
          if (entries.length > 0) {
            respond(
              false,
              undefined,
              errorShape(ErrorCodes.DIRECTORY_NOT_EMPTY, "Directory not empty"),
            );
            return;
          }
        }
        await fs.rm(absolutePath, { recursive: true, force: false });
      } else {
        await fs.unlink(absolutePath);
      }

      const result: WorktreeDeleteResult = {
        path: normalizedPath,
        kind,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          respond(false, undefined, errorShape(ErrorCodes.FILE_NOT_FOUND, "Path not found"));
        } else if (nodeError.code === "EACCES") {
          respond(false, undefined, errorShape(ErrorCodes.PERMISSION_DENIED, "Permission denied"));
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
        }
      }
    }
  },

  "worktree.move": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeMoveParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.move params: ${formatValidationErrors(validateWorktreeMoveParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeMoveParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath: fromAbsPath, normalizedPath: fromNormPath } = validateAndResolvePath(
        workspaceRoot,
        request.fromPath,
      );
      const { absolutePath: toAbsPath, normalizedPath: toNormPath } = validateAndResolvePath(
        workspaceRoot,
        request.toPath,
      );

      // Check source exists
      const sourceStats = await fs.stat(fromAbsPath);

      // Check if destination exists
      let destExists = false;
      try {
        await fs.stat(toAbsPath);
        destExists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      const overwrite = request.overwrite || false;
      if (destExists && !overwrite) {
        respond(false, undefined, errorShape(ErrorCodes.DESTINATION_EXISTS, "Destination exists"));
        return;
      }

      // Prevent moving a directory into itself
      if (sourceStats.isDirectory() && toAbsPath.startsWith(fromAbsPath + path.sep)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.CANNOT_MOVE_TO_SUBDIRECTORY, "Cannot move directory into itself"),
        );
        return;
      }

      // Create parent directory of destination if needed
      await fs.mkdir(path.dirname(toAbsPath), { recursive: true });

      // Remove destination if it exists and overwrite is enabled
      if (destExists && overwrite) {
        await fs.rm(toAbsPath, { recursive: true, force: true });
      }

      // Perform the move
      await fs.rename(fromAbsPath, toAbsPath);

      const result: WorktreeMoveResult = {
        fromPath: fromNormPath,
        toPath: toNormPath,
        overwritten: destExists && overwrite,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          respond(false, undefined, errorShape(ErrorCodes.SOURCE_NOT_FOUND, "Source not found"));
        } else if (nodeError.code === "EACCES") {
          respond(false, undefined, errorShape(ErrorCodes.PERMISSION_DENIED, "Permission denied"));
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
        }
      }
    }
  },

  "worktree.mkdir": async ({ params, respond }) => {
    const p = params;
    if (!validateWorktreeMkdirParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid worktree.mkdir params: ${formatValidationErrors(validateWorktreeMkdirParams.errors)}`,
        ),
      );
      return;
    }

    const request = p as WorktreeMkdirParams;

    try {
      const workspaceRoot = await getAndValidateWorkspace(request.agentId);
      const { absolutePath, normalizedPath } = validateAndResolvePath(workspaceRoot, request.path);

      // Check if already exists
      let alreadyExists = false;
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
          alreadyExists = true;
        } else {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.FILE_EXISTS, "A file exists at this path"),
          );
          return;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      if (!alreadyExists) {
        const recursive = request.recursive !== false; // Default to true
        await fs.mkdir(absolutePath, { recursive });
      }

      const result: WorktreeMkdirResult = {
        path: normalizedPath,
        created: !alreadyExists,
      };

      respond(true, result);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        respond(false, undefined, error as ReturnType<typeof errorShape>);
      } else {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          respond(false, undefined, errorShape(ErrorCodes.PARENT_NOT_FOUND, "Parent not found"));
        } else if (nodeError.code === "EACCES") {
          respond(false, undefined, errorShape(ErrorCodes.PERMISSION_DENIED, "Permission denied"));
        } else {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
        }
      }
    }
  },
};

// Helper for recursive listing
async function listRecursive(
  workspaceRoot: string,
  relativePath: string,
  includeHidden: boolean,
): Promise<WorktreeFileEntry[]> {
  const { absolutePath } = validateAndResolvePath(workspaceRoot, relativePath);
  const entries: WorktreeFileEntry[] = [];

  try {
    const dirents = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const dirent of dirents) {
      if (!includeHidden && dirent.name.startsWith(".")) {
        continue;
      }

      const entryAbsPath = path.join(absolutePath, dirent.name);
      const entryRelPath = path.join(relativePath, dirent.name);

      try {
        const entry = await getFileStats(entryAbsPath, entryRelPath);
        entries.push(entry);

        if (dirent.isDirectory()) {
          const subEntries = await listRecursive(workspaceRoot, entryRelPath, includeHidden);
          entries.push(...subEntries);
        }
      } catch {
        // Skip entries that can't be accessed
        continue;
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return entries;
}
