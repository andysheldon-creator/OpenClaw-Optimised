import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../../src/config/config.js";
import type { AnalysisResult, ExtractedFact } from "./types.js";

type RunEmbeddedPiAgentFn = (params: Record<string, unknown>) => Promise<unknown>;

async function loadRunEmbeddedPiAgent(): Promise<RunEmbeddedPiAgentFn> {
  // Source checkout (tests/dev)
  try {
    const mod = await import("../../../src/agents/pi-embedded-runner.js");
    // oxlint-disable-next-line typescript/no-explicit-any
    if (typeof (mod as any).runEmbeddedPiAgent === "function") {
      // oxlint-disable-next-line typescript/no-explicit-any
      return (mod as any).runEmbeddedPiAgent;
    }
  } catch {
    // ignore
  }

  // Bundled install (built)
  const mod = await import("../../../agents/pi-embedded-runner.js");
  if (typeof mod.runEmbeddedPiAgent !== "function") {
    throw new Error("Internal error: runEmbeddedPiAgent not available");
  }
  return mod.runEmbeddedPiAgent;
}

function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") {
    return "";
  }
  const msgObj = msg as Record<string, unknown>;
  const role = msgObj.role;
  if (role !== "user" && role !== "assistant") {
    return "";
  }

  const content = msgObj.content;

  // Handle string content directly
  if (typeof content === "string") {
    return content;
  }

  // Handle array content (content blocks)
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        (block as Record<string, unknown>).type === "text" &&
        "text" in block &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        texts.push((block as Record<string, unknown>).text as string);
      }
    }
    return texts.join("\n");
  }

  return "";
}

function collectConversationText(messages: unknown[]): string {
  const texts: string[] = [];
  for (const msg of messages) {
    const text = extractTextFromMessage(msg);
    if (text && !text.startsWith("/")) {
      texts.push(text);
    }
  }
  return texts.join("\n\n");
}

export async function analyzeMessages(
  messages: unknown[],
  config: OpenClawConfig,
  workspaceDir: string,
  minImportance: number,
): Promise<AnalysisResult> {
  const conversationText = collectConversationText(messages);
  if (!conversationText.trim()) {
    return { facts: [] };
  }

  const prompt = `Analizza questa conversazione e estrai solo i fatti importanti, decisioni, o preferenze che dovrebbero essere ricordate.

Rispondi in formato JSON con un array di oggetti, ciascuno con:
- fact: stringa che descrive il fatto/decisione/preferenza
- category: una delle seguenti: "decision", "preference", "fact", "personal_info"
- importance: numero tra 0 e 1 che indica l'importanza (solo fatti con importance >= ${minImportance} verranno salvati)

Esempio di risposta:
{
  "facts": [
    {
      "fact": "L'utente preferisce ricevere notifiche via email",
      "category": "preference",
      "importance": 0.8
    },
    {
      "fact": "Deciso di usare PostgreSQL per il nuovo progetto",
      "category": "decision",
      "importance": 0.9
    }
  ]
}

Conversazione:
${conversationText}`;

  const systemPrompt = `Sei un assistente che analizza conversazioni per estrarre informazioni importanti da ricordare.
Rispondi SOLO con JSON valido, senza markdown o commenti aggiuntivi.`;

  let tmpDir: string | null = null;
  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-auto-memory-"));
    const sessionId = `auto-memory-${Date.now()}`;
    const sessionFile = path.join(tmpDir, "session.json");

    const runEmbeddedPiAgent = await loadRunEmbeddedPiAgent();

    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir,
      config,
      prompt: `${systemPrompt}\n\n${prompt}`,
      timeoutMs: 30_000,
      runId: `auto-memory-${Date.now()}`,
      disableTools: true,
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    const payloads = (result as any).payloads;
    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      return { facts: [] };
    }

    const text = payloads
      .filter((p: { isError?: boolean; text?: string }) => !p.isError && p.text)
      .map((p: { text: string }) => p.text)
      .join("\n")
      .trim();

    if (!text) {
      return { facts: [] };
    }

    // Parse JSON response
    let parsed: { facts?: ExtractedFact[] };
    try {
      // Remove markdown code fences if present
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      return { facts: [] };
    }

    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const filteredFacts = facts.filter(
      (f) =>
        f &&
        typeof f.fact === "string" &&
        typeof f.category === "string" &&
        typeof f.importance === "number" &&
        f.importance >= minImportance,
    );

    return { facts: filteredFacts };
  } catch (err) {
    return { facts: [] };
  } finally {
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
