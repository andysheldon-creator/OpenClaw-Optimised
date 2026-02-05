import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveNeuronWavesDir } from "../state.js";

export type LedgerEvent = {
  id: string;
  atMs: number;
  kind:
    | "wave.started"
    | "action.planned"
    | "action.result"
    | "consequence.observed"
    | "policy.updated"
    | "policy.rollback";
  prevId: string | null;
  prevHash: string | null;
  hash: string;
  payload: unknown;
};

export function resolveNeuronWavesLedgerPath(workspaceDir: string) {
  return path.join(resolveNeuronWavesDir(workspaceDir), "ledger.jsonl");
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function readLastLedgerEvent(workspaceDir: string): Promise<LedgerEvent | null> {
  const ledgerPath = resolveNeuronWavesLedgerPath(workspaceDir);
  try {
    const raw = await fs.readFile(ledgerPath, "utf-8");
    const lines = raw.trimEnd().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        return JSON.parse(line) as LedgerEvent;
      } catch {
        // ignore malformed trailing lines
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function appendLedgerEvent(params: {
  workspaceDir: string;
  kind: LedgerEvent["kind"];
  payload: unknown;
  nowMs?: number;
}): Promise<LedgerEvent> {
  const { workspaceDir, kind, payload } = params;
  const dir = resolveNeuronWavesDir(workspaceDir);
  await fs.mkdir(dir, { recursive: true });

  const prev = await readLastLedgerEvent(workspaceDir);
  const prevId = prev?.id ?? null;
  const prevHash = prev?.hash ?? null;
  const id = crypto.randomUUID();
  const atMs = params.nowMs ?? Date.now();

  const base = {
    id,
    atMs,
    kind,
    prevId,
    prevHash,
    payload,
  };

  const hash = sha256(JSON.stringify(base));
  const evt: LedgerEvent = { ...base, hash };

  const ledgerPath = resolveNeuronWavesLedgerPath(workspaceDir);
  await fs.appendFile(ledgerPath, JSON.stringify(evt) + "\n", "utf-8");
  return evt;
}
