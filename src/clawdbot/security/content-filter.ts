/**
 * SEC-008 (#82) — Outbound content policy filters
 *
 * Rule-based filtering engine for outbound content (messages, emails,
 * API responses). Each rule matches content against patterns or
 * categories and produces an allow/block/redact decision. Content
 * filters run after generation but before delivery, acting as a final
 * safety gate.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Content categories that filters can target. */
export type ContentCategory =
  | "profanity"
  | "pii"
  | "secrets"
  | "malicious_url"
  | "spam"
  | "off_topic"
  | "custom";

/** Action to take when a filter rule matches. */
export type FilterAction = "allow" | "block" | "redact" | "flag";

/** A single content filter rule. */
export type ContentFilterRule = {
  /** Unique rule identifier. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Content category this rule targets. */
  category: ContentCategory;
  /** Regex pattern to match against content (optional for category-only rules). */
  pattern?: string;
  /** Action to take when the rule matches. */
  action: FilterAction;
  /** If true, the rule is actively enforced. */
  enabled: boolean;
  /** Priority — lower numbers evaluate first. */
  priority: number;
};

/** Metadata about a single rule match within filtered content. */
export type FilterMatch = {
  /** The rule that matched. */
  ruleId: string;
  /** Category of the match. */
  category: ContentCategory;
  /** Action prescribed by the matched rule. */
  action: FilterAction;
  /** The text fragment that triggered the match (if pattern-based). */
  matchedText?: string;
  /** Start offset in the original content. */
  start?: number;
  /** End offset in the original content. */
  end?: number;
};

/** The result of filtering a piece of outbound content. */
export type FilterResult = {
  /** Whether the content is allowed to be sent as-is. */
  allowed: boolean;
  /** The (possibly redacted) content to deliver. Null if blocked. */
  content: string | null;
  /** All rule matches that fired. */
  matches: FilterMatch[];
  /** Overall action applied to the content. */
  action: FilterAction;
  /** ISO-8601 timestamp of when the filtering was performed. */
  filteredAt: string;
};

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

/** Baseline content filter rules. */
export const DEFAULT_FILTER_RULES: readonly ContentFilterRule[] = [
  {
    id: "secrets-env-vars",
    description: "Block content containing environment variable patterns.",
    category: "secrets",
    pattern: "(?:^|\\s)(?:export\\s+)?[A-Z_]{2,}=\\S+",
    action: "redact",
    enabled: true,
    priority: 10,
  },
  {
    id: "secrets-api-keys",
    description: "Block content containing common API key patterns.",
    category: "secrets",
    pattern: "(?:api[_-]?key|secret|token|password)\\s*[:=]\\s*\\S+",
    action: "redact",
    enabled: true,
    priority: 10,
  },
  {
    id: "malicious-url",
    description: "Flag content with suspicious URL patterns.",
    category: "malicious_url",
    pattern: "https?://(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d+)?/",
    action: "flag",
    enabled: true,
    priority: 20,
  },
];

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Filter outbound content against a set of rules.
 *
 * Rules are evaluated in priority order (lower first). The strictest
 * action wins: block > redact > flag > allow. If any rule blocks,
 * the content is not delivered. Redact rules replace matched text
 * with a placeholder.
 *
 * @param content     - The outbound text to filter.
 * @param rules       - Rules to evaluate (defaults to `DEFAULT_FILTER_RULES`).
 * @param placeholder - Replacement text for redacted spans (default `"[REDACTED]"`).
 * @returns The filter result including the (possibly modified) content.
 */
export function filterOutboundContent(
  content: string,
  rules: readonly ContentFilterRule[] = DEFAULT_FILTER_RULES,
  placeholder = "[REDACTED]",
): FilterResult {
  const matches: FilterMatch[] = [];
  const enabledRules = rules.filter((r) => r.enabled).toSorted((a, b) => a.priority - b.priority);

  let modified = content;
  let overallAction: FilterAction = "allow";

  for (const rule of enabledRules) {
    if (!rule.pattern) {
      continue;
    }

    // TODO: cache compiled regex for performance
    const re = new RegExp(rule.pattern, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(content)) !== null) {
      matches.push({
        ruleId: rule.id,
        category: rule.category,
        action: rule.action,
        matchedText: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });

      // Escalate the overall action.
      overallAction = stricterAction(overallAction, rule.action);
    }
  }

  // Apply redactions (back-to-front to preserve offsets).
  if (overallAction === "redact" || matches.some((m) => m.action === "redact")) {
    const redactMatches = matches
      .filter((m) => m.action === "redact" && m.start !== undefined && m.end !== undefined)
      .toSorted((a, b) => (b.start ?? 0) - (a.start ?? 0));

    for (const m of redactMatches) {
      if (m.start !== undefined && m.end !== undefined) {
        modified = modified.slice(0, m.start) + placeholder + modified.slice(m.end);
      }
    }
  }

  const blocked = overallAction === "block";

  return {
    allowed: !blocked,
    content: blocked ? null : modified,
    matches,
    action: overallAction,
    filteredAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Action severity ordering — higher index is stricter. */
const ACTION_SEVERITY: Record<FilterAction, number> = {
  allow: 0,
  flag: 1,
  redact: 2,
  block: 3,
};

/** Return the stricter of two filter actions. */
function stricterAction(a: FilterAction, b: FilterAction): FilterAction {
  return ACTION_SEVERITY[a] >= ACTION_SEVERITY[b] ? a : b;
}
