import type { AgentMessage } from "@mariozechner/pi-agent-core";

export type ArtifactRef = {
  id: string;
  type: "tool-result";
  toolName?: string;
  createdAt: string;
  sizeBytes: number;
  summary: string;
  path: string;
  hash?: string;
};

export type ToolResultArtifactDetails = {
  artifactRef: ArtifactRef;
  artifactVersion?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isArtifactRef(value: unknown): value is ArtifactRef {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === "tool-result" &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.sizeBytes === "number" &&
    typeof value.summary === "string" &&
    typeof value.path === "string"
  );
}

export function getToolResultArtifactRef(message: AgentMessage): ArtifactRef | null {
  if (message.role !== "toolResult") {
    return null;
  }
  const details = (message as { details?: unknown }).details;
  if (!isRecord(details)) {
    return null;
  }
  const ref = details.artifactRef;
  return isArtifactRef(ref) ? ref : null;
}

export function withToolResultArtifactRef(
  details: unknown,
  ref: ArtifactRef,
): ToolResultArtifactDetails & Record<string, unknown> {
  const base = isRecord(details) ? { ...details } : {};
  base.artifactRef = ref;
  if (typeof base.artifactVersion !== "number") {
    base.artifactVersion = 1;
  }
  return base as ToolResultArtifactDetails & Record<string, unknown>;
}
