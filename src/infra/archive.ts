import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";

/**
 * Validates that a resolved path stays within a base directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 *
 * @param baseDir - The allowed base directory (must be absolute)
 * @param targetPath - The path to validate (can be relative or absolute)
 * @returns true if targetPath is within baseDir
 *
 * @example
 * isPathWithinBase("/tmp/foo", "/tmp/foo/bar.txt") // true
 * isPathWithinBase("/tmp/foo", "/tmp/foobar/evil.txt") // false (startsWith bypass)
 * isPathWithinBase("/tmp/foo", "../../etc/passwd") // false
 */
export function isPathWithinBase(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export type ArchiveKind = "tar" | "zip";

export type ArchiveLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

const TAR_SUFFIXES = [".tgz", ".tar.gz", ".tar"];

export function resolveArchiveKind(filePath: string): ArchiveKind | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".zip")) {
    return "zip";
  }
  if (TAR_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return "tar";
  }
  return null;
}

export async function resolvePackedRootDir(extractDir: string): Promise<string> {
  const direct = path.join(extractDir, "package");
  try {
    const stat = await fs.stat(direct);
    if (stat.isDirectory()) {
      return direct;
    }
  } catch {
    // ignore
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (dirs.length !== 1) {
    throw new Error(`unexpected archive layout (dirs: ${dirs.join(", ")})`);
  }
  const onlyDir = dirs[0];
  if (!onlyDir) {
    throw new Error("unexpected archive layout (no package dir found)");
  }
  return path.join(extractDir, onlyDir);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function extractZip(params: { archivePath: string; destDir: string }): Promise<void> {
  const buffer = await fs.readFile(params.archivePath);
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);

  for (const entry of entries) {
    const entryPath = entry.name.replaceAll("\\", "/");
    if (!entryPath || entryPath.endsWith("/")) {
      // Validate directory path doesn't escape destination
      if (!isPathWithinBase(params.destDir, entryPath)) {
        throw new Error(`zip entry escapes destination: ${entry.name}`);
      }
      const dirPath = path.resolve(params.destDir, entryPath);
      await fs.mkdir(dirPath, { recursive: true });
      continue;
    }

    // Validate file path doesn't escape destination (prevents ../../ attacks)
    if (!isPathWithinBase(params.destDir, entryPath)) {
      throw new Error(`zip entry escapes destination: ${entry.name}`);
    }
    const outPath = path.resolve(params.destDir, entryPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await fs.writeFile(outPath, data);
  }
}

export async function extractArchive(params: {
  archivePath: string;
  destDir: string;
  timeoutMs: number;
  logger?: ArchiveLogger;
}): Promise<void> {
  const kind = resolveArchiveKind(params.archivePath);
  if (!kind) {
    throw new Error(`unsupported archive: ${params.archivePath}`);
  }

  const label = kind === "zip" ? "extract zip" : "extract tar";
  if (kind === "tar") {
    await withTimeout(
      tar.x({
        file: params.archivePath,
        cwd: params.destDir,
        // Security: validate tar entries don't escape destination directory
        filter: (entryPath: string) => {
          const normalizedEntry = entryPath.replaceAll("\\", "/");
          // Allow standard tar root entries like "." or "./".
          if (normalizedEntry === "." || normalizedEntry === "./" || normalizedEntry === "") {
            return true;
          }
          if (!isPathWithinBase(params.destDir, normalizedEntry)) {
            throw new Error(`tar entry escapes destination: ${entryPath}`);
          }
          return true;
        },
      }),
      params.timeoutMs,
      label,
    );
    return;
  }

  await withTimeout(extractZip(params), params.timeoutMs, label);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
