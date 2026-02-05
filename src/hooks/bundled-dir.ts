import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBundledHooksDir(): string | undefined {
  const override = process.env.OPENCLAW_BUNDLED_HOOKS_DIR?.trim();
  if (override) {
    return override;
  }

  // bun --compile: ship a sibling `hooks/bundled/` next to the executable.
  try {
    const execDir = path.dirname(process.execPath);
    const sibling = path.join(execDir, "hooks", "bundled");
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  // npm/dist: resolve `<root>/dist/hooks/bundled` relative to this module (flattened dist).
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const distBundled = path.join(moduleDir, "hooks", "bundled");
    if (fs.existsSync(distBundled)) {
      return distBundled;
    }
  } catch {
    // ignore
  }

  // dev: resolve `<root>/src/hooks/bundled` relative to dist/ (dist flattens src/).
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(moduleDir, "..");
    const srcBundled = path.join(root, "src", "hooks", "bundled");
    if (fs.existsSync(srcBundled)) {
      return srcBundled;
    }
  } catch {
    // ignore
  }

  return undefined;
}
