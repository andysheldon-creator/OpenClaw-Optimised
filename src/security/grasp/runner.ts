import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type {
  DimensionPrompt,
  GraspDimensionRawResponse,
  GraspDimensionResult,
  GraspFinding,
} from "./types.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { resolveConfiguredModelRef } from "../../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { resolveConfigPath, resolveStateDir } from "../../config/paths.js";
import { levelFromScore } from "./scoring.js";

const GRASP_TIMEOUT_MS = 120_000; // 2 minutes per dimension

export type RunDimensionParams = {
  config: OpenClawConfig;
  prompt: DimensionPrompt;
  agentId?: string;
  model?: string;
  provider?: string;
};

export async function runDimensionAnalysis(
  params: RunDimensionParams,
): Promise<GraspDimensionResult> {
  const { config, prompt, agentId } = params;

  const configPath = resolveConfigPath();
  const stateDir = resolveStateDir();

  // Resolve agent ID if not provided
  const resolvedAgentId = agentId || resolveDefaultAgentId(config);
  const workspaceDir = resolveAgentWorkspaceDir(config, resolvedAgentId) || process.cwd();

  // Create a temporary session file for this analysis
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grasp-"));
  const sessionId = `grasp-${prompt.dimension}-${crypto.randomUUID().slice(0, 8)}`;
  const sessionFile = path.join(tempDir, `${sessionId}.jsonl`);

  // Resolve model
  const modelRef = resolveConfiguredModelRef({
    cfg: config,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const provider = params.provider || modelRef.provider;
  const model = params.model || modelRef.model;

  const timeoutMs = resolveAgentTimeoutMs({ cfg: config, overrideSeconds: 120 });

  // Build the user message
  const userMessage = buildUserMessage({ prompt, configPath, stateDir, workspaceDir });

  try {
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionKey: `grasp:${prompt.dimension}:${Date.now()}`,
      sessionFile,
      workspaceDir,
      config,
      prompt: userMessage,
      provider,
      model,
      timeoutMs: Math.min(timeoutMs, GRASP_TIMEOUT_MS),
      runId: crypto.randomUUID(),
      extraSystemPrompt: prompt.systemPrompt,
      // Tools must stay enabled: GRASP needs read tools to inspect config/state files.
      // disableTools: true would disable ALL tools including reads.
      // TODO: Switch to a read-only tool allowlist when pi-embedded supports it.
      disableTools: false,
    });

    // Extract the response text
    const responseText = extractResponseText(result);

    // Parse the JSON response
    return parseDimensionResponse(responseText, prompt);
  } finally {
    // Clean up temp session file
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildUserMessage(params: {
  prompt: DimensionPrompt;
  configPath: string;
  stateDir: string;
  workspaceDir: string;
}): string {
  return `Analyze the **${params.prompt.label}** dimension for this OpenClaw instance.

## Key paths to examine

- **Config file**: ${params.configPath}
- **State directory**: ${params.stateDir}
- **Workspace**: ${params.workspaceDir}

Use the file reading tools to explore these paths and assess risk. Start by reading the config file.

Return your analysis as valid JSON matching the required output format in your instructions.`;
}

function extractResponseText(result: Awaited<ReturnType<typeof runEmbeddedPiAgent>>): string {
  // The result contains payloads with text
  const payloads = result.payloads ?? [];
  const texts: string[] = [];
  for (const payload of payloads) {
    if (payload.text) {
      texts.push(payload.text);
    }
  }
  return texts.join("\n");
}

function parseDimensionResponse(
  responseText: string,
  prompt: DimensionPrompt,
): GraspDimensionResult {
  // Prefer fenced ```json blocks, then fall back to first balanced JSON object
  const fenced = responseText.match(/```json\s*\n([\s\S]*?)\n```/);
  const jsonText = fenced?.[1] ?? extractFirstJsonObject(responseText);

  if (!jsonText) {
    return createErrorResult(prompt, "No JSON found in response", responseText);
  }

  try {
    const parsed = JSON.parse(jsonText) as GraspDimensionRawResponse;
    return validateAndNormalize(parsed, prompt);
  } catch (err) {
    return createErrorResult(
      prompt,
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      responseText,
    );
  }
}

/** Extract the first brace-balanced JSON object from text. */
function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

function validateAndNormalize(
  raw: GraspDimensionRawResponse,
  prompt: DimensionPrompt,
): GraspDimensionResult {
  // Validate score
  const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, raw.score)) : 50;

  // Validate level
  const validLevels = ["low", "medium", "high", "critical"] as const;
  const level = validLevels.includes(raw.level as (typeof validLevels)[number])
    ? (raw.level as (typeof validLevels)[number])
    : levelFromScore(score);

  // Normalize findings
  const findings: GraspFinding[] = Array.isArray(raw.findings)
    ? raw.findings.map((f, i) => ({
        id: f.id || `${prompt.dimension}.finding_${i}`,
        dimension: prompt.dimension,
        severity: normalizeSeverity(f.severity),
        signal: f.signal || "unknown",
        observation: f.observation || f.detail || "",
        riskContribution: typeof f.riskContribution === "number" ? f.riskContribution : 0,
        title: f.title || "Untitled finding",
        detail: f.detail || "",
        remediation: f.remediation,
      }))
    : [];

  return {
    dimension: prompt.dimension,
    label: prompt.label,
    score,
    level,
    findings,
    reasoning: raw.reasoning || "No reasoning provided",
    exploredPaths: Array.isArray(raw.exploredPaths) ? raw.exploredPaths : [],
  };
}

function normalizeSeverity(sev: string | undefined): "info" | "warn" | "critical" {
  if (sev === "critical") {
    return "critical";
  }
  if (sev === "warn" || sev === "warning") {
    return "warn";
  }
  return "info";
}

function createErrorResult(
  prompt: DimensionPrompt,
  error: string,
  rawResponse: string,
): GraspDimensionResult {
  return {
    dimension: prompt.dimension,
    label: prompt.label,
    score: 50, // Unknown = medium risk
    level: "medium",
    findings: [
      {
        id: `${prompt.dimension}.analysis_error`,
        dimension: prompt.dimension,
        severity: "warn",
        signal: "AI response parsing",
        observation: error,
        riskContribution: 0,
        title: "Analysis could not be completed",
        detail: `The AI analysis failed: ${error}`,
        remediation: "Try running the assessment again",
      },
    ],
    reasoning: `Analysis failed: ${error}\n\nRaw response:\n${rawResponse.slice(0, 500)}`,
    exploredPaths: [],
  };
}
