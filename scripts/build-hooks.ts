/**
 * Compile bundled hook handlers from TypeScript to JavaScript.
 *
 * The main tsdown build doesn't include hook handlers, so this script
 * compiles them separately with esbuild. Heavy/native dependencies are
 * marked external since they're already available in the main bundle.
 */

import { build } from "esbuild";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HOOKS_SRC = "src/hooks/bundled";
const HOOKS_DIST = "dist/hooks/bundled";

const EXTERNAL_DEPS = [
  "@anthropic-ai/*",
  "openai",
  "grammy",
  "discord.js",
  "@slack/*",
  "playwright*",
  "@napi-rs/*",
  "node-llama-cpp",
];

async function buildHooks() {
  const hooks = readdirSync(HOOKS_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let built = 0;
  let failed = 0;

  for (const hook of hooks) {
    const entry = join(HOOKS_SRC, hook, "handler.ts");
    if (!existsSync(entry)) continue;

    try {
      await build({
        entryPoints: [entry],
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        outfile: join(HOOKS_DIST, hook, "handler.js"),
        external: EXTERNAL_DEPS,
        logLevel: "warning",
      });
      console.log(`✓ ${hook}`);
      built++;
    } catch (err) {
      console.error(`✗ ${hook}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nHooks: ${built} built, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

buildHooks();
