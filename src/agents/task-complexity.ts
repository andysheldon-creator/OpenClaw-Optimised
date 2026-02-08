/**
 * Task complexity estimation for automatic model routing.
 *
 * Heuristic-based classification of user messages into complexity tiers
 * to select appropriate models (e.g., cheaper models for simple tasks).
 *
 * Config: agents.enableComplexityRouting (default: false)
 * Config: agents.modelTiers.simple / agents.modelTiers.complex
 */

export type TaskComplexity = "simple" | "medium" | "complex";

export type ComplexitySignals = {
  charLength: number;
  codeBlockCount: number;
  hasMultiStep: boolean;
  hasAnalysis: boolean;
  hasTechnicalKeywords: boolean;
  lineCount: number;
};

const MULTI_STEP_RE =
  /\b(step[- ]?by[- ]?step|first.*then|1\).*2\)|multiple|several|each of|all of)\b/i;
const ANALYSIS_RE =
  /\b(analy[sz]e|compar[ei]|evaluat[ei]|investigat[ei]|review|audit|explain why|trade-?off)\b/i;
const TECHNICAL_RE =
  /\b(architect|refactor|migration|distributed|concurren|microservice|scaling|performance|security|vulnerabilit|algorithm|optimization)\b/i;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;

export function analyzeComplexitySignals(message: string): ComplexitySignals {
  const codeBlocks = message.match(CODE_BLOCK_RE) ?? [];
  const withoutCode = message.replace(CODE_BLOCK_RE, "");
  const lines = message.split("\n").filter((l) => l.trim().length > 0);

  return {
    charLength: message.length,
    codeBlockCount: codeBlocks.length,
    hasMultiStep: MULTI_STEP_RE.test(withoutCode),
    hasAnalysis: ANALYSIS_RE.test(withoutCode),
    hasTechnicalKeywords: TECHNICAL_RE.test(withoutCode),
    lineCount: lines.length,
  };
}

export function estimateTaskComplexity(message: string): TaskComplexity {
  const signals = analyzeComplexitySignals(message);

  let score = 0;

  // Length-based scoring
  if (signals.charLength > 2000) {
    score += 3;
  } else if (signals.charLength > 500) {
    score += 1;
  }

  // Code blocks
  if (signals.codeBlockCount >= 3) {
    score += 3;
  } else if (signals.codeBlockCount >= 1) {
    score += 1;
  }

  // Multi-step requests
  if (signals.hasMultiStep) {
    score += 2;
  }

  // Analysis/evaluation requests
  if (signals.hasAnalysis) {
    score += 3;
  }

  // Technical keywords
  if (signals.hasTechnicalKeywords) {
    score += 2;
  }

  // Line count
  if (signals.lineCount > 20) {
    score += 2;
  } else if (signals.lineCount > 5) {
    score += 1;
  }

  if (score >= 6) {
    return "complex";
  }
  if (score >= 3) {
    return "medium";
  }
  return "simple";
}

export type ComplexityRoutingConfig = {
  enabled?: boolean;
  modelTiers?: {
    simple?: string;
    complex?: string;
  };
};

export function resolveModelForComplexity(
  complexity: TaskComplexity,
  config?: ComplexityRoutingConfig,
): string | null {
  if (!config?.enabled) {
    return null;
  }
  const tiers = config.modelTiers;
  if (!tiers) {
    return null;
  }

  switch (complexity) {
    case "simple":
      return tiers.simple ?? null;
    case "complex":
      return tiers.complex ?? null;
    case "medium":
      return null; // use default model
  }
}
