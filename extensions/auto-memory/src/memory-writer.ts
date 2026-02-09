import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../../src/config/config.js";
import type { ExtractedFact } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../../src/agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../src/routing/session-key.js";

export async function writeToMemory(
  facts: ExtractedFact[],
  config: OpenClawConfig,
  sessionKey: string | undefined,
  agentId: string | undefined,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (facts.length === 0) {
    return { success: true };
  }

  try {
    const resolvedAgentId = agentId ?? resolveAgentIdFromSessionKey(sessionKey);
    const workspaceDir = resolveAgentWorkspaceDir(config, resolvedAgentId);
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    // Get today's date for filename
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const memoryFilePath = path.join(memoryDir, `${dateStr}.md`);

    // Read existing file or create new
    let existingContent = "";
    try {
      existingContent = await fs.readFile(memoryFilePath, "utf-8");
    } catch {
      // File doesn't exist, will create new
    }

    // Format new entry
    const timeStr = now.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const entryLines: string[] = [`## ${timeStr}`];

    // Group facts by category
    const byCategory = new Map<string, ExtractedFact[]>();
    for (const fact of facts) {
      const category = fact.category || "fact";
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(fact);
    }

    // Write facts grouped by category
    for (const [category, categoryFacts] of byCategory.entries()) {
      const categoryLabel =
        category === "decision"
          ? "Decisioni"
          : category === "preference"
            ? "Preferenze"
            : category === "personal_info"
              ? "Informazioni personali"
              : "Fatti";
      entryLines.push(`\n### ${categoryLabel}`);
      for (const fact of categoryFacts) {
        entryLines.push(`- ${fact.fact}`);
      }
    }

    const newEntry = entryLines.join("\n");

    // Append to file (or create new)
    const contentToWrite = existingContent
      ? `${existingContent}\n\n${newEntry}`
      : `# ${dateStr}\n\n${newEntry}`;

    await fs.writeFile(memoryFilePath, contentToWrite, "utf-8");

    return { success: true, filePath: memoryFilePath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
