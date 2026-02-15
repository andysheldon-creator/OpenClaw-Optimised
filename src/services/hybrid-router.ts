/**
 * Hybrid Router Service (Week 4)
 *
 * Advanced query routing that goes beyond Week 1's simple pattern matching.
 * Evaluates multiple signals to decide the optimal model for each query:
 *
 * 1. Query complexity scoring (0-1 scale)
 * 2. Image/vision detection
 * 3. Conversation context (follow-up vs standalone)
 * 4. Task type classification (coding, reasoning, chat, translation, etc.)
 * 5. Cost/quality optimisation
 *
 * Routing tiers:
 * - LOCAL: Handle without any LLM (math, time, canned responses)
 * - OLLAMA_CHAT: Simple chat via local llama3.1:8b (FREE)
 * - OLLAMA_VISION: Image analysis via local llava:7b (FREE)
 * - CLAUDE_HAIKU: Medium complexity, cheapest Claude model
 * - CLAUDE_SONNET: Complex tasks needing strong capabilities
 * - CLAUDE_OPUS: Only for tasks requiring maximum reasoning
 *
 * Configuration:
 * - ENABLE_HYBRID_ROUTING: Enable/disable (default: true)
 * - HYBRID_ROUTING_MODE: "aggressive" | "balanced" | "quality" (default: balanced)
 * - OLLAMA_VISION_MODEL: Vision model (default: llava:7b)
 */

import { defaultRuntime } from "../runtime.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const ENABLE_HYBRID_ROUTING = process.env.ENABLE_HYBRID_ROUTING !== "false";
const ROUTING_MODE =
  (process.env.HYBRID_ROUTING_MODE as RoutingMode) ?? "balanced";
const OLLAMA_HOST = (
  process.env.OLLAMA_HOST ?? "http://localhost:11434"
).replace(/\/$/, "");
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "llava:7b";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Routing mode: how aggressively to route away from expensive models. */
export type RoutingMode = "aggressive" | "balanced" | "quality";

/** The routing tier (cheapest → most expensive). */
export type RoutingTier =
  | "local"
  | "ollama_chat"
  | "ollama_vision"
  | "claude_haiku"
  | "claude_sonnet"
  | "claude_opus"
  | "claude_subscription";

/** Task type classification. */
export type TaskType =
  | "greeting"
  | "farewell"
  | "gratitude"
  | "affirmation"
  | "math"
  | "time_date"
  | "translation"
  | "coding"
  | "reasoning"
  | "creative_writing"
  | "image_analysis"
  | "summarization"
  | "factual_qa"
  | "conversation"
  | "instruction"
  | "unknown";

/** Complete routing decision. */
export type RoutingDecision = {
  /** Recommended tier. */
  tier: RoutingTier;
  /** The detected task type. */
  taskType: TaskType;
  /** Complexity score 0-1 (1 = most complex). */
  complexity: number;
  /** Whether the message contains images. */
  hasImages: boolean;
  /** Whether this appears to be a follow-up in a conversation. */
  isFollowUp: boolean;
  /** Explanation of the routing decision (for logging). */
  reason: string;
  /** Estimated cost multiplier vs Opus baseline (0 = free, 1 = full price). */
  costFactor: number;
};

// ─── Complexity Scoring ──────────────────────────────────────────────────────

/** Signals that increase complexity. */
const COMPLEXITY_SIGNALS: Array<{
  pattern: RegExp;
  weight: number;
  label: string;
}> = [
  // Code-related signals
  {
    pattern:
      /\b(function|class|import|export|const|let|var|async|await|return|interface|type|struct|enum)\b/,
    weight: 0.25,
    label: "code_keywords",
  },
  {
    pattern: /```[\s\S]*```/,
    weight: 0.3,
    label: "code_blocks",
  },
  {
    pattern: /\b(debug|fix|error|bug|issue|crash|exception|stack\s*trace)\b/i,
    weight: 0.2,
    label: "debugging",
  },
  // Reasoning signals
  {
    pattern:
      /\b(explain|analyze|compare|evaluate|design|architect|plan|strategy|tradeoff|pros?\s*and\s*cons?)\b/i,
    weight: 0.2,
    label: "reasoning",
  },
  {
    pattern:
      /\b(why|how\s+does|how\s+would|what\s+if|consider|implications)\b/i,
    weight: 0.15,
    label: "analytical",
  },
  // Creative writing signals
  {
    pattern:
      /\b(write|compose|draft|essay|story|poem|letter|email|blog\s*post|article)\b/i,
    weight: 0.15,
    label: "creative",
  },
  // Multi-step instruction signals
  {
    pattern:
      /\b(step\s*by\s*step|first|second|third|then|next|finally|implement|build|create|set\s*up)\b/i,
    weight: 0.15,
    label: "multi_step",
  },
  // Length / detail signals
  {
    pattern: /\b(detailed|comprehensive|thorough|in-depth|extensive)\b/i,
    weight: 0.1,
    label: "detail_request",
  },
];

/** Signals that decrease complexity (simple queries). */
const SIMPLICITY_SIGNALS: Array<{
  pattern: RegExp;
  weight: number;
  label: string;
}> = [
  {
    pattern: /^.{1,30}$/,
    weight: 0.2,
    label: "very_short",
  },
  {
    pattern: /^(yes|no|ok|sure|thanks?|yep|nah|nope)[.!?]?$/i,
    weight: 0.4,
    label: "one_word",
  },
  {
    pattern: /^what('?s|\s+is)\s+(the\s+)?(time|date|weather|temperature)\??$/i,
    weight: 0.3,
    label: "simple_fact",
  },
  {
    pattern:
      /^(translate|say)\s+.{1,50}\s+(in|to)\s+(french|spanish|german|italian|japanese|chinese|arabic|portuguese|russian|korean)\s*$/i,
    weight: 0.2,
    label: "simple_translation",
  },
];

/**
 * Score the complexity of a query (0-1).
 * 0 = trivially simple, 1 = maximum complexity.
 */
export function scoreComplexity(text: string): number {
  let score = 0;
  const lower = text.toLowerCase();

  // Base complexity from message length
  const charCount = text.length;
  if (charCount > 500) score += 0.15;
  if (charCount > 1000) score += 0.1;
  if (charCount > 2000) score += 0.1;

  // Word count factor
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 50) score += 0.1;
  if (wordCount > 100) score += 0.1;

  // Question mark count (multiple questions = more complex)
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) score += 0.1;
  if (questionMarks > 3) score += 0.1;

  // Complexity signals
  for (const signal of COMPLEXITY_SIGNALS) {
    if (signal.pattern.test(lower)) {
      score += signal.weight;
    }
  }

  // Simplicity signals (reduce score)
  for (const signal of SIMPLICITY_SIGNALS) {
    if (signal.pattern.test(text)) {
      score -= signal.weight;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Task Type Classification ────────────────────────────────────────────────

/** Task classification patterns (checked in priority order). */
const TASK_PATTERNS: Array<{
  type: TaskType;
  patterns: RegExp[];
}> = [
  {
    type: "greeting",
    patterns: [
      /^(hi|hello|hey|howdy|sup|yo|hola|greetings|good\s*(morning|afternoon|evening|night))[\s!.?]*$/i,
      /^how\s*(are\s*you|do\s*you\s*do|is\s*it\s*going)[\s!?.]*$/i,
    ],
  },
  {
    type: "farewell",
    patterns: [
      /^(bye|goodbye|cya|see\s*ya|later|goodnight|peace|cheers)[\s!.]*$/i,
    ],
  },
  {
    type: "gratitude",
    patterns: [/^(thanks?|thank\s*you|thx|ty|cheers|appreciated)[\s!.]*$/i],
  },
  {
    type: "affirmation",
    patterns: [
      /^(ok|okay|sure|yes|yep|yeah|yup|got\s*it|understood|roger|cool|nice|great|awesome|perfect|alright)[\s!.]*$/i,
    ],
  },
  {
    type: "math",
    patterns: [
      /^\d+\s*[+\-*/x×]\s*\d+\s*[=?]?\s*$/i,
      /^(calculate|compute|solve)\s+\d+/i,
    ],
  },
  {
    type: "time_date",
    patterns: [
      /^what('?s|\s+is)\s+the\s+(time|date|day)\??$/i,
      /^what\s+(time|date|day)\s+is\s+it\??$/i,
    ],
  },
  {
    type: "translation",
    patterns: [/\b(translate|say\s+.+\s+in)\b/i, /\b(how\s+do\s+you\s+say)\b/i],
  },
  {
    type: "coding",
    patterns: [
      /\b(code|program|function|class|debug|fix\s+(the\s+)?bug|implement|refactor|test|deploy)\b/i,
      /\b(typescript|javascript|python|rust|golang|java|html|css|sql|api|endpoint|database)\b/i,
      /```[\s\S]*```/,
    ],
  },
  {
    type: "reasoning",
    patterns: [
      /\b(explain\s+why|analyze|evaluate|compare|what\s+are\s+the\s+pros|design\s+a|architect)\b/i,
      /\b(implications|tradeoff|consequence|reasoning|logic)\b/i,
    ],
  },
  {
    type: "creative_writing",
    patterns: [
      /\b(write|compose|draft|create)\s+(a|an|the|me)?\s*(story|poem|essay|letter|email|blog|article|song|script)\b/i,
    ],
  },
  {
    type: "summarization",
    patterns: [
      /\b(summarize|summarise|sum\s*up|tl;?dr|brief|condense|recap)\b/i,
    ],
  },
  {
    type: "factual_qa",
    patterns: [
      /^(what|who|where|when|which|how\s+many|how\s+much)\s+/i,
      /\b(define|definition|meaning\s+of|what\s+does\s+.+\s+mean)\b/i,
    ],
  },
  {
    type: "instruction",
    patterns: [
      /^(can\s+you|could\s+you|please|help\s+me|i\s+need)\b/i,
      /\b(set\s+up|configure|install|update|change|modify|add|remove|delete)\b/i,
    ],
  },
  {
    type: "conversation",
    patterns: [
      /\b(i\s+think|i\s+feel|what\s+do\s+you\s+think|opinion)\b/i,
      /^.{1,80}$/,
    ],
  },
];

/**
 * Classify the task type of a message.
 */
export function classifyTask(text: string): TaskType {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";

  for (const { type, patterns } of TASK_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) return type;
    }
  }

  return "unknown";
}

// ─── Image Detection ─────────────────────────────────────────────────────────

/**
 * Check if a message contains images (from AgentMessage content blocks).
 */
export function detectImages(messageContent: unknown): boolean {
  if (Array.isArray(messageContent)) {
    return messageContent.some(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as Record<string, unknown>).type === "image",
    );
  }
  return false;
}

// ─── Follow-up Detection ─────────────────────────────────────────────────────

/** Patterns that indicate a follow-up message. */
const FOLLOW_UP_PATTERNS = [
  /^(and|also|plus|oh|wait|actually|btw|by the way)\b/i,
  /^(what about|how about|can you also|one more|another)\b/i,
  /\b(you (just )?mentioned|you said|earlier|before|above|previous)\b/i,
  /^(yes|no|right|exactly|correct|that'?s?\s+(right|correct|it))\b/i,
];

/**
 * Detect if a message is a follow-up to a previous conversation.
 */
export function isFollowUpMessage(text: string): boolean {
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(text.trim())) return true;
  }
  return false;
}

// ─── Routing Decision ────────────────────────────────────────────────────────

/** Complexity thresholds per routing mode. */
const MODE_THRESHOLDS: Record<
  RoutingMode,
  {
    ollamaMax: number;
    haikuMax: number;
    sonnetMax: number;
  }
> = {
  aggressive: { ollamaMax: 0.4, haikuMax: 0.6, sonnetMax: 0.85 },
  balanced: { ollamaMax: 0.25, haikuMax: 0.5, sonnetMax: 0.8 },
  quality: { ollamaMax: 0.15, haikuMax: 0.35, sonnetMax: 0.7 },
};

/** Cost factors for each tier (relative to Opus baseline = 1.0). */
const TIER_COST_FACTORS: Record<RoutingTier, number> = {
  local: 0,
  ollama_chat: 0,
  ollama_vision: 0,
  claude_haiku: 0.05,
  claude_sonnet: 0.2,
  claude_opus: 1.0,
  claude_subscription: 0, // flat monthly fee, no per-token cost
};

/** Model IDs for each tier. */
export const TIER_MODELS: Record<RoutingTier, string> = {
  local: "local",
  ollama_chat: "ollama/llama3.1:8b",
  ollama_vision: `ollama/${OLLAMA_VISION_MODEL}`,
  claude_haiku: "claude-3-5-haiku",
  claude_sonnet: "claude-sonnet-4",
  claude_opus: "claude-opus-4-5",
  claude_subscription: "claude-sonnet-4-5", // subscription defaults to Sonnet 4.5
};

/**
 * Make a routing decision for a message.
 *
 * @param text - The user's message text
 * @param messageContent - Raw message content (may contain image blocks)
 * @param conversationLength - Number of messages in the conversation so far
 */
export function routeQuery(params: {
  text: string;
  messageContent?: unknown;
  conversationLength?: number;
  /** When true, Claude-tier queries are routed to subscription (zero marginal cost). */
  subscriptionEnabled?: boolean;
}): RoutingDecision {
  const { text, messageContent, conversationLength } = params;
  const preferSubscription = params.subscriptionEnabled === true;

  // If hybrid routing is disabled, always use default (Opus)
  if (!ENABLE_HYBRID_ROUTING) {
    return {
      tier: "claude_opus",
      taskType: "unknown",
      complexity: 1,
      hasImages: false,
      isFollowUp: false,
      reason: "hybrid routing disabled",
      costFactor: 1.0,
    };
  }

  const taskType = classifyTask(text);
  const complexity = scoreComplexity(text);
  const hasImages = detectImages(messageContent);
  const isFollowUp = isFollowUpMessage(text);
  const thresholds = MODE_THRESHOLDS[ROUTING_MODE] ?? MODE_THRESHOLDS.balanced;

  // Image queries → Ollama Vision if available, else Claude
  if (hasImages) {
    return {
      tier: "ollama_vision",
      taskType: "image_analysis",
      complexity,
      hasImages: true,
      isFollowUp,
      reason: "message contains images → Ollama Vision",
      costFactor: TIER_COST_FACTORS.ollama_vision,
    };
  }

  // Trivial queries → local handling
  if (
    taskType === "greeting" ||
    taskType === "farewell" ||
    taskType === "gratitude" ||
    taskType === "affirmation" ||
    taskType === "math" ||
    taskType === "time_date"
  ) {
    return {
      tier: "local",
      taskType,
      complexity,
      hasImages: false,
      isFollowUp,
      reason: `trivial ${taskType} → local handling`,
      costFactor: 0,
    };
  }

  // Follow-ups to complex conversations should stay on the same tier
  // (don't downgrade mid-conversation)
  if (isFollowUp && (conversationLength ?? 0) > 3) {
    const tier =
      complexity > thresholds.sonnetMax ? "claude_opus" : "claude_sonnet";
    return {
      tier,
      taskType,
      complexity,
      hasImages: false,
      isFollowUp: true,
      reason: `follow-up in active conversation → ${tier}`,
      costFactor: TIER_COST_FACTORS[tier],
    };
  }

  // Coding tasks need at least Sonnet
  if (taskType === "coding") {
    const tier =
      complexity > thresholds.sonnetMax ? "claude_opus" : "claude_sonnet";
    return {
      tier,
      taskType,
      complexity,
      hasImages: false,
      isFollowUp,
      reason: `coding task (complexity=${complexity.toFixed(2)}) → ${tier}`,
      costFactor: TIER_COST_FACTORS[tier],
    };
  }

  // Reasoning tasks need at least Sonnet
  if (taskType === "reasoning") {
    const tier =
      complexity > thresholds.sonnetMax ? "claude_opus" : "claude_sonnet";
    return {
      tier,
      taskType,
      complexity,
      hasImages: false,
      isFollowUp,
      reason: `reasoning task (complexity=${complexity.toFixed(2)}) → ${tier}`,
      costFactor: TIER_COST_FACTORS[tier],
    };
  }

  // Route by complexity score
  let tier: RoutingTier;
  let reason: string;

  if (complexity <= thresholds.ollamaMax) {
    tier = "ollama_chat";
    reason = `low complexity (${complexity.toFixed(2)} <= ${thresholds.ollamaMax}) → Ollama`;
  } else if (complexity <= thresholds.haikuMax) {
    tier = "claude_haiku";
    reason = `medium complexity (${complexity.toFixed(2)} <= ${thresholds.haikuMax}) → Haiku`;
  } else if (complexity <= thresholds.sonnetMax) {
    tier = "claude_sonnet";
    reason = `high complexity (${complexity.toFixed(2)} <= ${thresholds.sonnetMax}) → Sonnet`;
  } else {
    tier = "claude_opus";
    reason = `very high complexity (${complexity.toFixed(2)} > ${thresholds.sonnetMax}) → Opus`;
  }

  const decision: RoutingDecision = {
    tier,
    taskType,
    complexity,
    hasImages: false,
    isFollowUp,
    reason,
    costFactor: TIER_COST_FACTORS[tier],
  };

  // When subscription is enabled, absorb all Claude API tiers (haiku/sonnet/opus)
  // into the subscription tier at zero marginal cost.  Local and Ollama tiers are
  // kept as-is — they're faster and don't consume subscription rate limits.
  if (
    preferSubscription &&
    (decision.tier as string).startsWith("claude_") &&
    decision.tier !== "claude_subscription"
  ) {
    return {
      ...decision,
      tier: "claude_subscription",
      reason: `${reason} [subscription mode → claude_subscription]`,
      costFactor: 0,
    };
  }

  return decision;
}

// ─── Claude CLI Availability ────────────────────────────────────────────────

/** Whether the `claude` CLI binary is available (set at startup). */
let claudeCliAvailable = false;

/** Update Claude CLI availability state (called during startup/onboarding). */
export function setClaudeCliAvailable(available: boolean): void {
  claudeCliAvailable = available;
}

/** Check if Claude CLI is currently flagged as available. */
export function isClaudeCliAvailable(): boolean {
  return claudeCliAvailable;
}

// ─── Ollama Availability ─────────────────────────────────────────────────────

/** Cached Ollama availability (check every 60s). */
let ollamaAvailable = false;
let ollamaLastChecked = 0;
const OLLAMA_CHECK_INTERVAL_MS = 60_000;

/** Cached vision model availability. */
let visionAvailable = false;
let visionLastChecked = 0;

/**
 * Check if Ollama is available (with caching).
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - ollamaLastChecked < OLLAMA_CHECK_INTERVAL_MS) {
    return ollamaAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as {
        models?: Array<{ name: string }>;
      };
      ollamaAvailable = true;

      // Check if vision model is available
      const models = data.models ?? [];
      visionAvailable = models.some(
        (m) =>
          m.name.includes("llava") ||
          m.name.includes(OLLAMA_VISION_MODEL.split(":")[0]),
      );
      visionLastChecked = now;
    } else {
      ollamaAvailable = false;
      visionAvailable = false;
    }
  } catch {
    ollamaAvailable = false;
    visionAvailable = false;
  }

  ollamaLastChecked = now;
  return ollamaAvailable;
}

/**
 * Check if Ollama Vision model is available.
 */
export async function checkVisionAvailable(): Promise<boolean> {
  // Refresh Ollama status if stale
  if (Date.now() - visionLastChecked > OLLAMA_CHECK_INTERVAL_MS) {
    await checkOllamaAvailable();
  }
  return visionAvailable;
}

// ─── Tier Fallback ───────────────────────────────────────────────────────────

/**
 * Apply fallbacks when a tier is unavailable.
 * E.g., if Ollama is down, fall back to Claude Haiku.
 */
export async function applyFallbacks(
  decision: RoutingDecision,
): Promise<RoutingDecision> {
  // Subscription fallback: if claude CLI isn't available, fall back to Sonnet via API
  if (decision.tier === "claude_subscription" && !claudeCliAvailable) {
    return {
      ...decision,
      tier: "claude_sonnet",
      reason: `${decision.reason} [claude CLI unavailable → Sonnet API fallback]`,
      costFactor: TIER_COST_FACTORS.claude_sonnet,
    };
  }

  const ollamaUp = await checkOllamaAvailable();

  if (decision.tier === "ollama_chat" && !ollamaUp) {
    return {
      ...decision,
      tier: "claude_haiku",
      reason: `${decision.reason} [Ollama unavailable → Haiku fallback]`,
      costFactor: TIER_COST_FACTORS.claude_haiku,
    };
  }

  if (decision.tier === "ollama_vision") {
    const visionUp = await checkVisionAvailable();
    if (!visionUp) {
      // Fall back to Claude Sonnet for vision (needs multimodal)
      return {
        ...decision,
        tier: "claude_sonnet",
        reason: `${decision.reason} [Ollama Vision unavailable → Sonnet fallback]`,
        costFactor: TIER_COST_FACTORS.claude_sonnet,
      };
    }
  }

  return decision;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * Log a routing decision for monitoring.
 */
export function logRoutingDecision(decision: RoutingDecision): void {
  defaultRuntime.log?.(
    `[hybrid-router] tier=${decision.tier} task=${decision.taskType} ` +
      `complexity=${decision.complexity.toFixed(2)} images=${decision.hasImages} ` +
      `followUp=${decision.isFollowUp} cost=${decision.costFactor.toFixed(2)} ` +
      `reason="${decision.reason}"`,
  );
}

/**
 * Check if hybrid routing is enabled.
 */
export function isHybridRoutingEnabled(): boolean {
  return ENABLE_HYBRID_ROUTING;
}
