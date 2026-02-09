import type { VideoDescriptionRequest, VideoDescriptionResult } from "../../types.js";
import { fetchWithTimeoutGuarded, normalizeBaseUrl, readErrorResponse } from "../shared.js";

export const DEFAULT_MOONSHOT_VIDEO_BASE_URL = "https://api.moonshot.ai/v1";
const DEFAULT_MOONSHOT_VIDEO_MODEL = "kimi-k2.5";
const DEFAULT_MOONSHOT_VIDEO_PROMPT = "Describe the video in detail.";

function resolveModel(model?: string): string {
  return model?.trim() || DEFAULT_MOONSHOT_VIDEO_MODEL;
}

function resolvePrompt(prompt?: string): string {
  return prompt?.trim() || DEFAULT_MOONSHOT_VIDEO_PROMPT;
}

/**
 * Describe a video using Moonshot (Kimi K2.5) OpenAI-compatible API.
 * Uses the `video_url` content type with base64 data URI.
 */
export async function describeMoonshotVideo(
  params: VideoDescriptionRequest,
): Promise<VideoDescriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(params.baseUrl, DEFAULT_MOONSHOT_VIDEO_BASE_URL);
  const allowPrivate = Boolean(params.baseUrl?.trim());
  const model = resolveModel(params.model);
  const url = `${baseUrl}/chat/completions`;

  const mime = params.mime ?? "video/mp4";
  const videoBase64 = params.buffer.toString("base64");

  const headers = new Headers(params.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${params.apiKey}`);
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: resolvePrompt(params.prompt) },
          {
            type: "video_url",
            video_url: { url: `data:${mime};base64,${videoBase64}` },
          },
        ],
      },
    ],
    max_tokens: 8192,
  };

  const { response: res, release } = await fetchWithTimeoutGuarded(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    params.timeoutMs,
    fetchFn,
    allowPrivate ? { ssrfPolicy: { allowPrivateNetwork: true } } : undefined,
  );

  try {
    if (!res.ok) {
      const detail = await readErrorResponse(res);
      const suffix = detail ? `: ${detail}` : "";
      throw new Error(`Moonshot video description failed (HTTP ${res.status})${suffix}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
      }>;
    };

    const msg = payload.choices?.[0]?.message;
    // K2.5 defaults to thinking mode: main reply in content, reasoning in reasoning_content.
    // If content is empty but reasoning_content exists, use reasoning as fallback.
    const text = msg?.content?.trim() || msg?.reasoning_content?.trim();
    if (!text) {
      throw new Error("Moonshot video description response missing content");
    }
    return { text, model };
  } finally {
    await release();
  }
}
