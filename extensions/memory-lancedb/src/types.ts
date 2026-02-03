import type { ClawdbrainPluginApi } from "clawdbrain/plugin-sdk";
import type { MemoryCategory } from "../config.js";

export type MemoryEntry = {
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: MemoryCategory;
  createdAt: number;
  originalText?: string;
  confidence?: number;
  sourceChannel?: string;
  tags?: string[];
};

export type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

export interface MemoryStore {
  store(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(vector: number[], limit?: number, minScore?: number): Promise<MemorySearchResult[]>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
  getAll(limit?: number): Promise<MemoryEntry[]>;
}

export interface Extractor {
  extract(
    messages: { role: string; content: string }[],
    api: ClawdbrainPluginApi,
  ): Promise<
    {
      text: string;
      category: MemoryCategory;
      importance: number;
      confidence: number;
      tags: string[];
    }[]
  >;

  /**
   * Fetches content from the URL and generates a summary.
   */
  summarizeUrl(url: string, api: ClawdbrainPluginApi): Promise<string | null>;
}

export interface Expander {
  expand(
    history: { role: string; content: string }[],
    currentPrompt: string,
    api: ClawdbrainPluginApi,
  ): Promise<string>;
}

export interface Synthesizer {
  synthesize(
    memories: MemoryEntry[],
    api: ClawdbrainPluginApi,
  ): Promise<{
    merged: MemoryEntry[];
    archived: string[];
    summary: string;
  }>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export interface Notifier {
  notify(message: string): Promise<void>;
}
