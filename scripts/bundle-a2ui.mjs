import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const HASH_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

async function walk(entryPath, files = []) {
  try {
    const st = await fs.stat(entryPath);
    if (st.isDirectory()) {
      const entries = await fs.readdir(entryPath);
      for (const entry of entries) {
        await walk(path.join(entryPath, entry), files);
      }
    } else if (st.isFile()) {
      files.push(entryPath);
    }
  } catch (err) {
    // Ignore missing files or directories
  }
  return files;
}

async function computeHash() {
  const inputPaths = [
    path.join(ROOT_DIR, "package.json"),
    path.join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  const files = [];
  for (const input of inputPaths) {
    await walk(input, files);
  }

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

function run(command, args, options = {}) {
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? `${command}.cmd` : command;

  console.log(`Running: ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status || 1);
  }
}

async function main() {
  // Check if A2UI sources exist
  try {
    await fs.access(A2UI_RENDERER_DIR);
    await fs.access(A2UI_APP_DIR);
  } catch (err) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    return;
  }

  const currentHash = await computeHash();
  try {
    const previousHash = await fs.readFile(HASH_FILE, "utf-8");
    const outputExists = await fs.access(OUTPUT_FILE).then(() => true).catch(() => false);

    if (previousHash.trim() === currentHash && outputExists) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  } catch (err) {
    // Hash file missing or other error, continue to build
  }

  console.log("Building A2UI bundle...");

  // tsc build
  run("pnpm", ["exec", "tsc", "-p", path.join(A2UI_RENDERER_DIR, "tsconfig.json")]);

  // rolldown build
  run("pnpm", ["exec", "rolldown", "-c", path.join(A2UI_APP_DIR, "rolldown.config.mjs")]);

  // Update hash file
  await fs.mkdir(path.dirname(HASH_FILE), { recursive: true });
  await fs.writeFile(HASH_FILE, currentHash);
  console.log("A2UI build complete.");
}

main().catch((err) => {
  console.error("A2UI bundling failed.");
  console.error(err);
  process.exit(1);
});
