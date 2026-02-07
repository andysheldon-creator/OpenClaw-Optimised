/**
 * Context Pack Builder
 *
 * Builds structured reconstitution packs from ranked results.
 * Replaces the bullet-list format with sections for narrative,
 * anchors, uncertainties, and next actions.
 */

import type { ScoredResult } from "../retrieve/ranker.js";
import type { MeridiaExperienceRecord, Phenomenology, ReconstitutionPack } from "../types.js";

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return isoStr.slice(0, 16);
  }
}

/**
 * Build a structured reconstitution pack from ranked results.
 */
export function buildStructuredPack(
  results: ScoredResult[],
  sourceCounts: { canonical: number; graph: number; vector: number },
  maxTokens: number = 2000,
): ReconstitutionPack {
  const records = results.map((r) => r.record);
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  const sessionKeys = new Set<string>();
  const allAnchors: ReconstitutionPack["anchors"] = [];
  const allUncertainties: string[] = [];
  const allHints: string[] = [];
  let earliestTs: string | null = null;
  let latestTs: string | null = null;

  // Collect phenomenology data across all records
  for (const record of records) {
    if (record.session?.key) sessionKeys.add(record.session.key);
    if (!earliestTs || record.ts < earliestTs) earliestTs = record.ts;
    if (!latestTs || record.ts > latestTs) latestTs = record.ts;

    const phenom = record.phenomenology;
    if (phenom) {
      collectAnchors(phenom, record, allAnchors);
      if (phenom.uncertainties) allUncertainties.push(...phenom.uncertainties);
      if (phenom.reconstitutionHints) allHints.push(...phenom.reconstitutionHints);
    }
  }

  // Build summary narrative
  const summary = buildNarrativeSummary(records, maxChars * 0.5);

  // Deduplicate uncertainties and hints
  const uniqueUncertainties = [...new Set(allUncertainties)].slice(0, 5);
  const uniqueHints = [...new Set(allHints)].slice(0, 5);

  // Build approach guidance from hints and high-score records
  const approachGuidance = buildApproachGuidance(records, uniqueHints);

  // Build citations
  const citations = records.slice(0, 10).map((r) => ({
    id: r.id,
    kind: r.kind,
    uri: `meridia://${r.id}`,
  }));

  const text = renderPackAsMarkdown({
    summary,
    approachGuidance,
    anchors: allAnchors.slice(0, 5),
    openUncertainties: uniqueUncertainties,
    nextActions: [],
    citations,
  });

  return {
    summary,
    approachGuidance,
    anchors: allAnchors.slice(0, 5),
    openUncertainties: uniqueUncertainties,
    nextActions: [],
    citations,
    meta: {
      recordCount: records.length,
      sessionCount: sessionKeys.size,
      timeRange: earliestTs && latestTs ? { from: earliestTs, to: latestTs } : null,
      sources: sourceCounts,
      estimatedTokens: estimateTokens(text),
      truncated: estimateTokens(text) > maxTokens,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function collectAnchors(
  phenom: Phenomenology,
  record: MeridiaExperienceRecord,
  out: ReconstitutionPack["anchors"],
): void {
  if (!phenom.anchors) return;
  for (const a of phenom.anchors) {
    out.push({
      phrase: a.phrase,
      instruction: a.significance,
      citation: `meridia://${record.id}`,
    });
  }
}

function buildNarrativeSummary(records: MeridiaExperienceRecord[], maxChars: number): string {
  const parts: string[] = [];
  let currentChars = 0;

  // Group by engagement quality for narrative flow
  const highSignificance = records.filter((r) => r.capture.score >= 0.8);
  const medium = records.filter((r) => r.capture.score >= 0.6 && r.capture.score < 0.8);

  if (highSignificance.length > 0) {
    parts.push(`${highSignificance.length} high-significance experiences captured recently.`);
    for (const r of highSignificance.slice(0, 5)) {
      const topic =
        r.content?.topic ?? r.content?.summary ?? r.capture.evaluation?.reason ?? r.kind;
      const phenom = r.phenomenology;
      const emotionStr = phenom?.emotionalSignature?.primary?.join(", ") ?? "";
      const time = formatTimestamp(r.ts);

      let line = `- **${topic}** _(${time})_`;
      if (emotionStr) line += ` — felt ${emotionStr}`;
      if (r.tool?.isError) line += " ⚠️";
      line += "\n";

      if (currentChars + line.length > maxChars) break;
      parts.push(line);
      currentChars += line.length;
    }
  }

  if (medium.length > 0 && currentChars < maxChars * 0.8) {
    parts.push(`\n${medium.length} additional experiences at moderate significance.`);
    for (const r of medium.slice(0, 3)) {
      const topic = r.content?.topic ?? r.content?.summary ?? r.kind;
      const time = formatTimestamp(r.ts);
      const line = `- ${topic} _(${time})_\n`;
      if (currentChars + line.length > maxChars) break;
      parts.push(line);
      currentChars += line.length;
    }
  }

  return parts.join("").trim();
}

function buildApproachGuidance(records: MeridiaExperienceRecord[], hints: string[]): string[] {
  const guidance: string[] = [];

  // Include reconstitution hints
  for (const h of hints.slice(0, 3)) {
    guidance.push(h);
  }

  // Derive guidance from error patterns
  const errors = records.filter((r) => r.tool?.isError);
  if (errors.length > 0) {
    const errorTools = [...new Set(errors.map((r) => r.tool?.name).filter(Boolean))];
    guidance.push(`Be cautious with ${errorTools.join(", ")} — recent errors encountered.`);
  }

  // Derive guidance from engagement patterns
  const phenomenRecords = records.filter((r) => r.phenomenology?.engagementQuality);
  const struggling = phenomenRecords.filter(
    (r) => r.phenomenology?.engagementQuality === "struggling",
  );
  if (struggling.length > phenomenRecords.length * 0.3 && struggling.length > 1) {
    guidance.push("Recent sessions had some struggling moments — consider a fresh approach.");
  }

  return guidance;
}

/**
 * Render a pack as markdown for bootstrap injection.
 */
export function renderPackAsMarkdown(pack: {
  summary: string;
  approachGuidance: string[];
  anchors: ReconstitutionPack["anchors"];
  openUncertainties: string[];
  nextActions: string[];
  citations: ReconstitutionPack["citations"];
}): string {
  const lines: string[] = [];

  lines.push("## Experiential Continuity — State Restoration");
  lines.push("");

  if (pack.summary) {
    lines.push(pack.summary);
    lines.push("");
  }

  if (pack.approachGuidance.length > 0) {
    lines.push("### Approach Guidance");
    for (const g of pack.approachGuidance) {
      lines.push(`- ${g}`);
    }
    lines.push("");
  }

  if (pack.anchors.length > 0) {
    lines.push("### Reconstitution Anchors");
    for (const a of pack.anchors) {
      lines.push(`- "${a.phrase}" — ${a.instruction}`);
    }
    lines.push("");
  }

  if (pack.openUncertainties.length > 0) {
    lines.push("### Open Uncertainties");
    for (const u of pack.openUncertainties) {
      lines.push(`- ${u}`);
    }
    lines.push("");
  }

  if (pack.nextActions.length > 0) {
    lines.push("### Next Actions");
    for (const a of pack.nextActions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
