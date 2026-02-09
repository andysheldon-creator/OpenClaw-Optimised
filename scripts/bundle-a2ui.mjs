#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const HASH_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

function onError(message) {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
  if (message) {
    console.error(message);
  }
  process.exit(1);
}

// Docker builds exclude vendor/apps via .dockerignore.
// In that environment we must keep the prebuilt bundle.
async function checkSourcesExist() {
  try {
    await fs.access(A2UI_RENDERER_DIR);
    await fs.access(A2UI_APP_DIR);
    return true;
  } catch {
    return false;
  }
}

async function walk(entryPath, files = []) {
  try {
    const st = await fs.stat(entryPath);
    if (st.isDirectory()) {
      const entries = await fs.readdir(entryPath);
      for (const entry of entries) {
        await walk(path.join(entryPath, entry), files);
      }
    } else {
      files.push(entryPath);
    }
  } catch {
    // Skip files that can't be accessed
  }
  return files;
}

async function computeHash() {
  const INPUT_PATHS = [
    path.join(ROOT_DIR, "package.json"),
    path.join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  const files = [];
  for (const input of INPUT_PATHS) {
    await walk(input, files);
  }

  // Normalize paths for cross-platform consistency
  function normalize(p) {
    return p.split(path.sep).join("/");
  }

  files.sort((a, b) => normalize(a).localeCompare(normalize(b)));

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalize(path.relative(ROOT_DIR, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

async function main() {
  try {
    // Check if sources exist
    const sourcesExist = await checkSourcesExist();
    if (!sourcesExist) {
      console.log("A2UI sources missing; keeping prebuilt bundle.");
      process.exit(0);
    }

    // Compute current hash
    const currentHash = await computeHash();

    // Check if bundle is up to date
    try {
      const previousHash = await fs.readFile(HASH_FILE, "utf-8");
      const outputExists = await fs
        .access(OUTPUT_FILE)
        .then(() => true)
        .catch(() => false);

      if (previousHash.trim() === currentHash && outputExists) {
        console.log("A2UI bundle up to date; skipping.");
        process.exit(0);
      }
    } catch {
      // Hash file doesn't exist, continue with build
    }

    // Run TypeScript compilation
    console.log("Compiling TypeScript...");
    execSync(`pnpm -s exec tsc -p "${A2UI_RENDERER_DIR}/tsconfig.json"`, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    // Run Rolldown bundling
    console.log("Bundling with Rolldown...");
    execSync(`rolldown -c "${A2UI_APP_DIR}/rolldown.config.mjs"`, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    // Save new hash
    await fs.mkdir(path.dirname(HASH_FILE), { recursive: true });
    await fs.writeFile(HASH_FILE, currentHash);

    console.log("A2UI bundle completed successfully.");
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

void main();
