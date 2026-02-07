/**
 * Artifact and Reference Collector (Component 5)
 *
 * Produces durable references (files, links, media) from tool interactions.
 * Never stores raw binary content in records—references only.
 */

import crypto from "node:crypto";
import type { MeridiaEvent } from "../event/normalizer.js";
import type { ArtifactRef } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Collection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract artifact references from a MeridiaEvent payload.
 * Returns references to files, URLs, and media discovered in tool args/results.
 */
export function collectArtifacts(event: MeridiaEvent): ArtifactRef[] {
  const refs: ArtifactRef[] = [];
  const toolName = event.tool?.name?.toLowerCase() ?? "";
  const payload = event.payload as { args?: Record<string, unknown>; result?: unknown } | undefined;

  if (!payload) return refs;

  // File references from write/edit operations
  if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
    const filePath = extractFilePath(payload.args);
    if (filePath) {
      refs.push({
        id: crypto.randomUUID(),
        kind: "file",
        uri: `file://${filePath}`,
        title: filePath.split("/").pop() ?? filePath,
        description: `${toolName} operation`,
      });
    }
  }

  // URL references from browser/web operations
  if (toolName === "browser" || toolName === "web_fetch" || toolName === "web_search") {
    const url = extractUrl(payload.args);
    if (url) {
      refs.push({
        id: crypto.randomUUID(),
        kind: "link",
        uri: url,
        title: url,
        description: `${toolName} operation`,
      });
    }
  }

  // File path references from read operations
  if (toolName === "read") {
    const filePath = extractFilePath(payload.args);
    if (filePath) {
      refs.push({
        id: crypto.randomUUID(),
        kind: "file",
        uri: `file://${filePath}`,
        title: filePath.split("/").pop() ?? filePath,
        description: "read operation",
      });
    }
  }

  return refs;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractFilePath(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  // Common arg names for file paths
  for (const key of ["file_path", "filePath", "path", "file"]) {
    const val = args[key];
    if (typeof val === "string" && val.trim() && val.startsWith("/")) {
      return val.trim();
    }
  }
  return null;
}

function extractUrl(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  for (const key of ["url", "uri", "href", "link"]) {
    const val = args[key];
    if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
      return val.trim();
    }
  }
  return null;
}
