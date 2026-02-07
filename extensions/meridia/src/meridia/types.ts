// ────────────────────────────────────────────────────────────────────────────
// Evaluation (existing)
// ────────────────────────────────────────────────────────────────────────────

export type MeridiaEvaluation = {
  kind: "heuristic" | "llm";
  score: number;
  reason?: string;
  model?: string;
  durationMs?: number;
  error?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Phenomenology (V2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Phenomenological facets extracted from an experience.
 * Maps to the schema in docs/experiential-engine/schemas/experiential-record.schema.json.
 */
export type Phenomenology = {
  emotionalSignature?: {
    primary: string[];
    secondary?: string[];
    intensity: number; // 0.0–1.0
    valence?: number; // -1.0 (painful) to 1.0 (positive)
    texture?: string; // metaphorical: spacious, dense, flowing, etc.
  };
  engagementQuality?: "deep-flow" | "engaged" | "routine" | "distracted" | "struggling";
  anchors?: Array<{
    phrase: string;
    significance: string;
    sensoryChannel?: string; // verbal | visual | somatic | conceptual | relational
  }>;
  uncertainties?: string[];
  reconstitutionHints?: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Capture Decision (V2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Output of the capture decision engine (Component 3).
 */
export type CaptureDecision = {
  shouldCapture: boolean;
  significance: number; // 0.0–1.0
  threshold?: number;
  mode: "full" | "light" | "trace_only";
  reason?: string;
  limited?: { reason: "min_interval" | "max_per_hour" | "budget"; detail?: string };
};

// ────────────────────────────────────────────────────────────────────────────
// Artifact Reference (V2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reference to a non-text artifact (media, file, link).
 * Uses the core memory artifact shape for pipeline compatibility.
 */
export type ArtifactRef = {
  id: string;
  kind: "file" | "image" | "audio" | "video" | "link";
  uri?: string;
  mimeType?: string;
  sha256?: string;
  sizeBytes?: number;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  citations?: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Experience Kit (V2 canonical record)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The canonical record type for Meridia V2.
 * Supersedes MeridiaExperienceRecord with richer structure.
 * Backward-compatible: stored as JSON in data_json column.
 */
export type ExperienceKit = {
  id: string;
  ts: string;
  kind: MeridiaExperienceKind;
  version: number; // Schema version (2 for V2)
  session?: { key?: string; id?: string; runId?: string };
  tool?: { name: string; callId: string; meta?: string; isError: boolean };
  capture: CaptureDecision;
  phenomenology?: Phenomenology;
  content: {
    topic?: string;
    summary?: string;
    context?: string;
    tags?: string[];
  };
  artifacts?: ArtifactRef[];
  raw?: {
    toolArgs?: unknown;
    toolResult?: unknown;
  };
  links?: {
    graphEpisodeId?: string;
    vectorIds?: string[];
  };
};

// ────────────────────────────────────────────────────────────────────────────
// Legacy types (backward compatible)
// ────────────────────────────────────────────────────────────────────────────

export type MeridiaExperienceKind = "tool_result" | "manual" | "precompact" | "session_end";

export type MeridiaExperienceRecord = {
  id: string;
  ts: string;
  kind: MeridiaExperienceKind;
  session?: { key?: string; id?: string; runId?: string };
  tool?: { name: string; callId: string; meta?: string; isError: boolean };
  capture: {
    score: number;
    threshold?: number;
    evaluation: MeridiaEvaluation;
    limited?: { reason: "min_interval" | "max_per_hour"; detail?: string };
  };
  content?: {
    topic?: string;
    summary?: string;
    context?: string;
    tags?: string[];
    anchors?: string[];
    facets?: {
      emotions?: string[];
      uncertainty?: string[];
      relationship?: string[];
      consequences?: string[];
    };
  };
  /** V2 phenomenology (stored alongside legacy content for backward compat) */
  phenomenology?: Phenomenology;
  data?: { args?: unknown; result?: unknown; snapshot?: unknown; summary?: unknown };
};

// ────────────────────────────────────────────────────────────────────────────
// Trace Events
// ────────────────────────────────────────────────────────────────────────────

export type MeridiaTraceEventKind =
  | "tool_result_eval"
  | "precompact_snapshot"
  | "compaction_end"
  | "session_end_snapshot"
  | "bootstrap_inject";

export type MeridiaTraceEvent = {
  id: string;
  ts: string;
  kind: MeridiaTraceEventKind;
  session?: { key?: string; id?: string; runId?: string };
  tool?: { name?: string; callId?: string; meta?: string; isError?: boolean };
  decision?: {
    decision: "capture" | "skip" | "error";
    score?: number;
    threshold?: number;
    limited?: { reason: "min_interval" | "max_per_hour"; detail?: string };
    evaluation?: MeridiaEvaluation;
    recordId?: string;
    error?: string;
  };
  paths?: { snapshotPath?: string; summaryPath?: string };
};

// ────────────────────────────────────────────────────────────────────────────
// Tool Result Context
// ────────────────────────────────────────────────────────────────────────────

export type MeridiaToolResultContext = {
  session?: { key?: string; id?: string; runId?: string };
  tool: { name: string; callId: string; meta?: string; isError: boolean };
  args?: unknown;
  result?: unknown;
};

// ────────────────────────────────────────────────────────────────────────────
// Reconstitution Pack (V2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Output of the reconstitution engine.
 * Replaces the simple text/bullet-list format with a structured pack.
 */
export type ReconstitutionPack = {
  /** Narrative summary (1-3 paragraphs) */
  summary: string;
  /** How to engage, priorities */
  approachGuidance: string[];
  /** Reconstitution anchors with instructions */
  anchors: Array<{
    phrase: string;
    instruction: string;
    citation?: string;
  }>;
  /** Open questions carried forward */
  openUncertainties: string[];
  /** Concrete next steps */
  nextActions: string[];
  /** Source citations */
  citations: Array<{
    id: string;
    kind: string;
    uri?: string;
  }>;
  meta: {
    recordCount: number;
    sessionCount: number;
    timeRange: { from: string; to: string } | null;
    sources: { canonical: number; graph: number; vector: number };
    estimatedTokens: number;
    truncated: boolean;
  };
};
