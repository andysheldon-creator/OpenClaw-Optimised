import type { ClawdbrainPluginApi } from "clawdbrain/plugin-sdk";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import type { Synthesizer, MemoryEntry } from "../types.js";

async function logLedger(api: ClawdbrainPluginApi, action: string, data: any) {
  const logDir = join(homedir(), ".clawdbrain", "logs");
  const logPath = join(logDir, "memory-ledger.jsonl");
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...data,
  };
  try {
    await appendFile(logPath, JSON.stringify(entry) + "\n");
  } catch (err) {
    api.logger.warn(`memory-lancedb: ledger logging failed: ${String(err)}`);
  }
}

export class OpenAiSynthesizer implements Synthesizer {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(
    memories: MemoryEntry[],
    api: ClawdbrainPluginApi,
  ): Promise<{
    merged: MemoryEntry[];
    archived: string[];
    summary: string;
  }> {
    if (memories.length === 0) {
      return { merged: [], archived: [], summary: "No memories to process." };
    }

    // 1. Cluster memories (Naive approach: just send all recent ones to LLM for now)
    // For a large number, we'd need embeddings-based clustering first.
    // Assuming we pass a manageable batch (< 50 items).

    const memoryText = memories.map((m) => `[${m.id}] (${m.category}) ${m.text}`).join("\n");

    const systemPrompt = `You are a memory maintenance engine.
Your goal is to review a list of memory entries and perform "Garbage Collection".

Rules:
1. Merge duplicate or highly similar entries into a single, comprehensive entry.
2. If two entries contradict, favor the one that seems more recent or specific (if discernible), or keep both if unsure.
3. Identify entries that are purely outdated "events" (e.g. "Meeting on Jan 12th") if today is much later, and mark them for archival.
4. Generate a brief "Morning Briefing" summary of the most important items.

Return JSON:
{
  "merged": [
    { "text": "...", "category": "...", "tags": ["..."], "sourceIds": ["id1", "id2"] }
  ],
  "archived": ["id3", "id4"],
  "summary": "Your briefing text..."
}`;

    const start = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `MEMORIES:\n${memoryText}` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content ?? "{}";
      const result = JSON.parse(content);

      const merged: MemoryEntry[] = (result.merged || []).map((m: any) => ({
        id: "new-" + Math.random().toString(36).slice(2, 9), // Temp ID
        text: m.text,
        vector: [], // Will need re-embedding
        importance: 0.8, // Default high for merged items
        category: m.category || "other",
        createdAt: Date.now(),
        tags: m.tags || [],
        confidence: 1.0,
      }));

      const archived: string[] = result.archived || [];
      const summary: string = result.summary || "Maintenance complete.";

      await logLedger(api, "synthesis", {
        inputCount: memories.length,
        mergedCount: merged.length,
        archivedCount: archived.length,
        latency: Date.now() - start,
        model: this.model,
      });

      return { merged, archived, summary };
    } catch (err) {
      api.logger.warn(`memory-lancedb: synthesis failed: ${String(err)}`);
      return { merged: [], archived: [], summary: "Synthesis failed." };
    }
  }
}
