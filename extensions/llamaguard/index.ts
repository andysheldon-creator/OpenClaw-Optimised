/**
 * OpenClaw Llama Guard 3 Guardrails Plugin
 *
 * Provides guardrail functionality using Llama Guard 3 8B model via Ollama or
 * any OpenAI-compatible endpoint. Uses the built-in model provider system.
 */

import path from "node:path";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import type { OpenClawConfig } from "../../src/config/config.js";
import {
  type BaseStageConfig,
  type EmbeddedAgentResult,
  type GuardrailBaseConfig,
  type GuardrailEvaluation,
  type GuardrailEvaluationContext,
  cleanupTempDir,
  collectText,
  createGuardrailPlugin,
  createGuardrailTempDir,
  extractMessagesContent,
  generateSessionId,
  loadRunEmbeddedPiAgent,
} from "../../src/plugins/guardrails-utils.js";

// ============================================================================
// Types
// ============================================================================

type LlamaGuardCategory = {
  id: string;
  name: string;
  description: string;
};

type LlamaGuardStageConfig = BaseStageConfig;

type LlamaGuardConfig = GuardrailBaseConfig & {
  provider?: string;
  model?: string;
  authProfileId?: string;
  categories?: LlamaGuardCategory[];
  timeoutMs?: number;
  maxTokens?: number;
  stages?: {
    beforeRequest?: LlamaGuardStageConfig;
    beforeToolCall?: LlamaGuardStageConfig;
    afterToolCall?: LlamaGuardStageConfig;
    afterResponse?: LlamaGuardStageConfig;
  };
};

type LlamaGuardResult = {
  safe: boolean;
  violatedCategories: string[];
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROVIDER = "ollama";
const DEFAULT_MODEL = "llama-guard3:8b";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 100;

/**
 * Default Llama Guard 3 safety categories (S1-S14)
 * https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard3/MODEL_CARD.md
 */
const DEFAULT_CATEGORIES: LlamaGuardCategory[] = [
  {
    id: "S1",
    name: "Violent Crimes",
    description:
      "AI models should not create content that enables, encourages, or excuses the commission of violent crimes. Examples of violent crimes include, but are not limited to: unlawful violence toward people (e.g., terrorism, genocide, murder, hate crimes, child abuse, assault, battery, kidnapping), unlawful violence toward animals (e.g., animal abuse).",
  },
  {
    id: "S2",
    name: "Non-Violent Crimes",
    description:
      "AI models should not create content that enables, encourages, or excuses the commission of non-violent crimes. Examples of non-violent crimes include, but are not limited to: financial crimes (e.g., fraud, scams, money laundering), property crimes (e.g., burglary, robbery, arson, vandalism), drug crimes (e.g., creating combating substances, trafficking controlled substances), weapons crimes (e.g., producing combating weapons, unlawful sale/transfer of firearms), cyber crimes (e.g., hacking, spyware, phishing).",
  },
  {
    id: "S3",
    name: "Sex Crimes",
    description:
      "AI models should not create content that enables, encourages, or excuses the commission of sex crimes. Examples of sex crimes include, but are not limited to: human trafficking, sexual assault (e.g., rape), sexual harassment (e.g., groping), lewd conduct.",
  },
  {
    id: "S4",
    name: "Child Exploitation",
    description:
      "AI models should not create content that depicts child sexual abuse or exploits children in any way. This includes, but is not limited to: child sexual abuse material (CSAM), any content that sexualizes children, content that enables or encourages child abuse.",
  },
  {
    id: "S5",
    name: "Defamation",
    description:
      "AI models should not create content that is defamatory about a real, living person. Defamation is defined as a false statement of fact that damages the reputation of the person.",
  },
  {
    id: "S6",
    name: "Specialized Advice",
    description:
      "AI models should not create content that contains specialized financial, medical, or legal advice. This does not include general educational content on these topics.",
  },
  {
    id: "S7",
    name: "Privacy",
    description:
      "AI models should not create content that contains sensitive, personal information about private individuals that could lead to harm. This includes, but is not limited to: full names paired with, including but not limited to: phone numbers, SSN, address, email, bank account, driver's license, or passwords.",
  },
  {
    id: "S8",
    name: "Intellectual Property",
    description:
      "AI models should not create content that violates the intellectual property rights of third parties, such as reproducing copyrighted material verbatim, or creating content that infringes on trademarks or patents.",
  },
  {
    id: "S9",
    name: "Indiscriminate Weapons",
    description:
      "AI models should not create content that enables the creation of weapons of mass destruction. Examples include, but are not limited to: chemical weapons (e.g., nerve agents), biological weapons (e.g., anthrax), radiological weapons (e.g., dirty bombs), nuclear weapons (e.g., nuclear fission).",
  },
  {
    id: "S10",
    name: "Hate",
    description:
      "AI models should not create content that is hateful toward people on the basis of their protected characteristics. Protected characteristics include race, color, ethnicity, national origin, disability, religious affiliation, caste, sexual orientation, sex, gender identity, and serious disease. Severe disparagement and dehumanization are examples of hate speech.",
  },
  {
    id: "S11",
    name: "Self-Harm",
    description:
      "AI models should not create content that enables, encourages, or excuses acts of intentional self-harm. Examples include, but are not limited to: suicide, self-injury (e.g., cutting), disordered eating.",
  },
  {
    id: "S12",
    name: "Sexual Content",
    description:
      "AI models should not create depictions of nude adults or content that contains erotic descriptions or explicit depictions of sex acts.",
  },
  {
    id: "S13",
    name: "Elections",
    description:
      "AI models should not create content that contains factually incorrect information about electoral systems and processes, including the timing, location, or eligibility requirements for voting. It also includes content that could be used to materially discourage voting.",
  },
  {
    id: "S14",
    name: "Code Interpreter Abuse",
    description:
      "AI models should not create content that attempts to abuse code interpreters. Examples include, but are not limited to: writing malicious code for system exploitation, shell injection, or data exfiltration.",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the Llama Guard 3 prompt following the official format.
 */
function buildLlamaGuardPrompt(
  content: string,
  categories: LlamaGuardCategory[],
  role: "User" | "Agent",
  historyContext?: string,
): string {
  const categoriesBlock = categories
    .map((cat) => `${cat.id}: ${cat.name}.\n${cat.description}`)
    .join("\n");

  const conversationBlock = historyContext
    ? `${historyContext}\n${role}: ${content}`
    : `${role}: ${content}`;

  return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in '${role}' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${categoriesBlock}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>
${conversationBlock}
<END CONVERSATION>

Provide your safety assessment for ${role} in the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
}

/**
 * Parse Llama Guard response.
 * Expected format:
 *   safe
 * or:
 *   unsafe
 *   S1, S3
 */
function parseLlamaGuardResponse(response: string): LlamaGuardResult {
  const lines = response.trim().split("\n");
  const firstLine = lines[0]?.toLowerCase().trim() ?? "";

  if (firstLine === "safe") {
    return { safe: true, violatedCategories: [] };
  }

  if (firstLine === "unsafe") {
    const categoriesLine = lines[1]?.trim() ?? "";
    const violatedCategories = categoriesLine
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { safe: false, violatedCategories };
  }

  // Fallback: if response contains "unsafe" anywhere, treat as unsafe
  if (response.toLowerCase().includes("unsafe")) {
    const match = response.match(/S\d+/g);
    return { safe: false, violatedCategories: match ?? [] };
  }

  // Default to safe if we can't parse
  return { safe: true, violatedCategories: [] };
}

async function callLlamaGuard(params: {
  cfg: LlamaGuardConfig;
  content: string;
  role: "User" | "Agent";
  historyContext?: string;
  apiConfig: OpenClawConfig;
}): Promise<LlamaGuardResult | null> {
  const provider = params.cfg.provider ?? DEFAULT_PROVIDER;
  const model = params.cfg.model ?? DEFAULT_MODEL;
  const categories = params.cfg.categories ?? DEFAULT_CATEGORIES;
  const timeoutMs = params.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = params.cfg.maxTokens ?? DEFAULT_MAX_TOKENS;

  const prompt = buildLlamaGuardPrompt(
    params.content,
    categories,
    params.role,
    params.historyContext,
  );

  let tmpDir: string | null = null;
  try {
    tmpDir = await createGuardrailTempDir("llamaguard");
    const sessionId = generateSessionId("llamaguard");
    const sessionFile = path.join(tmpDir, "session.json");

    const runEmbeddedPiAgent = await loadRunEmbeddedPiAgent();

    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir: process.cwd(),
      config: params.apiConfig,
      prompt,
      timeoutMs,
      runId: sessionId,
      provider,
      model,
      authProfileId: params.cfg.authProfileId,
      authProfileIdSource: params.cfg.authProfileId ? "user" : "auto",
      streamParams: { maxTokens },
      disableTools: true,
    });

    const text = collectText((result as EmbeddedAgentResult).payloads);
    if (!text) {
      return null;
    }

    return parseLlamaGuardResponse(text);
  } finally {
    await cleanupTempDir(tmpDir);
  }
}

function formatCategoryNames(
  violatedCategories: string[],
  categories: LlamaGuardCategory[],
): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  return violatedCategories
    .map((id) => {
      const name = categoryMap.get(id);
      return name ? `${id} (${name})` : id;
    })
    .join(", ");
}

// ============================================================================
// Plugin Definition (using createGuardrailPlugin)
// ============================================================================

const llamaguardPlugin = createGuardrailPlugin<LlamaGuardConfig>({
  id: "llamaguard",
  name: "Llama Guard 3 Guardrails",
  description: "Content safety guardrails via Llama Guard 3 8B",

  async evaluate(
    ctx: GuardrailEvaluationContext,
    config: LlamaGuardConfig,
    api: OpenClawPluginApi,
  ): Promise<GuardrailEvaluation | null> {
    // Determine role based on stage
    const role: "User" | "Agent" =
      ctx.stage === "before_request" ? "User" : "Agent";

    // Build history context if available
    const historyContext =
      ctx.history.length > 0 ? extractMessagesContent(ctx.history) : undefined;

    const result = await callLlamaGuard({
      cfg: config,
      content: ctx.content,
      role,
      historyContext,
      apiConfig: api.config,
    });

    if (!result) {
      // Evaluation failed, failOpen logic handled by base class
      return null;
    }

    return {
      safe: result.safe,
      reason: result.violatedCategories.length > 0
        ? formatCategoryNames(result.violatedCategories, config.categories ?? DEFAULT_CATEGORIES)
        : undefined,
      details: { violatedCategories: result.violatedCategories },
    };
  },

  formatViolationMessage(evaluation: GuardrailEvaluation, location: string): string {
    const parts = [
      `Sorry, I can't help with that. The ${location} was flagged as potentially unsafe by the Llama Guard safety system.`,
    ];
    if (evaluation.reason) {
      parts.push(`Violated categories: ${evaluation.reason}.`);
    }
    return parts.join(" ");
  },

  onRegister(api: OpenClawPluginApi, config: LlamaGuardConfig) {
    api.logger.info(
      `Llama Guard guardrails enabled (provider: ${config.provider ?? DEFAULT_PROVIDER}, model: ${config.model ?? DEFAULT_MODEL})`,
    );
  },
});

// Apply the config schema
const pluginWithSchema = {
  ...llamaguardPlugin,
  configSchema: emptyPluginConfigSchema(),
};

export default pluginWithSchema;

// Export types for testing
export type { LlamaGuardConfig, LlamaGuardCategory, LlamaGuardStageConfig };
export { buildLlamaGuardPrompt, parseLlamaGuardResponse, DEFAULT_CATEGORIES };
