import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { completeTextWithModelRef } from "openclaw/plugin-sdk";
import type { MeridiaExperienceRecord } from "./types.js";
import { createBackend } from "./db/index.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ReconstitutionPack = {
  summary: string; // Narrative prose (1-3 paragraphs)
  approachGuidance: string[]; // How to engage
  anchors: Array<{ phrase: string; instruction: string; citation?: string }>;
  openUncertainties: string[];
  nextActions: string[];
  citations: Array<{ id: string; kind: string; uri?: string; citation: string }>;
};

export interface ReconstitutionOptions {
  maxTokens?: number;
  lookbackHours?: number;
  minScore?: number;
  maxRecords?: number;
  config?: OpenClawConfig;
  proseModel?: string;
  useProse?: boolean;
}

export interface ReconstitutionResult {
  text: string;
  estimatedTokens: number;
  recordCount: number;
  sessionCount: number;
  timeRange: { from: string; to: string } | null;
  truncated: boolean;
  pack?: ReconstitutionPack;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_MIN_SCORE = 0.6;
const DEFAULT_MAX_RECORDS = 50;
const CHARS_PER_TOKEN = 4;

// ────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return isoStr.slice(0, 16);
  }
}

function recordTopic(record: MeridiaExperienceRecord): string {
  if (record.content?.topic) {
    return record.content.topic;
  }
  if (record.content?.summary) {
    return record.content.summary.length > 140
      ? `${record.content.summary.slice(0, 137)}...`
      : record.content.summary;
  }
  const reason = record.capture.evaluation.reason;
  if (reason) {
    return reason.length > 140 ? `${reason.slice(0, 137)}...` : reason;
  }
  const tool = record.tool?.name ? `tool:${record.tool.name}` : record.kind;
  return `${tool}${record.tool?.isError ? " (error)" : ""}`;
}

/** Extract first JSON object from text (handles markdown fences). */
function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Prose Pack Functions
// ────────────────────────────────────────────────────────────────────────────

/** Build a concise per-record summary including phenomenology for LLM input. */
function buildRecordSummary(record: MeridiaExperienceRecord): string {
  const parts: string[] = [];
  const time = formatTimestamp(record.ts);
  const score = record.capture.score.toFixed(2);
  const tool = record.tool?.name ?? record.kind;

  parts.push(`[${time}] ${tool} (score: ${score})`);

  if (record.tool?.isError) parts.push("ERROR");

  const topic = recordTopic(record);
  if (topic) parts.push(topic);

  // Include phenomenology context when available
  const phenom = record.content?.phenomenology;
  if (phenom) {
    if (phenom.emotionalSignature?.primary?.length) {
      parts.push(`emotions: ${phenom.emotionalSignature.primary.join(", ")}`);
    }
    if (phenom.engagementQuality) {
      parts.push(`engagement: ${phenom.engagementQuality}`);
    }
    if (phenom.anchors?.length) {
      parts.push(`anchors: ${phenom.anchors.map((a) => a.phrase).join(", ")}`);
    }
    if (phenom.uncertainties?.length) {
      parts.push(`uncertainties: ${phenom.uncertainties.join("; ")}`);
    }
  }

  return parts.join(" | ");
}

/** Parse and validate LLM response into a ReconstitutionPack. */
function parseProsePack(
  raw: Record<string, unknown>,
  records: MeridiaExperienceRecord[],
): ReconstitutionPack | null {
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) return null;

  const approachGuidance = Array.isArray(raw.approachGuidance)
    ? raw.approachGuidance.filter((s): s is string => typeof s === "string")
    : [];

  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors
        .filter(
          (a): a is Record<string, unknown> =>
            !!a &&
            typeof a === "object" &&
            typeof (a as Record<string, unknown>).phrase === "string" &&
            typeof (a as Record<string, unknown>).instruction === "string",
        )
        .map((a) => ({
          phrase: a.phrase as string,
          instruction: a.instruction as string,
          ...(typeof a.citation === "string" ? { citation: a.citation } : {}),
        }))
    : [];

  const openUncertainties = Array.isArray(raw.openUncertainties)
    ? raw.openUncertainties.filter((s): s is string => typeof s === "string")
    : [];

  const nextActions = Array.isArray(raw.nextActions)
    ? raw.nextActions.filter((s): s is string => typeof s === "string")
    : [];

  // Build citations from the source records
  const citations = records.slice(0, 10).map((r) => ({
    id: r.id,
    kind: r.kind,
    citation: `[${r.tool?.name ?? r.kind}@${formatTimestamp(r.ts)}]`,
  }));

  return {
    summary,
    approachGuidance,
    anchors,
    openUncertainties,
    nextActions,
    citations,
  };
}

/** Format a prose pack as markdown for MERIDIA-CONTEXT.md injection. */
function formatProsePack(pack: ReconstitutionPack): string {
  const sections: string[] = [];

  sections.push("## Experiential Continuity\n");
  sections.push(pack.summary);
  sections.push("");

  if (pack.approachGuidance.length > 0) {
    sections.push("### Approach Guidance\n");
    for (const guidance of pack.approachGuidance) {
      sections.push(`- ${guidance}`);
    }
    sections.push("");
  }

  if (pack.anchors.length > 0) {
    sections.push("### Key Anchors\n");
    for (const anchor of pack.anchors) {
      const citation = anchor.citation ? ` ${anchor.citation}` : "";
      sections.push(`- **${anchor.phrase}**: ${anchor.instruction}${citation}`);
    }
    sections.push("");
  }

  if (pack.openUncertainties.length > 0) {
    sections.push("### Open Uncertainties\n");
    for (const unc of pack.openUncertainties) {
      sections.push(`- ${unc}`);
    }
    sections.push("");
  }

  if (pack.nextActions.length > 0) {
    sections.push("### Suggested Next Actions\n");
    for (const action of pack.nextActions) {
      sections.push(`- ${action}`);
    }
    sections.push("");
  }

  if (pack.citations.length > 0) {
    sections.push("### Sources\n");
    sections.push(
      `_Based on ${pack.citations.length} experiential records: ${pack.citations.map((c) => c.citation).join(", ")}_`,
    );
    sections.push("");
  }

  return sections.join("\n").trim() + "\n";
}

/** Generate a prose reconstitution pack via LLM. Returns null on failure. */
async function generateProsePack(
  records: MeridiaExperienceRecord[],
  opts: ReconstitutionOptions,
): Promise<ReconstitutionPack | null> {
  if (!opts.config || !opts.proseModel) return null;

  const recordSummaries = records.map(buildRecordSummary);
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  const prompt = [
    "You are generating a state-restoration context pack for an AI agent starting a new session.",
    "This is NOT a history recap. It is guidance to help the agent regain situational continuity.",
    "",
    "Return ONLY valid JSON matching this schema:",
    "{",
    '  "summary": "1-3 paragraphs of narrative prose describing the current situational context",',
    '  "approachGuidance": ["how to engage with the current state"],',
    '  "anchors": [{ "phrase": "key concept", "instruction": "what to do with it" }],',
    '  "openUncertainties": ["what remains unresolved"],',
    '  "nextActions": ["suggested immediate actions"]',
    "}",
    "",
    "Guidelines:",
    "- Write as if briefing a colleague who is taking over mid-task",
    "- Focus on active context, not historical narrative",
    "- Include emotional/engagement signals if they affect approach",
    "- Anchors should be actionable: what to look for, what to remember",
    "- Uncertainties are things the agent should investigate or clarify",
    "",
    `Recent experiential records (${records.length} total):`,
    ...recordSummaries.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");

  try {
    const res = await completeTextWithModelRef({
      cfg: opts.config,
      modelRef: opts.proseModel,
      prompt,
      timeoutMs: 15_000,
      maxTokens: Math.min(maxTokens, 3000),
    });

    const parsed = extractFirstJsonObject(res.text);
    if (!parsed) return null;

    return parseProsePack(parsed, records);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ────────────────────────────────────────────────────────────────────────────

export async function generateReconstitution(
  opts: ReconstitutionOptions = {},
): Promise<ReconstitutionResult | null> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  const backend = createBackend({ cfg: opts.config });

  const now = new Date();
  const fromDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const fromIso = fromDate.toISOString();
  const toIso = now.toISOString();

  const dateRangeResults = backend.getRecordsByDateRange(fromIso, toIso, {
    minScore,
    limit: maxRecords,
  });

  const records =
    dateRangeResults.length > 0
      ? dateRangeResults.map((r) => r.record)
      : backend.getRecentRecords(Math.min(maxRecords, 10), { minScore }).map((r) => r.record);

  if (records.length === 0) {
    return null;
  }

  const sorted = [...records].sort((a, b) => {
    const scoreDiff = b.capture.score - a.capture.score;
    if (Math.abs(scoreDiff) > 0.1) {
      return scoreDiff;
    }
    return b.ts.localeCompare(a.ts);
  });

  const sessionKeys = new Set<string>();
  for (const r of sorted) {
    if (r.session?.key) sessionKeys.add(r.session.key);
  }

  // Try prose generation if configured
  if (opts.useProse && opts.proseModel) {
    const pack = await generateProsePack(sorted, opts);
    if (pack) {
      const text = formatProsePack(pack);
      return {
        text,
        estimatedTokens: estimateTokens(text),
        recordCount: records.length,
        sessionCount: sessionKeys.size,
        timeRange: { from: fromIso, to: toIso },
        truncated: false,
        pack,
      };
    }
  }

  // Fallback: bullet list format (existing behavior)
  const sections: string[] = [];
  let currentChars = 0;
  let truncated = false;

  const header =
    `## Experiential Continuity — Recent Context\n` +
    `_${records.length} significant experiences from the last ${lookbackHours}h_\n`;
  sections.push(header);
  currentChars += header.length;

  const expHeader = "\n### Key Experiences\n";
  sections.push(expHeader);
  currentChars += expHeader.length;

  for (const record of sorted) {
    const topic = recordTopic(record);
    const time = formatTimestamp(record.ts);
    const score = record.capture.score.toFixed(1);
    const errorTag = record.tool?.isError ? " [error]" : "";
    const line = `- **[${score}]** ${topic}${errorTag} _(${time})_\n`;
    if (currentChars + line.length > maxChars * 0.9) {
      truncated = true;
      break;
    }
    sections.push(line);
    currentChars += line.length;
  }

  const text = sections.join("").trim() + "\n";
  return {
    text,
    estimatedTokens: estimateTokens(text),
    recordCount: records.length,
    sessionCount: sessionKeys.size,
    timeRange: { from: fromIso, to: toIso },
    truncated,
  };
}

// Export for testing
export { buildRecordSummary, parseProsePack, formatProsePack };
