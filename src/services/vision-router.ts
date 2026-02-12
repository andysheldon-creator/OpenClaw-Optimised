/**
 * Vision Router Service (Week 4)
 *
 * Routes image analysis to local Ollama Vision (llava:7b) instead of
 * sending base64 images to Claude API. This saves significant costs
 * since images are the largest token consumers.
 *
 * Process:
 * 1. Detect image blocks in the incoming message
 * 2. If Ollama Vision is available, extract and send to llava
 * 3. Replace image blocks with text description from llava
 * 4. Pass the text-only message to the main LLM
 *
 * Fallback: If Ollama Vision is unavailable, images pass through
 * to Claude as normal (no change in behaviour).
 *
 * Configuration:
 * - ENABLE_VISION_ROUTING: Enable/disable (default: true)
 * - OLLAMA_VISION_MODEL: Model to use (default: llava:7b)
 * - VISION_MAX_IMAGES: Max images to process per message (default: 3)
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { defaultRuntime } from "../runtime.js";
import { checkVisionAvailable } from "./hybrid-router.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const ENABLE_VISION_ROUTING = process.env.ENABLE_VISION_ROUTING !== "false";
const OLLAMA_HOST = (
  process.env.OLLAMA_HOST ?? "http://localhost:11434"
).replace(/\/$/, "");
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "llava:7b";
const VISION_MAX_IMAGES =
  Number.parseInt(process.env.VISION_MAX_IMAGES ?? "", 10) || 3;
const VISION_TIMEOUT_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of vision processing. */
export type VisionResult = {
  /** Whether vision processing was applied. */
  applied: boolean;
  /** Number of images processed. */
  imagesProcessed: number;
  /** The modified message (images replaced with descriptions). */
  message: AgentMessage;
  /** Time taken in ms. */
  durationMs: number;
};

// ─── Image Extraction ────────────────────────────────────────────────────────

/** An extracted image from a message. */
type ExtractedImage = {
  /** Index in the content blocks array. */
  blockIndex: number;
  /** Base64 image data. */
  base64Data: string;
  /** Image media type (e.g., "image/jpeg"). */
  mediaType: string;
};

/**
 * Extract image blocks from a message's content.
 */
function extractImages(msg: AgentMessage): ExtractedImage[] {
  const raw = msg as unknown as Record<string, unknown>;
  const content = raw.content;
  if (!Array.isArray(content)) return [];

  const images: ExtractedImage[] = [];

  for (let i = 0; i < content.length; i++) {
    const block = content[i] as Record<string, unknown>;
    if (
      block &&
      block.type === "image" &&
      typeof block.source === "object" &&
      block.source !== null
    ) {
      const source = block.source as Record<string, unknown>;
      if (
        source.type === "base64" &&
        typeof source.data === "string" &&
        typeof source.media_type === "string"
      ) {
        images.push({
          blockIndex: i,
          base64Data: source.data as string,
          mediaType: source.media_type as string,
        });
      }
    }
  }

  return images;
}

// ─── Ollama Vision Analysis ──────────────────────────────────────────────────

/**
 * Send an image to Ollama Vision for analysis.
 * Returns a text description of the image.
 */
async function analyzeImageWithOllama(
  base64Data: string,
  prompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        prompt:
          prompt ||
          "Describe this image concisely. Focus on key elements, text content, and any important details.",
        images: [base64Data],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 300,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama Vision returned ${response.status}`);
    }

    const data = (await response.json()) as { response?: string };
    return data.response?.trim() ?? "[Image could not be analyzed]";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Message Transformation ──────────────────────────────────────────────────

/**
 * Replace image blocks in a message with text descriptions from Ollama Vision.
 *
 * @param msg - The message potentially containing images
 * @param contextHint - Optional hint about what to look for in images
 * @returns Modified message with images replaced by descriptions
 */
export async function processVisionMessage(
  msg: AgentMessage,
  contextHint?: string,
): Promise<VisionResult> {
  const started = Date.now();

  // Check if vision routing is enabled
  if (!ENABLE_VISION_ROUTING) {
    return {
      applied: false,
      imagesProcessed: 0,
      message: msg,
      durationMs: 0,
    };
  }

  // Extract images
  const images = extractImages(msg);
  if (images.length === 0) {
    return {
      applied: false,
      imagesProcessed: 0,
      message: msg,
      durationMs: 0,
    };
  }

  // Check if Ollama Vision is available
  const visionUp = await checkVisionAvailable();
  if (!visionUp) {
    defaultRuntime.log?.(
      "[vision-router] Ollama Vision unavailable, passing images through to Claude",
    );
    return {
      applied: false,
      imagesProcessed: 0,
      message: msg,
      durationMs: Date.now() - started,
    };
  }

  // Process up to VISION_MAX_IMAGES
  const toProcess = images.slice(0, VISION_MAX_IMAGES);
  const descriptions: Map<number, string> = new Map();
  let processed = 0;

  for (const image of toProcess) {
    try {
      const prompt = contextHint
        ? `${contextHint}. Describe this image concisely.`
        : "Describe this image concisely. Focus on key elements, text content, and any important details.";

      const description = await analyzeImageWithOllama(
        image.base64Data,
        prompt,
      );
      descriptions.set(image.blockIndex, description);
      processed++;
    } catch (err) {
      defaultRuntime.log?.(
        `[vision-router] failed to analyze image ${image.blockIndex}: ${String(err)}`,
      );
      // Leave original image in place on failure
    }
  }

  if (processed === 0) {
    return {
      applied: false,
      imagesProcessed: 0,
      message: msg,
      durationMs: Date.now() - started,
    };
  }

  // Build modified message with image blocks replaced by text descriptions
  const raw = msg as unknown as Record<string, unknown>;
  const content = raw.content as Array<Record<string, unknown>>;
  const newContent = content.map((block, idx) => {
    const description = descriptions.get(idx);
    if (description) {
      return {
        type: "text",
        text: `[Image Description] ${description}`,
      };
    }
    return block;
  });

  // Create modified message
  const modifiedMsg = {
    ...raw,
    content: newContent,
  } as unknown as AgentMessage;

  const duration = Date.now() - started;
  defaultRuntime.log?.(
    `[vision-router] processed ${processed}/${images.length} images via Ollama Vision ` +
      `duration=${duration}ms`,
  );

  return {
    applied: true,
    imagesProcessed: processed,
    message: modifiedMsg,
    durationMs: duration,
  };
}

/**
 * Check if vision routing is enabled.
 */
export function isVisionRoutingEnabled(): boolean {
  return ENABLE_VISION_ROUTING;
}
