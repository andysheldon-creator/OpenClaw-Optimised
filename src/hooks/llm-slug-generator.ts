/**
 * LLM-based slug generator for session memory filenames
 */

import type { OpenClawConfig } from "../config/config.js";
import { resolveUtilityModelRef } from "../agents/micro-model.js";
import { completeText } from "../plugin-sdk/llm.js";

/**
 * Generate a short 1-2 word filename slug from session content using LLM
 */
export async function generateSlugViaLLM(params: {
  sessionContent: string;
  cfg: OpenClawConfig;
}): Promise<string | null> {
  try {
    const defaultRef = await resolveUtilityModelRef({ cfg: params.cfg, feature: "slugGenerator" });

    const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2000)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;

    const result = await completeText({
      cfg: params.cfg,
      provider: defaultRef.provider,
      model: defaultRef.model,
      prompt,
      timeoutMs: 15_000,
      maxTokens: 64,
    });

    // Clean up the response - extract just the slug
    const slug = result.text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30); // Max 30 chars

    return slug || null;
  } catch (err) {
    console.error("[llm-slug-generator] Failed to generate slug:", err);
    return null;
  }
}
