/**
 * Kit URI Resolver (Phase 5)
 *
 * Makes experience kits inspectable via meridia://<id> URIs.
 * Used by MeridiaSearchAdapter.readFile() to render kit contents.
 */

import type { MeridiaDbBackend } from "../db/backend.js";
import type { MeridiaExperienceRecord, Phenomenology } from "../types.js";

const MERIDIA_URI_PREFIX = "meridia://";

/**
 * Check if a path is a meridia:// URI.
 */
export function isMeridiaUri(path: string): boolean {
  return path.startsWith(MERIDIA_URI_PREFIX);
}

/**
 * Extract the record ID from a meridia:// URI.
 */
export function extractIdFromUri(uri: string): string | null {
  if (!uri.startsWith(MERIDIA_URI_PREFIX)) return null;
  const id = uri.slice(MERIDIA_URI_PREFIX.length).trim();
  return id || null;
}

/**
 * Build a meridia:// URI from a record ID.
 */
export function buildMeridiaUri(id: string): string {
  return `${MERIDIA_URI_PREFIX}${id}`;
}

/**
 * Resolve a meridia:// URI to a rendered text representation.
 */
export async function resolveKitUri(
  uri: string,
  backend: MeridiaDbBackend,
): Promise<{ text: string; path: string } | null> {
  const id = extractIdFromUri(uri);
  if (!id) return null;

  const result = await backend.getRecordById(id);
  if (!result) return null;

  const text = renderKit(result.record);
  return { text, path: uri };
}

/**
 * Render a MeridiaExperienceRecord as human-readable text.
 */
function renderKit(record: MeridiaExperienceRecord): string {
  const lines: string[] = [];

  lines.push(`# Experience Kit: ${record.id}`);
  lines.push("");
  lines.push(`- **Kind**: ${record.kind}`);
  lines.push(`- **Timestamp**: ${record.ts}`);
  lines.push(`- **Score**: ${record.capture.score.toFixed(2)}`);
  if (record.session?.key) lines.push(`- **Session**: ${record.session.key}`);
  if (record.tool?.name) lines.push(`- **Tool**: ${record.tool.name}`);
  if (record.tool?.isError) lines.push(`- **Error**: yes`);

  if (record.content?.topic) {
    lines.push("");
    lines.push(`## Topic`);
    lines.push(record.content.topic);
  }

  if (record.content?.summary) {
    lines.push("");
    lines.push(`## Summary`);
    lines.push(record.content.summary);
  }

  // Render phenomenology if present
  const phenom = record.phenomenology;
  if (phenom) {
    lines.push("");
    lines.push(`## Phenomenology`);
    renderPhenomenology(phenom, lines);
  }

  if (record.content?.tags?.length) {
    lines.push("");
    lines.push(`## Tags`);
    lines.push(record.content.tags.map((t) => `\`${t}\``).join(", "));
  }

  if (record.capture.evaluation.reason) {
    lines.push("");
    lines.push(`## Evaluation`);
    lines.push(`${record.capture.evaluation.kind}: ${record.capture.evaluation.reason}`);
  }

  return lines.join("\n");
}

function renderPhenomenology(phenom: Phenomenology, lines: string[]): void {
  if (phenom.emotionalSignature) {
    const es = phenom.emotionalSignature;
    lines.push(`- **Emotions**: ${es.primary.join(", ")}`);
    lines.push(`- **Intensity**: ${es.intensity.toFixed(2)}`);
    if (es.valence !== undefined) lines.push(`- **Valence**: ${es.valence.toFixed(2)}`);
    if (es.texture) lines.push(`- **Texture**: ${es.texture}`);
  }
  if (phenom.engagementQuality) {
    lines.push(`- **Engagement**: ${phenom.engagementQuality}`);
  }
  if (phenom.anchors?.length) {
    lines.push("");
    lines.push("### Anchors");
    for (const a of phenom.anchors) {
      lines.push(
        `- "${a.phrase}" — ${a.significance}${a.sensoryChannel ? ` [${a.sensoryChannel}]` : ""}`,
      );
    }
  }
  if (phenom.uncertainties?.length) {
    lines.push("");
    lines.push("### Uncertainties");
    for (const u of phenom.uncertainties) {
      lines.push(`- ${u}`);
    }
  }
  if (phenom.reconstitutionHints?.length) {
    lines.push("");
    lines.push("### Reconstitution Hints");
    for (const h of phenom.reconstitutionHints) {
      lines.push(`- ${h}`);
    }
  }
}
