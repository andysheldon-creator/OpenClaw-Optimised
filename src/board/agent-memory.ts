/**
 * Board of Directors — Per-Agent Persistent Memory
 *
 * Each board agent accumulates knowledge over time in a JSONL file at
 * ~/.clawdis/agents/{role}/memory.jsonl. Memory entries are created after
 * each completed task and loaded into the agent's system prompt.
 */

import fs from "node:fs";
import path from "node:path";

import { CONFIG_DIR } from "../utils.js";
import type { BoardAgentRole } from "./types.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type AgentMemoryEntry = {
  /** Epoch ms when the memory was created. */
  timestamp: number;
  /** The directive / task the agent was working on. */
  directive: string;
  /** One-paragraph summary of what was learned. */
  summary: string;
  /** Extractable key facts for future context. */
  keyFacts: string[];
  /** Task ID that produced this memory. */
  taskId: string;
};

// ── Path Resolution ─────────────────────────────────────────────────────────

const AGENTS_DIR = path.join(CONFIG_DIR, "agents");

/** Resolve the memory file path for a given agent role. */
export function resolveAgentMemoryPath(role: BoardAgentRole): string {
  return path.join(AGENTS_DIR, role, "memory.jsonl");
}

/** Ensure the agent's directory exists. */
function ensureAgentDir(role: BoardAgentRole): string {
  const dir = path.join(AGENTS_DIR, role);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Load ────────────────────────────────────────────────────────────────────

/**
 * Load the most recent memory entries for an agent.
 * Returns a formatted string suitable for injection into the system prompt.
 */
export function loadAgentMemory(
  role: BoardAgentRole,
  maxEntries = 20,
): string {
  const memoryPath = resolveAgentMemoryPath(role);
  try {
    if (!fs.existsSync(memoryPath)) return "";
    const raw = fs.readFileSync(memoryPath, "utf-8").trim();
    if (!raw) return "";

    const entries: AgentMemoryEntry[] = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AgentMemoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is AgentMemoryEntry => e !== null);

    // Take the most recent N entries
    const recent = entries.slice(-maxEntries);
    if (recent.length === 0) return "";

    const lines = recent.map((e) => {
      const date = new Date(e.timestamp).toISOString().split("T")[0];
      const facts =
        e.keyFacts.length > 0 ? ` | Facts: ${e.keyFacts.join("; ")}` : "";
      return `[${date}] ${e.directive}: ${e.summary}${facts}`;
    });

    return lines.join("\n");
  } catch {
    return "";
  }
}

// ── Append ──────────────────────────────────────────────────────────────────

/**
 * Append a memory entry for an agent.
 */
export function appendAgentMemory(
  role: BoardAgentRole,
  entry: AgentMemoryEntry,
): void {
  ensureAgentDir(role);
  const memoryPath = resolveAgentMemoryPath(role);
  try {
    fs.appendFileSync(memoryPath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Non-fatal — memory just won't persist this time
  }
}

// ── Memory Extraction ───────────────────────────────────────────────────────

/**
 * Extract a memory entry from a completed task result using heuristics.
 * Takes the first paragraph as summary and bullet points as key facts.
 */
export function extractMemoryFromResult(
  directive: string,
  resultText: string,
  taskId: string,
): AgentMemoryEntry {
  const trimmed = resultText.trim();

  // Summary: first paragraph, capped at 500 chars
  const firstPara = trimmed.split("\n\n")[0] ?? trimmed;
  const summary =
    firstPara.length > 500 ? firstPara.slice(0, 497) + "..." : firstPara;

  // Key facts: extract bullet points or numbered items
  const keyFacts = trimmed
    .split("\n")
    .filter(
      (line) =>
        /^[-*•]\s/.test(line.trim()) || /^\d+[.)]\s/.test(line.trim()),
    )
    .slice(0, 10)
    .map((line) => line.trim().replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""));

  return {
    timestamp: Date.now(),
    directive,
    summary,
    keyFacts,
    taskId,
  };
}

// ── Clear ───────────────────────────────────────────────────────────────────

/**
 * Clear an agent's memory (for testing or reset).
 */
export function clearAgentMemory(role: BoardAgentRole): void {
  const memoryPath = resolveAgentMemoryPath(role);
  try {
    if (fs.existsSync(memoryPath)) {
      fs.unlinkSync(memoryPath);
    }
  } catch {
    // Non-fatal
  }
}
