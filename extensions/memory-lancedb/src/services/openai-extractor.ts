import type { ClawdbrainPluginApi } from "clawdbrain/plugin-sdk";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import type { MemoryCategory } from "../../config.js";
import type { Extractor } from "../types.js";

async function logTrace(api: ClawdbrainPluginApi, type: string, data: any) {
  const logDir = join(homedir(), ".clawdbrain", "logs");
  const logPath = join(logDir, "memory-trace.jsonl");
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    ...data,
  };
  try {
    await appendFile(logPath, JSON.stringify(entry) + "\n");
  } catch (err) {
    api.logger.warn(`memory-lancedb: trace logging failed: ${String(err)}`);
  }
}

export class OpenAiExtractor implements Extractor {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async extract(
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
  > {
    const conversation = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

    const systemPrompt = `You are an expert at extracting long-term knowledge from conversations.
Analyze the following conversation and extract any:
- User preferences (likes, dislikes, habits, workflow)
- Factual statements about the user or their environment
- Important decisions made during the conversation
- Recurrent entities or topics (people, places, organizations)
- Scheduled events or milestones
- Resources or links shared

Return ONLY a JSON array of objects with this schema:
{
  "text": "The concise factual statement or preference",
  "category": "preference" | "fact" | "decision" | "event" | "resource" | "entity" | "other",
  "importance": 0.0 to 1.0,
  "confidence": 0.0 to 1.0,
  "tags": ["tag1", "tag2"]
}

Rules:
1. Be concise. 
2. Only extract information that is worth remembering long-term.
3. If no valuable information is found, return an empty array [].
4. Return ONLY raw JSON.`;

    const start = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `CONVERSATION:\n${conversation}` },
        ],
        response_format: { type: "json_object" },
      });

      const latency = Date.now() - start;
      const content = response.choices[0].message.content ?? "{}";
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : parsed.memories || parsed.items || [];

      await logTrace(api, "extraction", {
        inputCount: messages.length,
        outputCount: items.length,
        latency,
        model: this.model,
      });

      return items;
    } catch (err) {
      api.logger.warn(`memory-lancedb: extraction failed: ${String(err)}`);
      return [];
    }
  }

  async summarizeUrl(url: string, api: ClawdbrainPluginApi): Promise<string | null> {
    const systemPrompt =
      "Summarize the following web content in 3-5 concise bullet points for long-term storage.";

    try {
      // 1. Fetch Content
      const fetchStart = Date.now();
      const res = await fetch(url);
      if (!res.ok) {
        api.logger.warn(`memory-lancedb: fetch failed for ${url} (${res.status})`);
        return null;
      }
      const text = await res.text();
      // Simple truncation to avoid token limits (10k chars approx)
      const truncated = text.slice(0, 10000);

      // 2. Summarize
      const aiStart = Date.now();
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `URL: ${url}\n\nCONTENT:\n${truncated}` },
        ],
      });

      const summary = response.choices[0].message.content ?? "";

      await logTrace(api, "summarization", {
        url,
        fetchLatency: aiStart - fetchStart,
        aiLatency: Date.now() - aiStart,
        model: this.model,
      });

      return summary;
    } catch (err) {
      api.logger.warn(`memory-lancedb: summarization failed: ${String(err)}`);
      return null;
    }
  }
}
