import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRootSync } from "../infra/openclaw-root.js";

function resolveExistingDir(paths: string[]): string | undefined {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export type BundledHooksResolveOptions = {
  argv1?: string;
  moduleUrl?: string;
  cwd?: string;
  execPath?: string;
};

export function resolveBundledHooksDir(opts: BundledHooksResolveOptions = {}): string | undefined {
  const override = process.env.OPENCLAW_BUNDLED_HOOKS_DIR?.trim();
  if (override) {
    return override;
  }

  // bun --compile: ship a sibling `hooks/bundled/` next to the executable.
  try {
    const execPath = opts.execPath ?? process.execPath;
    const execDir = path.dirname(execPath);
    const sibling = path.join(execDir, "hooks", "bundled");
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  // npm/dev: resolve from package root (handles flattened dist chunk layout).
  try {
    const packageRoot = resolveOpenClawPackageRootSync({
      argv1: opts.argv1 ?? process.argv[1],
      moduleUrl: opts.moduleUrl ?? import.meta.url,
      cwd: opts.cwd ?? process.cwd(),
    });
    if (packageRoot) {
      const resolved = resolveExistingDir([
        path.join(packageRoot, "dist", "hooks", "bundled"),
        path.join(packageRoot, "src", "hooks", "bundled"),
      ]);
      if (resolved) {
        return resolved;
      }
    }
  } catch {
    // ignore
  }

  // Fallback: walk up from current module and probe common layouts.
  try {
    const moduleUrl = opts.moduleUrl ?? import.meta.url;
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    let cursor = moduleDir;
    for (let depth = 0; depth < 6; depth += 1) {
      const resolved = resolveExistingDir([
        path.join(cursor, "hooks", "bundled"),
        path.join(cursor, "dist", "hooks", "bundled"),
        path.join(cursor, "src", "hooks", "bundled"),
      ]);
      if (resolved) {
        return resolved;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // ignore
  }

  return undefined;
}
