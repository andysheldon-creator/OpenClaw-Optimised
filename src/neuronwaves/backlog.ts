import fs from "node:fs/promises";
import path from "node:path";
import { resolveNeuronWavesDir } from "./state.js";

export type NeuronWavesBacklogItem = {
  id: string;
  createdAtMs: number;
  title: string;
  nextStep: string;
  status: "open" | "done" | "blocked";
  priority: "low" | "medium" | "high";
  context?: {
    pr?: { repo: string; number: number };
    files?: string[];
  };
  lastNudgedAtMs?: number;
};

export type NeuronWavesBacklog = {
  items: NeuronWavesBacklogItem[];
};

const DEFAULT_BACKLOG: NeuronWavesBacklog = { items: [] };

export function resolveNeuronWavesBacklogPath(workspaceDir: string) {
  return path.join(resolveNeuronWavesDir(workspaceDir), "backlog.json");
}

export async function loadNeuronWavesBacklog(workspaceDir: string): Promise<NeuronWavesBacklog> {
  const backlogPath = resolveNeuronWavesBacklogPath(workspaceDir);
  try {
    const raw = await fs.readFile(backlogPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NeuronWavesBacklog>;
    if (parsed && Array.isArray(parsed.items)) {
      return { items: parsed.items as NeuronWavesBacklogItem[] };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_BACKLOG };
}

export async function saveNeuronWavesBacklog(workspaceDir: string, backlog: NeuronWavesBacklog) {
  const dir = resolveNeuronWavesDir(workspaceDir);
  await fs.mkdir(dir, { recursive: true });
  const backlogPath = resolveNeuronWavesBacklogPath(workspaceDir);
  const tmp = `${backlogPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(backlog, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, backlogPath);
}

export async function upsertBacklogItem(
  workspaceDir: string,
  item: NeuronWavesBacklogItem,
): Promise<NeuronWavesBacklogItem> {
  const backlog = await loadNeuronWavesBacklog(workspaceDir);
  const idx = backlog.items.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    backlog.items[idx] = { ...backlog.items[idx], ...item };
  } else {
    backlog.items.unshift(item);
  }
  await saveNeuronWavesBacklog(workspaceDir, backlog);
  return item;
}
