import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ArtifactRef } from "./session-artifacts.js";
import { readToolResultArtifactPayload, type ToolResultArtifactPayload } from "./artifact-store.js";

export type ArtifactRegistryEntry = {
  hash: string;
  artifact: ArtifactRef;
  sessionId?: string;
  sessionKey?: string;
};

export function computeArtifactHash(payload: unknown): string {
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json).digest("hex");
}

export function registryPathForDir(artifactDir: string): string {
  return path.join(artifactDir, "registry.jsonl");
}

export function appendArtifactRegistryEntry(params: {
  artifactDir: string;
  entry: ArtifactRegistryEntry;
}): void {
  fs.mkdirSync(params.artifactDir, { recursive: true, mode: 0o700 });
  const filePath = registryPathForDir(params.artifactDir);
  const line = `${JSON.stringify(params.entry)}\n`;
  fs.appendFileSync(filePath, line, { mode: 0o600 });
}

export function readArtifactRegistry(artifactDir: string): ArtifactRegistryEntry[] {
  const filePath = registryPathForDir(artifactDir);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) {
      return [];
    }
    return raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as ArtifactRegistryEntry)
      .filter((entry) => Boolean(entry?.artifact?.id));
  } catch {
    return [];
  }
}

export function findArtifactByHash(
  artifactDir: string,
  hash: string,
): ArtifactRegistryEntry | null {
  const entries = readArtifactRegistry(artifactDir);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].hash === hash) {
      return entries[i];
    }
  }
  return null;
}

export function getArtifactById(artifactDir: string, id: string): ArtifactRegistryEntry | null {
  const entries = readArtifactRegistry(artifactDir);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].artifact.id === id) {
      return entries[i];
    }
  }
  return null;
}

export function getArtifactPayloadById(
  artifactDir: string,
  id: string,
): ToolResultArtifactPayload | null {
  const entry = getArtifactById(artifactDir, id);
  if (!entry) {
    return null;
  }
  return readToolResultArtifactPayload(entry.artifact.path);
}

export function listArtifactsForSession(params: {
  artifactDir: string;
  sessionKey?: string;
  sessionId?: string;
}): ArtifactRegistryEntry[] {
  const entries = readArtifactRegistry(params.artifactDir);
  if (!params.sessionKey && !params.sessionId) {
    return entries;
  }
  return entries.filter((entry) => {
    if (params.sessionKey && entry.sessionKey === params.sessionKey) {
      return true;
    }
    if (params.sessionId && entry.sessionId === params.sessionId) {
      return true;
    }
    return false;
  });
}
