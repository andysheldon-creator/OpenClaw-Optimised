import type { OpenClawConfig } from "../../config/config.js";
import type { ReplyPayload } from "../types.js";
import { buildModelAliasIndex, parseModelRef } from "../../agents/model-selection.js";
import {
  buildMuscleSynthesisPrompt,
  resolveMuscleSynthesisPolicy,
} from "./muscle-synthesis.js";

export type BrainPlan = {
  useMuscle: boolean;
  tasks: string[];
  response?: string;
  notes?: string;
};

export type ReplyPipelineConfig = {
  enabled: boolean;
  brain: { provider: string; model: string };
  muscleModels: Array<{ provider: string; model: string }>;
  plannerPrompt: string;
  musclePrompt: string;
};

const DEFAULT_PLANNER_PROMPT = [
  "You are the Brain model. Decide whether to delegate to muscle models.",
  "Return ONLY valid JSON with keys:",
  '- "use_muscle": boolean',
  '- "tasks": string[] (empty if use_muscle is false)',
  '- "response": string (required if use_muscle is false)',
  '- "notes": string (optional, internal)',
  "Rules:",
  "- Do NOT call tools.",
  "- Do NOT include markdown or code fences.",
  "- Do NOT include extra text outside the JSON object.",
  "- Use muscle only for bounded, explicit transforms or bulk operations after a decision.",
  "- If the request is planning, strategy, ambiguous, or needs initiative, set use_muscle=false.",
].join("\n");

const DEFAULT_MUSCLE_PROMPT = [
  "You are a muscle model. Execute tasks exactly as instructed.",
  "Return concise results as a numbered list. No extra commentary.",
].join("\n");

export function resolveReplyPipelineConfig(params: {
  cfg: OpenClawConfig;
  defaultProvider: string;
  defaultModel: string;
}): ReplyPipelineConfig {
  const pipeline = params.cfg.agents?.defaults?.replyPipeline;
  if (!pipeline?.enabled) {
    return {
      enabled: false,
      brain: { provider: params.defaultProvider, model: params.defaultModel },
      muscleModels: [],
      plannerPrompt: DEFAULT_PLANNER_PROMPT,
      musclePrompt: DEFAULT_MUSCLE_PROMPT,
    };
  }

  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: params.defaultProvider,
  });

  const brainRefRaw = pipeline.brainModel?.trim() ?? "";
  const brainParsed = brainRefRaw
    ? parseModelRef(brainRefRaw, params.defaultProvider)
    : { provider: params.defaultProvider, model: params.defaultModel };
  const brain = brainParsed ?? { provider: params.defaultProvider, model: params.defaultModel };

  const muscleRefs = (() => {
    const explicit = pipeline.muscleModels ?? [];
    if (explicit.length > 0) {
      return explicit;
    }
    const defaults = params.cfg.agents?.defaults?.model as
      | { fallbacks?: string[] }
      | string
      | undefined;
    if (defaults && typeof defaults === "object") {
      return defaults.fallbacks ?? [];
    }
    return [];
  })();

  const muscleModels = muscleRefs
    .map((raw) => {
      const trimmed = String(raw ?? "").trim();
      if (!trimmed) {
        return null;
      }
      const parsed = parseModelRef(trimmed, params.defaultProvider);
      if (parsed) {
        return parsed;
      }
      const aliasMatch = aliasIndex.byAlias.get(trimmed.toLowerCase());
      return aliasMatch?.ref ?? null;
    })
    .filter((entry): entry is { provider: string; model: string } => Boolean(entry));

  return {
    enabled: true,
    brain,
    muscleModels,
    plannerPrompt: pipeline.plannerPrompt?.trim() || DEFAULT_PLANNER_PROMPT,
    musclePrompt: pipeline.musclePrompt?.trim() || DEFAULT_MUSCLE_PROMPT,
  };
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
}

export function parseBrainPlan(raw: string): BrainPlan | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonText) as {
      use_muscle?: boolean;
      useMuscle?: boolean;
      tasks?: unknown;
      response?: unknown;
      notes?: unknown;
    };
    const useMuscle = Boolean(parsed.use_muscle ?? parsed.useMuscle);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .map((task) => (typeof task === "string" ? task.trim() : ""))
          .filter(Boolean)
      : [];
    const response =
      typeof parsed.response === "string" ? parsed.response.trim() || undefined : undefined;
    const notes = typeof parsed.notes === "string" ? parsed.notes.trim() || undefined : undefined;
    return {
      useMuscle,
      tasks,
      response,
      notes,
    };
  } catch {
    return null;
  }
}

export function buildMuscleTaskPrompt(params: {
  tasks: string[];
  userMessage: string;
}): string {
  const lines = params.tasks.map((task, idx) => `${idx + 1}. ${task}`);
  return [
    "User request:",
    params.userMessage.trim(),
    "",
    "Tasks:",
    ...lines,
  ].join("\n");
}

export function buildPipelineSynthesisPrompt(params: {
  cfg: OpenClawConfig;
  musclePayloads: ReplyPayload[];
  userMessage: string;
  plannerResponse?: string;
}): string {
  const policy = resolveMuscleSynthesisPolicy(params.cfg);
  const payloadPrompt = buildMuscleSynthesisPrompt(params.musclePayloads, policy);
  const lines = ["Original user request:", params.userMessage.trim(), ""];
  const planner = params.plannerResponse?.trim();
  if (planner) {
    lines.push("Planner draft:", planner, "");
  }
  lines.push(payloadPrompt);
  return lines.join("\n");
}
