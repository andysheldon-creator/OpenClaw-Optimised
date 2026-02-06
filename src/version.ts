import fs from "node:fs";
import { createRequire } from "node:module";

declare const __OPENCLAW_VERSION__: string | undefined;

let cachedVersion: string | null = null;
let versionCacheTimestamp = 0;
const VERSION_CACHE_TTL_MS = 5000; // Cache for 5 seconds to allow version updates

function readVersionFromPackageJson(): string | null {
  try {
    // Use fs.readFileSync instead of require() to bypass Node.js module cache
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("../package.json");
    const pkgContent = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function readVersionFromBuildInfo(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const candidates = ["../build-info.json", "./build-info.json"];
    for (const candidate of candidates) {
      try {
        const buildInfoPath = require.resolve(candidate);
        const buildInfoContent = fs.readFileSync(buildInfoPath, "utf-8");
        const info = JSON.parse(buildInfoContent) as { version?: string };
        if (info.version) {
          return info.version;
        }
      } catch {
        // ignore missing candidate
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getVersion(): string {
  const now = Date.now();
  const cacheAge = now - versionCacheTimestamp;

  // Return cached version if still fresh
  if (cachedVersion !== null && cacheAge < VERSION_CACHE_TTL_MS) {
    return cachedVersion;
  }

  // Cache expired or never set - refresh it
  versionCacheTimestamp = now;
  cachedVersion =
    (typeof __OPENCLAW_VERSION__ === "string" && __OPENCLAW_VERSION__) ||
    process.env.OPENCLAW_BUNDLED_VERSION ||
    readVersionFromPackageJson() ||
    readVersionFromBuildInfo() ||
    "0.0.0";

  return cachedVersion;
}

// Single source of truth for the current OpenClaw version.
// - Embedded/bundled builds: injected define or env var.
// - Dev/npm builds: package.json (re-read every 5 seconds to pick up git updates).
// For backwards compatibility, VERSION calls getVersion() but it's evaluated once at module load.
// Callers that need fresh version info should call getVersion() directly.
export const VERSION = getVersion();
