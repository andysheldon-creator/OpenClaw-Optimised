import fs from "node:fs/promises";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveApiKeyForProvider } from "../agents/model-auth.js";
import {
  findModelInCatalog,
  loadModelCatalog,
  modelSupportsVision,
} from "../agents/model-catalog.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { logVerbose } from "../globals.js";
import { resolveAutoImageModel } from "../media-understanding/runner.js";

const VISION_PROVIDERS = ["openai", "anthropic", "google", "minimax"] as const;

export interface DescribeImageParams {
  imagePath: string;
  cfg: OpenClawConfig;
  agentDir?: string;
  agentId?: string;
  prompt: string;
  fileName: string;
  logPrefix: string;
  contentType?: string;
}

/**
 * Shared helper to describe an image using vision API.
 * Auto-detects an available vision provider based on configured API keys.
 * Returns null if no vision provider is available.
 */
function inferMimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/webp";
  }
}

export async function describeImageWithVision(params: DescribeImageParams): Promise<string | null> {
  const { imagePath, cfg, agentDir, agentId, prompt, fileName, logPrefix, contentType } = params;

  const defaultModel = resolveDefaultModelForAgent({ cfg, agentId });
  let activeModel = undefined as { provider: string; model: string } | undefined;
  let catalog: ModelCatalogEntry[] = [];
  try {
    catalog = await loadModelCatalog({ config: cfg });
    const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
    const supportsVision = modelSupportsVision(entry);
    if (supportsVision) {
      activeModel = { provider: defaultModel.provider, model: defaultModel.model };
    }
  } catch {
    // Ignore catalog failures; fall back to auto selection.
  }

  const hasProviderKey = async (provider: string) => {
    try {
      await resolveApiKeyForProvider({ provider, cfg, agentDir });
      return true;
    } catch {
      return false;
    }
  };

  const selectCatalogModel = (provider: string) => {
    const entries = catalog.filter(
      (entry) =>
        entry.provider.toLowerCase() === provider.toLowerCase() && modelSupportsVision(entry),
    );
    if (entries.length === 0) {
      return undefined;
    }
    const defaultId =
      provider === "openai"
        ? "gpt-5-mini"
        : provider === "anthropic"
          ? "claude-opus-4-5"
          : provider === "google"
            ? "gemini-3-flash-preview"
            : "MiniMax-VL-01";
    const preferred = entries.find((entry) => entry.id === defaultId);
    return preferred ?? entries[0];
  };

  let resolved = null as { provider: string; model?: string } | null;
  if (
    activeModel &&
    VISION_PROVIDERS.includes(activeModel.provider as (typeof VISION_PROVIDERS)[number]) &&
    (await hasProviderKey(activeModel.provider))
  ) {
    resolved = activeModel;
  }

  if (!resolved) {
    for (const provider of VISION_PROVIDERS) {
      if (!(await hasProviderKey(provider))) {
        continue;
      }
      const entry = selectCatalogModel(provider);
      if (entry) {
        resolved = { provider, model: entry.id };
        break;
      }
    }
  }

  if (!resolved) {
    resolved = await resolveAutoImageModel({
      cfg,
      agentDir,
      activeModel,
    });
  }

  if (!resolved?.model) {
    logVerbose(`${logPrefix}: no vision provider available for image description`);
    return null;
  }

  const { provider, model } = resolved;
  logVerbose(`${logPrefix}: describing image with ${provider}/${model}`);

  try {
    const buffer = await fs.readFile(imagePath);
    const { describeImageWithModel } = await import("../media-understanding/providers/image.js");
    const mime = contentType || inferMimeFromPath(imagePath);
    const result = await describeImageWithModel({
      buffer,
      fileName,
      mime,
      prompt,
      cfg,
      agentDir: agentDir ?? "",
      provider,
      model,
      maxTokens: 150,
      timeoutMs: 30000,
    });
    return result.text;
  } catch (err) {
    logVerbose(`${logPrefix}: failed to describe image: ${String(err)}`);
    return null;
  }
}
