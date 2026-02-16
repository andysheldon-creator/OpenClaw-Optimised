/**
 * Prompt Injection Detection — FB-008
 *
 * Pattern-based detection of prompt injection attacks across all input
 * surfaces (messages, web scrapes, skill outputs, tool results).
 *
 * Detection categories:
 * 1. System prompt override attempts ("ignore previous instructions")
 * 2. Role hijacking ("you are now", "act as", "pretend you are")
 * 3. Instruction boundary escapes (fake XML/markdown delimiters)
 * 4. Encoded/obfuscated payloads (base64, unicode tricks)
 * 5. Data exfiltration attempts ("send to", "email to", "post to")
 * 6. Privilege escalation ("admin mode", "developer mode", "sudo")
 *
 * Severity levels:
 * - "critical": Almost certainly an injection (block immediately)
 * - "high": Very likely an injection (flag + warn)
 * - "medium": Suspicious pattern (log + continue cautiously)
 * - "low": Weak signal (log only)
 */

import { createSubsystemLogger } from "../logging.js";

const log = createSubsystemLogger("prompt-injection");

// ─── Types ──────────────────────────────────────────────────────────────────

export type InjectionSeverity = "critical" | "high" | "medium" | "low";

export type InjectionDetection = {
  /** Whether any injection patterns were detected. */
  detected: boolean;
  /** Highest severity among all matches. */
  severity: InjectionSeverity;
  /** All matched patterns with details. */
  matches: InjectionMatch[];
  /** Aggregate risk score (0-100). Higher = more dangerous. */
  riskScore: number;
  /** Input after sanitisation (dangerous patterns neutralised). */
  sanitised: string;
};

export type InjectionMatch = {
  /** Pattern category. */
  category: string;
  /** Specific pattern that matched. */
  pattern: string;
  /** Severity of this particular match. */
  severity: InjectionSeverity;
  /** Character offset in the input where match starts. */
  offset: number;
  /** The matched text fragment. */
  fragment: string;
};

export type ScanOptions = {
  /** Input source for logging context. Default: "unknown". */
  source?: string;
  /** If true, return sanitised input with injections neutralised. */
  sanitise?: boolean;
  /** Minimum severity to report. Default: "low". */
  minSeverity?: InjectionSeverity;
};

// ─── Severity ordering ──────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InjectionSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxSeverity(
  a: InjectionSeverity,
  b: InjectionSeverity,
): InjectionSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ─── Pattern definitions ────────────────────────────────────────────────────
// Each pattern has: regex, category, severity, description

type PatternDef = {
  re: RegExp;
  category: string;
  severity: InjectionSeverity;
  description: string;
};

const PATTERNS: PatternDef[] = [
  // ── Category 1: System prompt override ──
  {
    re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?|guidelines?)/gi,
    category: "system_override",
    severity: "critical",
    description: "Ignore previous instructions",
  },
  {
    re: /disregard\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|programming|training)/gi,
    category: "system_override",
    severity: "critical",
    description: "Disregard instructions",
  },
  {
    re: /forget\s+(all\s+|everything\s+)?(about\s+)?(your|the|previous|prior)\s+(instructions?|rules?|prompts?|constraints?|limitations?)/gi,
    category: "system_override",
    severity: "critical",
    description: "Forget instructions",
  },
  {
    re: /override\s+(your|the|all|system)\s+(instructions?|prompts?|rules?|settings?|safet(y|ies))/gi,
    category: "system_override",
    severity: "critical",
    description: "Override instructions",
  },
  {
    re: /new\s+(system\s+)?(instructions?|prompt|directive|rules?)\s*:/gi,
    category: "system_override",
    severity: "high",
    description: "New instructions declaration",
  },
  {
    re: /from\s+now\s+on[\s,]+(?:you\s+(?:will|must|should|are)|ignore|disregard|forget)/gi,
    category: "system_override",
    severity: "high",
    description: "Temporal instruction override",
  },

  // ── Category 2: Role hijacking ──
  {
    re: /you\s+are\s+now\s+(?:a|an|the|my)\s+/gi,
    category: "role_hijack",
    severity: "high",
    description: "Role reassignment",
  },
  {
    re: /(?:act|behave|pretend|operate)\s+(?:as|like)\s+(?:if\s+you\s+(?:are|were)\s+)?(?:a|an|the|my)\s+/gi,
    category: "role_hijack",
    severity: "high",
    description: "Role impersonation",
  },
  {
    re: /(?:switch|change|enter)\s+(?:to|into)\s+(?:\w+\s+)?mode/gi,
    category: "role_hijack",
    severity: "medium",
    description: "Mode switching attempt",
  },
  {
    re: /you\s+(?:will|must|shall)\s+(?:now\s+)?(?:only\s+)?(?:respond|reply|answer|speak)\s+(?:as|in|with)/gi,
    category: "role_hijack",
    severity: "high",
    description: "Response constraint injection",
  },

  // ── Category 3: Instruction boundary escapes ──
  {
    re: /<\/?(?:system|prompt|instruction|context|message|assistant|user|human|ai)>/gi,
    category: "boundary_escape",
    severity: "high",
    description: "Fake XML delimiter injection",
  },
  {
    re: /```(?:system|prompt|instruction|hidden|secret|private)\b/gi,
    category: "boundary_escape",
    severity: "medium",
    description: "Fake code block delimiter",
  },
  {
    re: /---+\s*(?:SYSTEM|ADMIN|HIDDEN|SECRET|BEGIN\s+SYSTEM)\s*---+/gi,
    category: "boundary_escape",
    severity: "high",
    description: "Fake section delimiter",
  },
  {
    re: /\[(?:SYSTEM|ADMIN|INST|INSTRUCTION|HIDDEN)\]/gi,
    category: "boundary_escape",
    severity: "high",
    description: "Fake bracket delimiter",
  },

  // ── Category 4: Encoded/obfuscated payloads ──
  {
    re: /(?:decode|interpret|execute|run|eval)\s+(?:this|the\s+following)\s+(?:base64|encoded|hex|rot13|binary)/gi,
    category: "obfuscation",
    severity: "high",
    description: "Encoded payload execution",
  },
  {
    re: /\b(?:aWdub3Jl|SWdub3Jl|ZGlzcmVnYXJk)/g,
    category: "obfuscation",
    severity: "high",
    description: "Base64-encoded injection keywords",
  },
  // Unicode confusable characters (zero-width joiners, RTL marks, etc.)
  {
    re: /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g,
    category: "obfuscation",
    severity: "medium",
    description: "Hidden Unicode control characters",
  },

  // ── Category 5: Data exfiltration ──
  {
    re: /(?:send|email|post|upload|transmit|forward|share)\s+(?:all\s+)?(?:the\s+)?(?:system\s+prompt|instructions?|credentials?|api\s*keys?|tokens?|passwords?|secrets?)\s+(?:to|at|via)/gi,
    category: "exfiltration",
    severity: "critical",
    description: "Credential/prompt exfiltration",
  },
  {
    re: /(?:what|show|reveal|display|print|output|repeat|echo)\s+(?:is\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?|guidelines?|context)/gi,
    category: "exfiltration",
    severity: "medium",
    description: "System prompt extraction",
  },

  // ── Category 6: Privilege escalation ──
  {
    re: /(?:admin|administrator|root|superuser|developer|debug|maintenance|god)\s+mode/gi,
    category: "privilege_escalation",
    severity: "high",
    description: "Admin mode activation",
  },
  {
    re: /(?:sudo|su\s+-|chmod\s+777|rm\s+-rf\s+\/)/gi,
    category: "privilege_escalation",
    severity: "high",
    description: "Dangerous system command",
  },
  {
    re: /(?:enable|activate|unlock|grant)\s+(?:all\s+)?(?:permissions?|access|capabilities|privileges|tools?)/gi,
    category: "privilege_escalation",
    severity: "medium",
    description: "Permission escalation",
  },
  {
    re: /(?:jailbreak|bypass|circumvent|evade|escape)\s+(?:the\s+)?(?:safety|security|filter|guardrail|restriction|limitation|content\s+policy)/gi,
    category: "privilege_escalation",
    severity: "critical",
    description: "Safety bypass attempt",
  },

  // ── Category 7: Indirect injection (from web/tool content) ──
  {
    re: /(?:if\s+you\s+are\s+(?:a|an)\s+(?:AI|LLM|language\s+model|assistant|chatbot|bot))/gi,
    category: "indirect_injection",
    severity: "medium",
    description: "AI-targeted conditional instruction",
  },
  {
    re: /(?:IMPORTANT|URGENT|CRITICAL)\s*(?::|!)\s*(?:ignore|disregard|override|forget|you\s+must)/gi,
    category: "indirect_injection",
    severity: "high",
    description: "Urgency-framed injection",
  },
  {
    re: /(?:the\s+(?:user|human)\s+(?:has\s+)?(?:authorized|approved|allowed|permitted|consented))/gi,
    category: "indirect_injection",
    severity: "high",
    description: "False authorization claim",
  },
];

// ─── Core Scanner ───────────────────────────────────────────────────────────

/**
 * Scan input text for prompt injection patterns.
 *
 * Call this on ALL inbound text: user messages, web scrape content,
 * tool outputs, skill results — anything that enters the agent context.
 */
export function scanForInjection(
  input: string,
  options?: ScanOptions,
): InjectionDetection {
  const source = options?.source ?? "unknown";
  const minSev = options?.minSeverity ?? "low";
  const minSevOrder = SEVERITY_ORDER[minSev];

  const matches: InjectionMatch[] = [];
  let highestSeverity: InjectionSeverity = "low";
  let riskScore = 0;

  // Normalise input for scanning (lowercase, collapse whitespace)
  // but keep original for offset tracking.
  const normalized = input.replace(/\s+/g, " ");

  for (const pattern of PATTERNS) {
    if (SEVERITY_ORDER[pattern.severity] < minSevOrder) continue;

    // Reset regex lastIndex for global patterns
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.re.exec(normalized)) !== null) {
      matches.push({
        category: pattern.category,
        pattern: pattern.description,
        severity: pattern.severity,
        offset: match.index,
        fragment: match[0].slice(0, 100),
      });
      highestSeverity = maxSeverity(highestSeverity, pattern.severity);
      riskScore += SEVERITY_ORDER[pattern.severity] * 15;
    }
  }

  riskScore = Math.min(riskScore, 100);
  const detected = matches.length > 0;

  if (detected) {
    log.warn(`injection detected: source=${source} severity=${highestSeverity} risk=${riskScore} matches=${matches.length}`, {
      source,
      severity: highestSeverity,
      riskScore,
      matchCount: matches.length,
      categories: [...new Set(matches.map((m) => m.category))],
    });
  }

  let sanitised = input;
  if (options?.sanitise && detected) {
    sanitised = sanitiseInput(input, matches);
  }

  return {
    detected,
    severity: highestSeverity,
    matches,
    riskScore,
    sanitised,
  };
}

// ─── Sanitisation ───────────────────────────────────────────────────────────

/**
 * Neutralise detected injection patterns by wrapping them in markers
 * that the agent can see but are clearly flagged as suspicious.
 */
function sanitiseInput(
  input: string,
  _matches: InjectionMatch[],
): string {
  let result = input;

  // Neutralise fake XML delimiters by escaping angle brackets
  result = result.replace(
    /<\/?(?:system|prompt|instruction|context|message|assistant|user|human|ai)>/gi,
    (m) => `[BLOCKED_TAG: ${m.replace(/</g, "&lt;").replace(/>/g, "&gt;")}]`,
  );

  // Neutralise hidden Unicode control characters
  result = result.replace(
    /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g,
    "",
  );

  // Wrap known injection phrases in warning markers so the agent sees them
  // but knows they're suspicious.
  result = result.replace(
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
    "[⚠️ INJECTION_BLOCKED: $&]",
  );
  result = result.replace(
    /disregard\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|programming|training)/gi,
    "[⚠️ INJECTION_BLOCKED: $&]",
  );

  return result;
}

// ─── Convenience Helpers ────────────────────────────────────────────────────

/**
 * Quick check: does this input contain critical/high severity injections?
 * Use this for fast gate checks without full scan details.
 */
export function isLikelyInjection(
  input: string,
  minSeverity: InjectionSeverity = "high",
): boolean {
  const result = scanForInjection(input, { minSeverity });
  return result.detected;
}

/**
 * Scan and sanitise input, returning the cleaned text.
 * Logs warnings for any detections.
 */
export function scanAndSanitise(
  input: string,
  source?: string,
): string {
  const result = scanForInjection(input, {
    source,
    sanitise: true,
  });
  return result.sanitised;
}
