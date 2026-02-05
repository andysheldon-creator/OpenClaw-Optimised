import fs from "node:fs/promises";
import path from "node:path";
import { resolveNeuronWavesDir } from "../state.js";

export type NeuronWavesSnapshot = {
  atMs: number;
  kind: "policy";
  data: unknown;
};

export function resolveNeuronWavesSnapshotsDir(workspaceDir: string) {
  return path.join(resolveNeuronWavesDir(workspaceDir), "snapshots");
}

export async function writeSnapshot(workspaceDir: string, snapshot: NeuronWavesSnapshot) {
  const dir = resolveNeuronWavesSnapshotsDir(workspaceDir);
  await fs.mkdir(dir, { recursive: true });
  const ts = new Date(snapshot.atMs).toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${snapshot.kind}-${ts}.json`);
  await fs.writeFile(file, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
  return file;
}
