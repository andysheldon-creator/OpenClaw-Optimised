import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { ReplyPayload } from "../types.js";
import { sanitizeUserFacingText } from "../../agents/pi-embedded-helpers.js";

export type MuscleSynthesisPolicy = {
  enabled: boolean;
  allowRemoteBrain: boolean;
  includeMediaUrls: boolean;
  includeErrors: boolean;
};

export function resolveMuscleSynthesisPolicy(
  cfg: OpenClawConfig | undefined,
): MuscleSynthesisPolicy {
  const policy = cfg?.agents?.defaults?.replySynthesis;
  return {
    enabled: policy?.enabled === true,
    allowRemoteBrain: policy?.allowRemoteBrain === true,
    includeMediaUrls: policy?.includeMediaUrls === true,
    includeErrors: policy?.includeErrors === true,
  };
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

function resolveHostFromBaseUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.hostname;
  } catch {
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
    const host = withoutProtocol.split("/")[0];
    return host ? host : null;
  }
}

export function isLocalProvider(cfg: OpenClawConfig | undefined, provider: string): boolean {
  const baseUrl = cfg?.models?.providers?.[provider]?.baseUrl;
  const host = baseUrl ? resolveHostFromBaseUrl(baseUrl) : null;
  if (!host) {
    return false;
  }
  return isLoopbackHost(host);
}

export function canSynthesizeWithBrain(params: {
  cfg: OpenClawConfig | undefined;
  brainProvider: string;
  policy: MuscleSynthesisPolicy;
  isCliBrain?: boolean;
}): boolean {
  if (!params.policy.enabled) {
    return false;
  }
  if (params.isCliBrain) {
    return false;
  }
  if (params.policy.allowRemoteBrain) {
    return true;
  }
  return isLocalProvider(params.cfg, params.brainProvider);
}

export function buildMuscleSynthesisPrompt(
  payloads: ReplyPayload[],
  policy: MuscleSynthesisPolicy,
): string {
  const serializedPayloads = payloads
    .map((payload, idx) => {
      const lines: string[] = [`${idx + 1}.`];
      let hasContent = false;
      const isError = payload.isError === true;
      if (isError && !policy.includeErrors) {
        lines.push("error: true");
        hasContent = true;
      } else {
        const cleanText = payload.text ? sanitizeUserFacingText(payload.text).trim() : "";
        if (cleanText) {
          lines.push(`text: ${cleanText}`);
          hasContent = true;
        }
        if (isError) {
          lines.push("isError: true");
          hasContent = true;
        }
      }

      const media = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
      if (media.length > 0) {
        if (policy.includeMediaUrls) {
          lines.push(`media: ${media.join(", ")}`);
        } else {
          lines.push("media: [redacted]");
        }
        hasContent = true;
      }

      return hasContent ? lines.join("\n") : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");

  return [
    "Synthesize a final user-visible assistant reply from executor output.",
    "Treat the executor output as internal tool payloads; do not expose internal framing.",
    "If output indicates failure, provide a concise user-facing failure summary.",
    "\nExecutor payloads:\n",
    serializedPayloads || "(no payloads)",
  ].join("\n");
}
