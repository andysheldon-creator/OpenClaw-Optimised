/**
 * SEC-004 (#78) — PII tagging + masking
 *
 * Detection and masking of Personally Identifiable Information (PII)
 * in text content. Detected spans are tagged with a PII type and can
 * be masked using configurable strategies (full redaction, partial
 * masking, or hashing).
 *
 * This builds on the redaction pipeline (CORE-005) with richer type
 * awareness and multiple masking strategies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category of PII detected. */
export type PiiType =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ip_address"
  | "date_of_birth"
  | "name"
  | "address"
  | "passport"
  | "custom";

/** A single detected PII span within a text. */
export type PiiDetection = {
  /** The type of PII found. */
  type: PiiType;
  /** Start character offset (0-based, inclusive). */
  start: number;
  /** End character offset (0-based, exclusive). */
  end: number;
  /** The matched text fragment. */
  matched: string;
  /** Confidence score between 0 and 1 (1 = certain). */
  confidence: number;
};

/** Strategy for masking a detected PII span. */
export type PiiMaskStrategy = "redact" | "partial" | "hash" | "tokenise";

/** Configuration for the masking step. */
export type PiiMaskConfig = {
  /** Default masking strategy when no per-type override is provided. */
  defaultStrategy: PiiMaskStrategy;
  /** Per-type overrides (e.g. emails get `"partial"`, SSNs get `"redact"`). */
  typeOverrides?: Partial<Record<PiiType, PiiMaskStrategy>>;
  /** Placeholder template for fully redacted values (default `"[REDACTED]"`). */
  redactPlaceholder?: string;
  /** Number of leading/trailing characters to keep for partial masking. */
  partialKeep?: number;
};

/** Result of a masking operation on a piece of text. */
export type PiiMaskResult = {
  /** The masked version of the input text. */
  masked: string;
  /** All detections that were masked. */
  detections: PiiDetection[];
  /** Number of PII spans replaced. */
  spansReplaced: number;
};

// ---------------------------------------------------------------------------
// Built-in detection patterns
// ---------------------------------------------------------------------------

type PatternEntry = { type: PiiType; pattern: RegExp; confidence: number };

/**
 * Simple regex-based PII detection rules. These provide baseline coverage
 * and should be supplemented with ML-based detection for production use.
 */
const BUILTIN_PATTERNS: readonly PatternEntry[] = [
  { type: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.95 },
  {
    type: "phone",
    pattern: /\+?1?\s*\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    confidence: 0.8,
  },
  { type: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: 0.9 },
  { type: "credit_card", pattern: /\b(?:\d[ -]*?){13,19}\b/g, confidence: 0.7 },
  { type: "ip_address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, confidence: 0.85 },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Scan text for PII using built-in regex patterns and optional custom
 * patterns.
 *
 * @param text           - The input text to scan.
 * @param customPatterns - Additional patterns to match beyond the built-ins.
 * @returns All PII detections found, sorted by start offset.
 */
export function detectPii(
  text: string,
  customPatterns: readonly PatternEntry[] = [],
): PiiDetection[] {
  const detections: PiiDetection[] = [];
  const allPatterns = [...BUILTIN_PATTERNS, ...customPatterns];

  for (const { type, pattern, confidence } of allPatterns) {
    // Reset stateful regexes.
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      detections.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
        matched: match[0],
        confidence,
      });
    }
  }

  // Sort by position to make downstream processing deterministic.
  return detections.toSorted((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

/**
 * Mask all detected PII spans in the input text according to the provided
 * configuration.
 *
 * @param text   - The original text.
 * @param config - Masking configuration.
 * @returns The masked text along with detection metadata.
 */
export function maskPii(text: string, config: PiiMaskConfig): PiiMaskResult {
  const detections = detectPii(text);

  if (detections.length === 0) {
    return { masked: text, detections: [], spansReplaced: 0 };
  }

  const placeholder = config.redactPlaceholder ?? "[REDACTED]";
  const keep = config.partialKeep ?? 2;

  // Build the masked string by replacing spans back-to-front to preserve offsets.
  let masked = text;
  const reversed = [...detections].toReversed();

  for (const detection of reversed) {
    const strategy = config.typeOverrides?.[detection.type] ?? config.defaultStrategy;

    const replacement = applyStrategy(detection.matched, strategy, placeholder, keep);
    masked = masked.slice(0, detection.start) + replacement + masked.slice(detection.end);
  }

  return { masked, detections, spansReplaced: detections.length };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Apply a masking strategy to a single matched string. */
function applyStrategy(
  value: string,
  strategy: PiiMaskStrategy,
  placeholder: string,
  keep: number,
): string {
  switch (strategy) {
    case "redact":
      return placeholder;

    case "partial": {
      if (value.length <= keep * 2) {
        return placeholder;
      }
      const head = value.slice(0, keep);
      const tail = value.slice(-keep);
      return `${head}${"*".repeat(value.length - keep * 2)}${tail}`;
    }

    case "hash":
      // TODO: replace with a real HMAC/SHA-256 hash once crypto is wired in
      return `[HASH:${simpleHash(value)}]`;

    case "tokenise":
      // TODO: implement reversible tokenisation with a secure token vault
      return `[TOKEN:${simpleHash(value)}]`;

    default:
      return placeholder;
  }
}

/** Placeholder hash function — NOT cryptographically secure. */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
