#!/usr/bin/env -S node --import tsx

import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HANDLER_CANDIDATES = ["handler.js", "index.js", "handler.ts", "index.ts"] as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export function getBundledHookPaths(rootDir = projectRoot) {
  const srcBundledDir = path.join(rootDir, "src", "hooks", "bundled");
  const distBundledDir = path.join(rootDir, "dist", "hooks", "bundled");
  return { srcBundledDir, distBundledDir };
}

export async function cleanOutputDir(distBundledDir: string): Promise<void> {
  await fs.rm(distBundledDir, { recursive: true, force: true });
  await fs.mkdir(distBundledDir, { recursive: true });
}

export async function resolveHookEntry(hookDir: string): Promise<string> {
  for (const candidate of HANDLER_CANDIDATES) {
    const candidatePath = path.join(hookDir, candidate);
    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile()) {
        return candidatePath;
      }
    } catch {
      // keep scanning
    }
  }
  throw new Error(`handler.ts/handler.js/index.ts/index.js missing in ${hookDir}`);
}

async function listHookDirs(srcBundledDir: string): Promise<string[]> {
  const entries = await fs.readdir(srcBundledDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(srcBundledDir, entry.name))
    .toSorted((a, b) => a.localeCompare(b));
}

async function assertHookMd(hookDir: string): Promise<string> {
  const hookMdPath = path.join(hookDir, "HOOK.md");
  try {
    const stat = await fs.stat(hookMdPath);
    if (!stat.isFile()) {
      throw new Error("not a file");
    }
    return hookMdPath;
  } catch {
    throw new Error(`HOOK.md missing in ${hookDir}`);
  }
}

export async function buildBundledHooks(params?: {
  srcBundledDir?: string;
  distBundledDir?: string;
}) {
  const defaultPaths = getBundledHookPaths();
  const srcBundledDir = params?.srcBundledDir ?? defaultPaths.srcBundledDir;
  const distBundledDir = params?.distBundledDir ?? defaultPaths.distBundledDir;

  await cleanOutputDir(distBundledDir);

  const hookDirs = await listHookDirs(srcBundledDir);
  if (hookDirs.length === 0) {
    console.warn("[build-bundled-hooks] No bundled hooks found.");
    return;
  }

  for (const hookDir of hookDirs) {
    const hookName = path.basename(hookDir);
    const outDir = path.join(distBundledDir, hookName);
    const outFile = path.join(outDir, "handler.js");
    const hookMdPath = await assertHookMd(hookDir);
    const entryPoint = await resolveHookEntry(hookDir);

    await fs.mkdir(outDir, { recursive: true });
    await build({
      entryPoints: [entryPoint],
      outfile: outFile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      packages: "external",
      logLevel: "silent",
    });
    await fs.copyFile(hookMdPath, path.join(outDir, "HOOK.md"));
    console.log(`[build-bundled-hooks] Built ${hookName}/handler.js + HOOK.md`);
  }
}

async function main() {
  await buildBundledHooks();
  console.log("[build-bundled-hooks] Done");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(`[build-bundled-hooks] ${String(err)}`);
    process.exit(1);
  });
}
