import path from "node:path";

/**
 * Validates that a resolved path stays within a base directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 *
 * NOTE: This helper intentionally returns false for "" and for baseDir itself.
 */
export function isPathWithinBase(baseDir: string, targetPath: string): boolean {
  if (process.platform === "win32") {
    const normalizedBase = path.win32.normalize(path.win32.resolve(baseDir));
    const normalizedTarget = path.win32.normalize(path.win32.resolve(normalizedBase, targetPath));

    // Windows paths are typically case-insensitive.
    const rel = path.win32.relative(normalizedBase.toLowerCase(), normalizedTarget.toLowerCase());
    return rel.length > 0 && !rel.startsWith("..") && !path.win32.isAbsolute(rel);
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}
