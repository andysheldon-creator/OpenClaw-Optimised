#!/usr/bin/env node
// similar-search.mjs — Search project history by keyword + semantic similarity
// Usage: node .claude/scripts/similar-search.mjs "<query>" [--top N]

import { pipeline } from "@xenova/transformers";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
const INDEX_PATH = join(ROOT, ".claude", "similar-index.json");
const MODEL = "Xenova/all-MiniLM-L6-v2";

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized
}

function keywordSearch(query, entries) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const entry of entries) {
    const lower = (entry.text + " " + entry.id).toLowerCase();
    const matches = terms.filter((t) => lower.includes(t)).length;
    if (matches > 0) {
      results.push({ ...entry, score: matches / terms.length, method: "keyword" });
    }
  }
  return results.toSorted((a, b) => b.score - a.score);
}

async function semanticSearch(query, entries, extractor) {
  const output = await extractor(query, { pooling: "mean", normalize: true });
  const qVec = Array.from(output.data);

  return entries
    .filter((e) => e.embedding)
    .map((e) => ({
      source: e.source,
      id: e.id,
      text: e.text,
      score: cosine(qVec, e.embedding),
      method: "semantic",
    }))
    .toSorted((a, b) => b.score - a.score);
}

function mergeResults(keyword, semantic, topN) {
  const seen = new Set();
  const merged = [];

  for (const r of keyword) {
    const key = `${r.source}:${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  for (const r of semantic) {
    const key = `${r.source}:${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged.slice(0, topN);
}

async function main() {
  const args = process.argv.slice(2);
  let topN = 10;
  let query = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top" && args[i + 1]) {
      topN = parseInt(args[i + 1], 10);
      i++;
    } else {
      query = args[i];
    }
  }

  if (!query) {
    console.log('Usage: node .claude/scripts/similar-search.mjs "<query>" [--top N]');
    process.exit(1);
  }

  if (!existsSync(INDEX_PATH)) {
    console.error("Index not found. Run: node .claude/scripts/similar-index.mjs");
    process.exit(1);
  }

  const entries = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
  console.log(`Index: ${entries.length} entries`);

  // 1. Keyword search (instant)
  console.log("\n--- Keyword matches ---");
  const kwResults = keywordSearch(query, entries);

  if (kwResults.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of kwResults.slice(0, 5)) {
      console.log(`  [${r.source}] ${r.id}`);
      console.log(`    ${r.text.slice(0, 120).replace(/\n/g, " ")}`);
      console.log(`    score: ${r.score.toFixed(2)}`);
      console.log();
    }
  }

  // 2. Semantic search
  console.log("--- Semantic matches ---");
  console.log("Loading model...");
  const extractor = await pipeline("feature-extraction", MODEL);
  const semResults = await semanticSearch(query, entries, extractor);

  for (const r of semResults.slice(0, 5)) {
    console.log(`  [${r.source}] ${r.id}`);
    console.log(`    ${r.text.slice(0, 120).replace(/\n/g, " ")}`);
    console.log(`    score: ${r.score.toFixed(3)}`);
    console.log();
  }

  // 3. Merged results
  console.log("--- Top results (merged) ---");
  const merged = mergeResults(kwResults, semResults, topN);
  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    console.log(`${i + 1}. [${r.method}][${r.source}] ${r.id}`);
    console.log(`   ${r.text.slice(0, 100).replace(/\n/g, " ")}`);
    console.log(`   score: ${r.score.toFixed(3)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
