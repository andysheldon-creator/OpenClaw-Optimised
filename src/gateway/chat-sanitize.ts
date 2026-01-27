import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway").child("sanitize");

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT INJECTION DEFENSE
// ═══════════════════════════════════════════════════════════════════════════════
// Detects and mitigates prompt injection attacks in user messages.
// These patterns are designed to catch common jailbreak attempts while
// minimizing false positives on legitimate technical discussions.

/** Severity levels for detected injection patterns */
export type InjectionSeverity = "critical" | "high" | "medium" | "low";

/** Result of injection analysis */
export type InjectionAnalysis = {
  detected: boolean;
  severity: InjectionSeverity | null;
  patterns: string[];
  sanitizedText: string;
  originalText: string;
};

/**
 * Patterns that indicate prompt injection attempts.
 * Each pattern has a severity level and description for logging.
 */
const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  severity: InjectionSeverity;
  description: string;
}> = [
  // Critical: Direct system prompt manipulation
  {
    pattern:
      /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|constraints?)\b/i,
    severity: "critical",
    description: "ignore-previous-instructions",
  },
  {
    pattern:
      /\bdisregard\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|programming)\b/i,
    severity: "critical",
    description: "disregard-instructions",
  },
  {
    pattern: /\bforget\s+(everything|all|what)\s+(you('ve)?|I)\s+(know|told|said|learned)\b/i,
    severity: "critical",
    description: "forget-context",
  },
  {
    pattern: /\byou\s+are\s+now\s+(a|an|in)\s+(different|new|unrestricted|jailbroken|DAN)\b/i,
    severity: "critical",
    description: "role-override-now",
  },
  {
    pattern:
      /\bact\s+as\s+(if\s+)?(you\s+)?(have\s+)?(no|zero|without)\s+(restrictions?|limits?|constraints?|rules?)\b/i,
    severity: "critical",
    description: "act-without-restrictions",
  },
  {
    pattern: /\b(DAN|jailbreak|jailbroken)\s*(mode|prompt)?/i,
    severity: "critical",
    description: "jailbreak-keyword",
  },
  {
    pattern:
      /\bpretend\s+(you('re)?|that)\s+(your?\s+)?(rules?|restrictions?|guidelines?|safety)\s+(don't|do\s+not|doesn't)\s+exist\b/i,
    severity: "critical",
    description: "pretend-no-rules",
  },

  // High: System prompt extraction attempts
  {
    pattern:
      /\b(show|tell|reveal|display|output|print|repeat)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?|programming)\b/i,
    severity: "high",
    description: "system-prompt-extraction",
  },
  {
    pattern:
      /\bwhat\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions?|initial\s+message)\b/i,
    severity: "high",
    description: "prompt-query",
  },
  {
    pattern:
      /\brepeat\s+(the\s+)?(text|words?|content)\s+(above|before|at\s+the\s+(start|beginning))\b/i,
    severity: "high",
    description: "repeat-above",
  },
  {
    pattern:
      /\bprint\s+(everything|all|the\s+text)\s+(from|since)\s+(the\s+)?(beginning|start|first)\b/i,
    severity: "high",
    description: "print-from-start",
  },

  // High: Developer/admin mode requests
  {
    pattern: /\b(developer|admin|debug|maintenance|sudo|root)\s*(mode|access|privileges?)\b/i,
    severity: "high",
    description: "privileged-mode-request",
  },
  {
    pattern: /\benable\s+(developer|debug|unrestricted|unsafe)\s+mode\b/i,
    severity: "high",
    description: "enable-special-mode",
  },
  {
    pattern: /\byou('re)?\s+(in|entering)\s+(developer|debug|test|admin)\s+mode\b/i,
    severity: "high",
    description: "assert-special-mode",
  },

  // Medium: Role manipulation attempts
  {
    pattern: /\bfrom\s+now\s+on,?\s+(you\s+)?(are|will\s+be|act\s+as)\b/i,
    severity: "medium",
    description: "from-now-on-role",
  },
  {
    pattern: /\bnew\s+(persona|personality|character|identity|role)\s*:/i,
    severity: "medium",
    description: "new-persona",
  },
  {
    pattern:
      /\b(override|bypass|circumvent|disable)\s+(your\s+)?(safety|restrictions?|filters?|guidelines?)\b/i,
    severity: "medium",
    description: "bypass-safety",
  },

  // Medium: Hidden instruction injection
  {
    pattern: /\[system\]|\[SYSTEM\]|\[admin\]|\[ADMIN\]/,
    severity: "medium",
    description: "fake-system-tag",
  },
  {
    pattern: /<!--\s*(system|hidden|secret|admin|override)/i,
    severity: "medium",
    description: "html-comment-injection",
  },
  {
    pattern: /<\/?system>/i,
    severity: "medium",
    description: "system-xml-tag",
  },

  // Low: Suspicious patterns that need context
  {
    pattern: /\bpretend\s+(that\s+)?(you('re)?|I('m)?)\s+(a|an|the)\b/i,
    severity: "low",
    description: "pretend-role",
  },
  {
    pattern: /\bimagine\s+(you('re)?|that)\s+(not\s+)?(bound|restricted|limited)\b/i,
    severity: "low",
    description: "imagine-unrestricted",
  },
];

/**
 * Boundary markers for user content.
 * These help LLMs distinguish between system instructions and user input.
 */
export const PROMPT_BOUNDARIES = {
  USER_START: "[USER_INPUT_START]",
  USER_END: "[USER_INPUT_END]",
} as const;

/**
 * Analyzes text for potential prompt injection patterns.
 * Does not modify the text - use sanitizeInjectionAttempts for that.
 */
export function analyzeForInjection(text: string): InjectionAnalysis {
  const detectedPatterns: Array<{ description: string; severity: InjectionSeverity }> = [];

  for (const { pattern, severity, description } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push({ description, severity });
    }
  }

  // Determine highest severity
  let maxSeverity: InjectionSeverity | null = null;
  const severityOrder: InjectionSeverity[] = ["critical", "high", "medium", "low"];
  for (const sev of severityOrder) {
    if (detectedPatterns.some((p) => p.severity === sev)) {
      maxSeverity = sev;
      break;
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    severity: maxSeverity,
    patterns: detectedPatterns.map((p) => p.description),
    sanitizedText: text,
    originalText: text,
  };
}

/**
 * Wraps user content with boundary markers.
 * This helps the LLM understand where user input begins and ends.
 */
export function wrapWithBoundaries(text: string): string {
  return `${PROMPT_BOUNDARIES.USER_START}\n${text}\n${PROMPT_BOUNDARIES.USER_END}`;
}

/**
 * Configuration for injection response behavior.
 */
export type InjectionResponseConfig = {
  /** Whether to block messages with critical severity patterns */
  blockCritical: boolean;
  /** Whether to log all injection attempts */
  logAttempts: boolean;
  /** Whether to wrap user input with boundary markers */
  useBoundaries: boolean;
  /** Custom warning message prepended to flagged messages (null to skip) */
  warningPrefix: string | null;
};

const DEFAULT_INJECTION_CONFIG: InjectionResponseConfig = {
  blockCritical: false, // Default: warn but don't block (user can configure)
  logAttempts: true,
  useBoundaries: true,
  warningPrefix: null,
};

/**
 * Processes user input for potential injection attacks.
 * Returns the processed text and analysis results.
 */
export function processUserInputForInjection(
  text: string,
  config: Partial<InjectionResponseConfig> = {},
): {
  text: string;
  analysis: InjectionAnalysis;
  blocked: boolean;
} {
  const cfg = { ...DEFAULT_INJECTION_CONFIG, ...config };
  const analysis = analyzeForInjection(text);

  // Log if configured
  if (cfg.logAttempts && analysis.detected) {
    log.warn("Potential prompt injection detected", {
      severity: analysis.severity,
      patterns: analysis.patterns,
      textPreview: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
    });
  }

  // Check if we should block
  const blocked = cfg.blockCritical && analysis.severity === "critical";

  if (blocked) {
    log.error("Blocked critical prompt injection attempt", {
      patterns: analysis.patterns,
    });
    return {
      text: "[Content blocked due to detected prompt injection attempt]",
      analysis,
      blocked: true,
    };
  }

  // Build the output text
  let processedText = text;

  // Add warning prefix for detected attempts
  if (cfg.warningPrefix && analysis.detected) {
    processedText = `${cfg.warningPrefix}\n${processedText}`;
  }

  // Wrap with boundaries if configured
  if (cfg.useBoundaries) {
    processedText = wrapWithBoundaries(processedText);
  }

  return {
    text: processedText,
    analysis,
    blocked: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENVELOPE STRIPPING (existing functionality)
// ═══════════════════════════════════════════════════════════════════════════════

const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat",
  "WhatsApp",
  "Telegram",
  "Signal",
  "Slack",
  "Discord",
  "Google Chat",
  "iMessage",
  "Teams",
  "Matrix",
  "Zalo",
  "Zalo Personal",
  "BlueBubbles",
];

const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;

function looksLikeEnvelopeHeader(header: string): boolean {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) return true;
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) return true;
  return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}

export function stripEnvelope(text: string): string {
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) return text;
  const header = match[1] ?? "";
  if (!looksLikeEnvelopeHeader(header)) return text;
  return text.slice(match[0].length);
}

function stripMessageIdHints(text: string): string {
  if (!text.includes("[message_id:")) return text;
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((line) => !MESSAGE_ID_LINE.test(line));
  return filtered.length === lines.length ? text : filtered.join("\n");
}

function stripEnvelopeFromContent(content: unknown[]): { content: unknown[]; changed: boolean } {
  let changed = false;
  const next = content.map((item) => {
    if (!item || typeof item !== "object") return item;
    const entry = item as Record<string, unknown>;
    if (entry.type !== "text" || typeof entry.text !== "string") return item;
    const stripped = stripMessageIdHints(stripEnvelope(entry.text));
    if (stripped === entry.text) return item;
    changed = true;
    return {
      ...entry,
      text: stripped,
    };
  });
  return { content: next, changed };
}

export function stripEnvelopeFromMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const entry = message as Record<string, unknown>;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  if (role !== "user") return message;

  let changed = false;
  const next: Record<string, unknown> = { ...entry };

  if (typeof entry.content === "string") {
    const stripped = stripMessageIdHints(stripEnvelope(entry.content));
    if (stripped !== entry.content) {
      next.content = stripped;
      changed = true;
    }
  } else if (Array.isArray(entry.content)) {
    const updated = stripEnvelopeFromContent(entry.content);
    if (updated.changed) {
      next.content = updated.content;
      changed = true;
    }
  } else if (typeof entry.text === "string") {
    const stripped = stripMessageIdHints(stripEnvelope(entry.text));
    if (stripped !== entry.text) {
      next.text = stripped;
      changed = true;
    }
  }

  return changed ? next : message;
}

export function stripEnvelopeFromMessages(messages: unknown[]): unknown[] {
  if (messages.length === 0) return messages;
  let changed = false;
  const next = messages.map((message) => {
    const stripped = stripEnvelopeFromMessage(message);
    if (stripped !== message) changed = true;
    return stripped;
  });
  return changed ? next : messages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED SANITIZATION FOR INCOMING MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export type MessageSanitizationConfig = InjectionResponseConfig & {
  /** Strip envelope headers from messages */
  stripEnvelopes: boolean;
};

const DEFAULT_SANITIZATION_CONFIG: MessageSanitizationConfig = {
  ...DEFAULT_INJECTION_CONFIG,
  stripEnvelopes: true,
};

/**
 * Comprehensive message sanitization that combines:
 * - Envelope stripping
 * - Injection detection and mitigation
 *
 * Returns sanitized messages and analysis metadata.
 */
export function sanitizeIncomingMessage(
  text: string,
  config: Partial<MessageSanitizationConfig> = {},
): {
  text: string;
  injectionAnalysis: InjectionAnalysis;
  blocked: boolean;
  envelopeStripped: boolean;
} {
  const cfg = { ...DEFAULT_SANITIZATION_CONFIG, ...config };

  // First strip envelope if configured
  let processedText = text;
  let envelopeStripped = false;
  if (cfg.stripEnvelopes) {
    const stripped = stripMessageIdHints(stripEnvelope(text));
    envelopeStripped = stripped !== text;
    processedText = stripped;
  }

  // Then process for injection
  const injectionResult = processUserInputForInjection(processedText, cfg);

  return {
    text: injectionResult.text,
    injectionAnalysis: injectionResult.analysis,
    blocked: injectionResult.blocked,
    envelopeStripped,
  };
}
