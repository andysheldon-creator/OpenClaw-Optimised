/**
 * CORE-004 (#20) — Artifact store
 *
 * Types and interface for persisting run artifacts (screenshots,
 * transcripts, exported files, etc.) with metadata.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactType = "screenshot" | "transcript" | "export" | "file";

export type Artifact = {
  id: string;
  runId: string;
  type: ArtifactType;
  mimeType: string;
  path: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: number;
};

/** Async storage backend for run artifacts. */
export type ArtifactStore = {
  save(artifact: Artifact, data: Uint8Array): Promise<void>;
  get(id: string): Promise<{ artifact: Artifact; data: Uint8Array } | null>;
  list(runId: string): Promise<Artifact[]>;
  delete(id: string): Promise<void>;
};

/**
 * Filesystem-backed artifact store.
 * Stores artifacts under a configurable base directory.
 */
export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  async save(artifact: Artifact, data: Uint8Array): Promise<void> {
    const runDir = path.join(this.baseDir, artifact.runId);
    await fs.mkdir(runDir, { recursive: true });
    const dataPath = this.resolveDataPath(runDir, artifact.id);
    const metaPath = this.resolveMetaPath(runDir, artifact.id);
    await fs.writeFile(dataPath, data);
    await fs.writeFile(metaPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }

  async get(id: string): Promise<{ artifact: Artifact; data: Uint8Array } | null> {
    const located = await this.findById(id);
    if (!located) {
      return null;
    }
    const [rawMeta, data] = await Promise.all([
      fs.readFile(located.metaPath, "utf8"),
      fs.readFile(located.dataPath),
    ]);
    return {
      artifact: JSON.parse(rawMeta) as Artifact,
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
    };
  }

  async list(runId: string): Promise<Artifact[]> {
    const runDir = path.join(this.baseDir, runId);
    let names: string[];
    try {
      names = await fs.readdir(runDir);
    } catch {
      return [];
    }
    const artifacts: Artifact[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const raw = await fs.readFile(path.join(runDir, name), "utf8");
      artifacts.push(JSON.parse(raw) as Artifact);
    }
    return artifacts.toSorted((a, b) => b.createdAt - a.createdAt);
  }

  async delete(id: string): Promise<void> {
    const located = await this.findById(id);
    if (!located) {
      return;
    }
    await Promise.all([
      fs.rm(located.metaPath, { force: true }),
      fs.rm(located.dataPath, { force: true }),
    ]);
  }

  private resolveDataPath(runDir: string, artifactId: string): string {
    return path.join(runDir, `${artifactId}.bin`);
  }

  private resolveMetaPath(runDir: string, artifactId: string): string {
    return path.join(runDir, `${artifactId}.json`);
  }

  private async findById(
    id: string,
  ): Promise<{ runId: string; metaPath: string; dataPath: string } | null> {
    let runDirs: string[];
    try {
      runDirs = await fs.readdir(this.baseDir);
    } catch {
      return null;
    }
    for (const runId of runDirs) {
      const metaPath = path.join(this.baseDir, runId, `${id}.json`);
      const dataPath = path.join(this.baseDir, runId, `${id}.bin`);
      try {
        await fs.access(metaPath);
        await fs.access(dataPath);
        return { runId, metaPath, dataPath };
      } catch {
        continue;
      }
    }
    return null;
  }
}
