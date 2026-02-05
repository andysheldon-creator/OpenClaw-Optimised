import fs from "node:fs/promises";
import path from "node:path";
import type { NeuronWavesPolicy } from "../policy/types.js";
import { resolveNeuronWavesDir } from "../state.js";

export type PolicyHistoryEntry = {
  atMs: number;
  reason: string;
  ledgerEventId?: string;
  from: NeuronWavesPolicy;
  to: NeuronWavesPolicy;
};

export function resolveNeuronWavesPolicyHistoryPath(workspaceDir: string) {
  return path.join(resolveNeuronWavesDir(workspaceDir), "policy.history.jsonl");
}

export async function appendPolicyHistory(workspaceDir: string, entry: PolicyHistoryEntry) {
  const dir = resolveNeuronWavesDir(workspaceDir);
  await fs.mkdir(dir, { recursive: true });
  const file = resolveNeuronWavesPolicyHistoryPath(workspaceDir);
  await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readLastPolicyHistory(
  workspaceDir: string,
): Promise<PolicyHistoryEntry | null> {
  const file = resolveNeuronWavesPolicyHistoryPath(workspaceDir);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const lines = raw.trimEnd().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        return JSON.parse(line) as PolicyHistoryEntry;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return null;
}
