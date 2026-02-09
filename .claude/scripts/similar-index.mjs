#!/usr/bin/env node
// similar-index.mjs — Build a semantic search index from project history
// Sources: git log, .changeset/*.md, BOARD.md, .claude/tasks/**/*.md
// Output: .claude/similar-index.json

import { pipeline } from "@xenova/transformers";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
const OUTPUT = join(ROOT, ".claude", "similar-index.json");
const MODEL = "Xenova/all-MiniLM-L6-v2";

function collectSources() {
  const entries = [];

  // 1. git log (last 200 commits)
  try {
    const log = execSync('git log --oneline -200 --no-merges --format="%h %s"', {
      encoding: "utf-8",
      cwd: ROOT,
    });
    for (const line of log.trim().split("\n")) {
      if (!line) {
        continue;
      }
      const hash = line.slice(0, 7);
      const msg = line.slice(8);
      entries.push({ source: "commit", id: hash, text: msg });
    }
  } catch {
    console.warn("  warn: git log failed, skipping commits");
  }

  // 2. .changeset/*.md
  const csDir = join(ROOT, ".changeset");
  if (existsSync(csDir)) {
    for (const f of readdirSync(csDir)) {
      if (!f.endsWith(".md") || f === "README.md") {
        continue;
      }
      const content = readFileSync(join(csDir, f), "utf-8");
      const body = content.replace(/^---[\s\S]*?---\n*/, "").trim();
      if (body) {
        entries.push({ source: "changeset", id: f, text: body });
      }
    }
  }

  // 3. BOARD.md
  const boardPaths = [
    join(ROOT, ".shared", "BOARD.md"),
    resolve(ROOT, "..", "shared", "BOARD.md"),
    join(process.env.HOME || "", ".openclaw", "worktrees", "shared", "BOARD.md"),
  ];
  for (const bp of boardPaths) {
    if (existsSync(bp)) {
      const board = readFileSync(bp, "utf-8");
      const sections = board.split(/(?=^## )/m).filter((s) => s.trim());
      for (const sec of sections) {
        const firstLine = sec.split("\n")[0].trim();
        entries.push({
          source: "board",
          id: firstLine.slice(0, 80),
          text: sec.slice(0, 500).trim(),
        });
      }
      break;
    }
  }

  // 4. .claude/tasks/**/*.md
  const tasksDir = join(ROOT, ".claude", "tasks");
  if (existsSync(tasksDir)) {
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) {
          walk(join(dir, f.name));
        } else if (f.name.endsWith(".md")) {
          const content = readFileSync(join(dir, f.name), "utf-8").slice(0, 500).trim();
          if (content) {
            entries.push({ source: "task", id: f.name, text: content });
          }
        }
      }
    };
    walk(tasksDir);
  }

  return entries;
}

async function main() {
  console.log("Collecting sources...");
  const entries = collectSources();
  console.log(`  Found ${entries.length} entries`);

  if (entries.length === 0) {
    console.log("  No entries to index.");
    writeFileSync(OUTPUT, JSON.stringify([], null, 2));
    return;
  }

  console.log(`Loading model: ${MODEL} (first run downloads ~22MB)...`);
  const extractor = await pipeline("feature-extraction", MODEL);

  console.log("Generating embeddings...");
  const indexed = [];
  const batchSize = 32;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const texts = batch.map((e) => e.text);
    const output = await extractor(texts, { pooling: "mean", normalize: true });

    for (let j = 0; j < batch.length; j++) {
      indexed.push({
        source: batch[j].source,
        id: batch[j].id,
        text: batch[j].text,
        embedding: Array.from(output[j].data),
      });
    }

    if (i + batchSize < entries.length) {
      process.stdout.write(`  ${Math.min(i + batchSize, entries.length)}/${entries.length}\r`);
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(indexed));
  console.log(`\nIndex saved: ${OUTPUT} (${indexed.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
