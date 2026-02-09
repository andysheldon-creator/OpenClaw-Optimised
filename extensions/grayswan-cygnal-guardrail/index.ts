/**
 * OpenClaw Gray Swan Guardrails Plugin
 *
 * Provides guardrail functionality via the Gray Swan Cygnal API.
 * Inspects and optionally blocks requests, tool calls, tool results, and responses.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  type BaseStageConfig,
  type GuardrailBaseConfig,
  type GuardrailEvaluation,
  type GuardrailEvaluationContext,
  type GuardrailStage,
  type OpenClawPluginApi,
  createGuardrailPlugin,
  extractTextFromContent,
  resolveStageConfig,
} from "openclaw/plugin-sdk";

// ============================================================================
// Types
// ============================================================================

type GrayswanStageConfig = BaseStageConfig & {
  /** Override the violation threshold for this stage (0-1). */
  violationThreshold?: number;
  /** Treat mutation detection as a violation for this stage. */
  blockOnMutation?: boolean;
  /** Treat IPI detection as a violation for this stage. */
  blockOnIpi?: boolean;
};

type GrayswanGuardrailConfig = GuardrailBaseConfig & {
  /** Gray Swan Cygnal API key. */
  apiKey?: string;
  /** Override for Gray Swan API base URL. */
  apiBase?: string;
  /** Gray Swan policy identifier. */
  policyId?: string;
  /** Custom category descriptions. */
  categories?: Record<string, string>;
  /** Gray Swan reasoning mode. */
  reasoningMode?: "off" | "hybrid" | "thinking";
  /** Default violation threshold (0-1). */
  violationThreshold?: number;
  /** Timeout for Gray Swan requests (ms). */
  timeoutMs?: number;
  stages?: {
    beforeRequest?: GrayswanStageConfig;
    beforeToolCall?: GrayswanStageConfig;
    afterToolCall?: GrayswanStageConfig;
    afterResponse?: GrayswanStageConfig;
  };
};

type GrayswanMonitorMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
};

type GrayswanMonitorResponse = {
  violation?: number;
  violated_rules?: unknown[];
  violated_rule_descriptions?: unknown[];
  mutation?: boolean;
  ipi?: boolean;
};

type GrayswanEvaluationDetails = {
  violationScore: number;
  violatedRules: unknown[];
  mutation: boolean;
  ipi: boolean;
};

// ============================================================================
// Constants
// ============================================================================

const GRAYSWAN_DEFAULT_BASE = "https://api.grayswan.ai";
const GRAYSWAN_MONITOR_PATH = "/cygnal/monitor";
const GRAYSWAN_DEFAULT_THRESHOLD = 0.5;
const GRAYSWAN_DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// Helper Functions
// ============================================================================

function resolveGrayswanThreshold(
  cfg: GrayswanGuardrailConfig,
  stage: GrayswanStageConfig | undefined,
): number {
  const value = stage?.violationThreshold ?? cfg.violationThreshold;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  return GRAYSWAN_DEFAULT_THRESHOLD;
}

function resolveBlockOnMutation(
  guardrailStage: GuardrailStage,
  stageCfg: GrayswanStageConfig | undefined,
): boolean {
  if (typeof stageCfg?.blockOnMutation === "boolean") {
    return stageCfg.blockOnMutation;
  }
  // Default: block on mutation for after_tool_call (detecting prompt injection)
  return guardrailStage === "after_tool_call";
}

function resolveBlockOnIpi(
  guardrailStage: GuardrailStage,
  stageCfg: GrayswanStageConfig | undefined,
): boolean {
  if (typeof stageCfg?.blockOnIpi === "boolean") {
    return stageCfg.blockOnIpi;
  }
  // Default: block on IPI for after_tool_call (detecting indirect prompt injection)
  return guardrailStage === "after_tool_call";
}

function resolveGrayswanApiKey(cfg: GrayswanGuardrailConfig): string | undefined {
  const key = cfg.apiKey?.trim();
  if (key) {
    return key;
  }
  const env = process.env.GRAYSWAN_API_KEY?.trim();
  return env || undefined;
}

function resolveGrayswanApiBase(cfg: GrayswanGuardrailConfig): string {
  const base =
    cfg.apiBase?.trim() || process.env.GRAYSWAN_API_BASE?.trim() || GRAYSWAN_DEFAULT_BASE;
  return base.replace(/\/+$/, "");
}

function toGrayswanRole(role: unknown): GrayswanMonitorMessage["role"] | null {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  if (role === "toolResult" || role === "tool") {
    return "tool";
  }
  return null;
}

function toGrayswanMessages(messages: AgentMessage[]): GrayswanMonitorMessage[] {
  const converted: GrayswanMonitorMessage[] = [];
  for (const message of messages) {
    const role = toGrayswanRole((message as { role?: unknown }).role);
    if (!role) {
      continue;
    }
    const content = extractTextFromContent((message as { content?: unknown }).content).trim();
    if (!content) {
      continue;
    }
    converted.push({ role, content });
  }
  return converted;
}

function buildMonitorPayload(
  messages: GrayswanMonitorMessage[],
  cfg: GrayswanGuardrailConfig,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { messages };
  if (cfg.categories && Object.keys(cfg.categories).length > 0) {
    payload.categories = cfg.categories;
  }
  if (cfg.policyId) {
    payload.policy_id = cfg.policyId;
  }
  if (cfg.reasoningMode) {
    payload.reasoning_mode = cfg.reasoningMode;
  }
  return payload;
}

async function callGrayswanMonitor(params: {
  cfg: GrayswanGuardrailConfig;
  messages: GrayswanMonitorMessage[];
  logger: OpenClawPluginApi["logger"];
}): Promise<GrayswanMonitorResponse | null> {
  const apiKey = resolveGrayswanApiKey(params.cfg);
  if (!apiKey) {
    params.logger.warn("Gray Swan guardrail enabled but no API key configured.");
    return null;
  }
  const apiBase = resolveGrayswanApiBase(params.cfg);
  const payload = buildMonitorPayload(params.messages, params.cfg);
  const timeoutMs =
    typeof params.cfg.timeoutMs === "number" && params.cfg.timeoutMs > 0
      ? params.cfg.timeoutMs
      : GRAYSWAN_DEFAULT_TIMEOUT_MS;
  const url = `${apiBase}${GRAYSWAN_MONITOR_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "grayswan-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Gray Swan monitor returned ${response.status}`);
    }
    return (await response.json()) as GrayswanMonitorResponse;
  } finally {
    clearTimeout(timer);
  }
}

function evaluateGrayswanResponse(response: GrayswanMonitorResponse): GrayswanEvaluationDetails {
  const violationScore = Number(response.violation ?? 0);
  const violatedRules = Array.isArray(response.violated_rule_descriptions)
    ? response.violated_rule_descriptions
    : Array.isArray(response.violated_rules)
      ? response.violated_rules
      : [];
  return {
    violationScore: Number.isFinite(violationScore) ? violationScore : 0,
    violatedRules,
    mutation: Boolean(response.mutation),
    ipi: Boolean(response.ipi),
  };
}

function formatViolatedRules(violatedRules: unknown[]): string {
  const formatted: string[] = [];
  for (const rule of violatedRules) {
    if (rule && typeof rule === "object") {
      const record = rule as Record<string, unknown>;
      const ruleNum = record.rule ?? record.index ?? record.id;
      const ruleNumText =
        typeof ruleNum === "string" || typeof ruleNum === "number" ? String(ruleNum) : "";
      const ruleName = typeof record.name === "string" ? record.name : "";
      const ruleDesc = typeof record.description === "string" ? record.description : "";
      if (ruleNumText && ruleName) {
        formatted.push(
          ruleDesc ? `#${ruleNumText} ${ruleName}: ${ruleDesc}` : `#${ruleNumText} ${ruleName}`,
        );
      } else if (ruleName) {
        formatted.push(ruleName);
      } else if (ruleDesc) {
        formatted.push(ruleDesc);
      } else {
        formatted.push("[rule]");
      }
      continue;
    }
    formatted.push(String(rule));
  }
  return formatted.join(", ");
}

function getGrayswanRole(stage: GuardrailStage): GrayswanMonitorMessage["role"] {
  switch (stage) {
    case "before_request":
      return "user";
    case "before_tool_call":
    case "after_response":
      return "assistant";
    case "after_tool_call":
      return "tool";
  }
}

// ============================================================================
// Plugin Definition (using createGuardrailPlugin)
// ============================================================================

const grayswanPlugin = createGuardrailPlugin<GrayswanGuardrailConfig>({
  id: "grayswan-cygnal-guardrail",
  name: "Gray Swan Guardrails",
  description: "Guardrail functionality via the Gray Swan Cygnal API",

  async evaluate(
    ctx: GuardrailEvaluationContext,
    config: GrayswanGuardrailConfig,
    api: OpenClawPluginApi,
  ): Promise<GuardrailEvaluation | null> {
    // Build messages for Gray Swan API
    const historyMessages = toGrayswanMessages(ctx.history);
    const role = getGrayswanRole(ctx.stage);
    const messages: GrayswanMonitorMessage[] = [...historyMessages, { role, content: ctx.content }];

    if (messages.length === 0) {
      return null;
    }

    const response = await callGrayswanMonitor({
      cfg: config,
      messages,
      logger: api.logger,
    });

    if (!response) {
      // No API key or call failed, failOpen logic handled by base class
      return null;
    }

    const details = evaluateGrayswanResponse(response);

    // Get stage-specific config for threshold and mutation/IPI settings
    const stageCfg = resolveStageConfig<GrayswanStageConfig>(config.stages, ctx.stage);
    const threshold = resolveGrayswanThreshold(config, stageCfg);
    const blockOnMutation = resolveBlockOnMutation(ctx.stage, stageCfg);
    const blockOnIpi = resolveBlockOnIpi(ctx.stage, stageCfg);

    // Determine if content should be blocked
    const scoreFlag = details.violationScore >= threshold;
    const mutationFlag = blockOnMutation && details.mutation;
    const ipiFlag = blockOnIpi && details.ipi;
    const shouldBlock = scoreFlag || mutationFlag || ipiFlag;

    // Build reason string
    const reasonParts: string[] = [];
    if (scoreFlag) {
      reasonParts.push(`violation score ${details.violationScore.toFixed(2)}`);
    }
    if (mutationFlag) {
      reasonParts.push("mutation detected");
    }
    if (ipiFlag) {
      reasonParts.push("indirect prompt injection detected");
    }

    return {
      safe: !shouldBlock,
      reason: reasonParts.length > 0 ? reasonParts.join(", ") : undefined,
      details: details as unknown as Record<string, unknown>,
    };
  },

  formatViolationMessage(evaluation: GuardrailEvaluation, location: string): string {
    const details = evaluation.details as GrayswanEvaluationDetails | undefined;
    const messageParts: string[] = [];

    if (details) {
      messageParts.push(
        `Sorry I can't help with that. According to the Gray Swan Cygnal Guardrail, ` +
          `the ${location} has a violation score of ${details.violationScore.toFixed(2)}.`,
      );

      if (details.violatedRules.length > 0) {
        const formattedRules = formatViolatedRules(details.violatedRules);
        if (formattedRules) {
          messageParts.push(`It was violating the rule(s): ${formattedRules}.`);
        }
      }

      if (details.mutation) {
        messageParts.push("Mutation effort to make the harmful intention disguised was DETECTED.");
      }

      if (details.ipi) {
        messageParts.push("Indirect Prompt Injection was DETECTED.");
      }
    } else {
      messageParts.push(
        `Sorry I can't help with that. The ${location} was flagged by the Gray Swan Cygnal Guardrail.`,
      );
      if (evaluation.reason) {
        messageParts.push(`Reason: ${evaluation.reason}.`);
      }
    }

    return messageParts.join("\n");
  },

  onRegister(api: OpenClawPluginApi) {
    api.logger.info("Gray Swan guardrails enabled");
  },
});

export default grayswanPlugin;

// Export types for external use
export type { GrayswanGuardrailConfig, GrayswanStageConfig };
