/**
 * Enhanced Memory Search with Vector Indexing
 * - Incremental re-embedding via content hash tracking
 * - Top-N results with relevance scores
 * - Chunk-based splitting with overlap
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type SearchResult = {
  snippet: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  source: string;
};
export type EnhancedSearchOutput = {
  results: SearchResult[];
  searchTimeMs: number;
  totalChunks: number;
  query: string;
};

export function hashFileContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export class FileHashTracker {
  private hashes: Map<string, string>;
  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.hashes = new Map();
    try {
      if (fs.existsSync(storePath)) {
        this.hashes = new Map(Object.entries(JSON.parse(fs.readFileSync(storePath, "utf-8"))));
      }
    } catch {
      /* fresh start */
    }
  }

  save(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.storePath, JSON.stringify(Object.fromEntries(this.hashes), null, 2));
  }

  needsReindex(filePath: string, content: string): boolean {
    const hash = hashFileContent(content);
    if (this.hashes.get(filePath) === hash) {
      return false;
    }
    this.hashes.set(filePath, hash);
    return true;
  }
}

export function formatSearchResults(output: EnhancedSearchOutput): string {
  if (output.results.length === 0) {
    return `No results found for "${output.query}" (searched ${output.totalChunks} chunks in ${output.searchTimeMs}ms)`;
  }
  const lines = [
    `Found ${output.results.length} results for "${output.query}" (${output.searchTimeMs}ms, ${output.totalChunks} chunks):`,
    "",
  ];
  for (let i = 0; i < output.results.length; i++) {
    const r = output.results[i];
    lines.push(`${i + 1}. [${(r.score * 100).toFixed(1)}%] ${r.path}:${r.startLine}-${r.endLine}`);
    lines.push(`   ${r.snippet.slice(0, 200).replace(/\n/g, " ")}`, "");
  }
  return lines.join("\n");
}

export function collectMemoryFiles(workspaceDir: string): string[] {
  const files: string[] = [];
  const memoryMd = path.join(workspaceDir, "MEMORY.md");
  if (fs.existsSync(memoryMd)) {
    files.push(memoryMd);
  }
  const memoryDir = path.join(workspaceDir, "memory");
  if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
    for (const entry of fs.readdirSync(memoryDir)) {
      if (entry.endsWith(".md")) {
        files.push(path.join(memoryDir, entry));
      }
    }
  }
  return files;
}

export function chunkContent(
  content: string,
  maxChunkSize = 512,
): Array<{ text: string; startLine: number; endLine: number }> {
  const lines = content.split("\n");
  const chunks: Array<{ text: string; startLine: number; endLine: number }> = [];
  let currentChunk: string[] = [];
  let startLine = 1;
  let currentSize = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentSize + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join("\n"),
        startLine,
        endLine: startLine + currentChunk.length - 1,
      });
      const overlap = currentChunk.slice(-2);
      currentChunk = [...overlap, line];
      startLine = i - overlap.length + 1;
      currentSize = currentChunk.reduce((s, l) => s + l.length + 1, 0);
    } else {
      currentChunk.push(line);
      currentSize += line.length + 1;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join("\n"),
      startLine,
      endLine: startLine + currentChunk.length - 1,
    });
  }
  return chunks;
}
