import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { logVerbose } from "../globals.js";

const execFileAsync = promisify(execFile);

const DEFAULT_SCRIPT_PATH =
  "/home/almaz/zoo/z_ai_categorization/category_me.sh";
const DEFAULT_TIMEOUT_MS = 12000;

export type IntentCategoryResult = {
  category: string;
  confidence: number;
  reason?: string;
  timeMs?: number;
};

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let cleaned = trimmed;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function parseCategoryResult(raw: string): IntentCategoryResult | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as {
      category?: unknown;
      confidence?: unknown;
      reason?: unknown;
      time_ms?: unknown;
    };
    if (typeof parsed !== "object" || parsed === null) return null;
    const category =
      typeof parsed.category === "string" ? parsed.category.trim() : "";
    const confidence =
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : Number(parsed.confidence);
    if (!category || !Number.isFinite(confidence)) return null;
    const reason =
      typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;
    const timeMs =
      typeof parsed.time_ms === "number" ? parsed.time_ms : undefined;
    return { category, confidence, reason, timeMs };
  } catch (error) {
    logVerbose(`[intent] Failed to parse category JSON: ${String(error)}`);
    return null;
  }
}

export async function categorizeIntent(
  message: string,
): Promise<IntentCategoryResult | null> {
  const scriptPath =
    process.env.CLAWDIS_CATEGORY_SCRIPT?.trim() || DEFAULT_SCRIPT_PATH;
  try {
    const envFile = process.env.CLAWDIS_CATEGORY_ENV_FILE?.trim();
    const env = envFile ? { ...process.env, ENV_FILE: envFile } : process.env;
    const { stdout } = await execFileAsync(
      scriptPath,
      ["--raw", "--input", message],
      {
        cwd: path.dirname(scriptPath),
        env,
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    return parseCategoryResult(stdout);
  } catch (error) {
    logVerbose(`[intent] Categorization failed: ${String(error)}`);
    return null;
  }
}
