import type { SessionEntry } from "../../config/sessions.js";

export type IntentGateContext = {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
};

const PLANNING_OR_META_PATTERNS: RegExp[] = [
  /\b(plan|planning|roadmap|strategy|strategic|prioriti(?:y|es))\b/i,
  /\b(compare|trade[- ]?offs?|pros?\s*(?:and|&)\s*cons?)\b/i,
  /\b(?:how\s+should\s+we|what\s+should\s+we\s+do|next\s+steps?)\b/i,
  /\b(architecture|design\s+doc|approach|decision)\b/i,
  /\b(meta|prompt|system\s+prompt|reason\s+about|think\s+through)\b/i,
];

const BOUNDED_TRANSFORM_PATTERNS: RegExp[] = [
  /^(summarize|summarise|rewrite|rephrase|translate|proofread|fix\s+grammar|shorten|expand)\b/i,
  /^(extract|classify|tag|convert|format|clean\s+up|normalize|normalise)\b/i,
  /\b(?:into|as)\s+(json|yaml|csv|bullet(?:ed)?\s+list|table)\b/i,
];

function resolveCurrentSessionEntry(ctx: IntentGateContext): SessionEntry | undefined {
  if (ctx.sessionEntry) {
    return ctx.sessionEntry;
  }
  if (!ctx.sessionStore || !ctx.sessionKey) {
    return undefined;
  }
  return ctx.sessionStore[ctx.sessionKey];
}

export function muscleEligible(message: string, context: IntentGateContext): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return false;
  }
  const hasBoundedTransformCue = BOUNDED_TRANSFORM_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  if (!hasBoundedTransformCue) {
    return false;
  }
  const session = resolveCurrentSessionEntry(context);
  const hasHighReasoningPreference =
    (session?.thinkingLevel ?? "").toLowerCase() === "high" ||
    (session?.reasoningLevel ?? "").toLowerCase() === "on";
  return !hasHighReasoningPreference;
}

export function requiresBrain(message: string, context: IntentGateContext): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (muscleEligible(normalized, context)) {
    return false;
  }
  if (PLANNING_OR_META_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const session = resolveCurrentSessionEntry(context);
  const hasBrainHint =
    typeof session?.modelOverride === "string" &&
    /(opus|o1|o3|gpt-5|sonnet|claude)/i.test(session.modelOverride);
  const isAmbiguousRequest = normalized.split(/\s+/).length <= 6 && /\?$/.test(normalized);
  return Boolean(hasBrainHint && isAmbiguousRequest);
}
