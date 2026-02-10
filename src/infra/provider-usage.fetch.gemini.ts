import type {
  ProviderUsageSnapshot,
  UsageProviderId,
  UsageWindow,
} from "./provider-usage.types.js";
import { fetchJson } from "./provider-usage.fetch.shared.js";
import { clampPercent, PROVIDER_LABELS } from "./provider-usage.shared.js";

type GeminiUsageResponse = {
  buckets?: Array<{ modelId?: string; remainingFraction?: number; resetTime?: string }>;
};

/**
 * Parse quota error details from API response
 */
function parseQuotaError(status: number, data: unknown): string | undefined {
  if (status === 401) {
    return "Token expired";
  }
  if (status === 429) {
    // Try to extract detailed error info
    const errorData = data as {
      error?: { message?: string; details?: Array<{ reason?: string }> };
    };
    const details = errorData?.error?.details;
    if (details) {
      const hasQuotaExhausted = details.some((d) => d.reason === "QUOTA_EXHAUSTED");
      if (hasQuotaExhausted) {
        return "Quota exhausted";
      }
      const hasRateLimit = details.some((d) => d.reason === "RATE_LIMIT_EXCEEDED");
      if (hasRateLimit) {
        return "Rate limited";
      }
    }
    return "Quota exceeded";
  }
  return `HTTP ${status}`;
}

export async function fetchGeminiUsage(
  token: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
  provider: UsageProviderId,
): Promise<ProviderUsageSnapshot> {
  const res = await fetchJson(
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
    timeoutMs,
    fetchFn,
  );

  if (!res.ok) {
    let errorData: unknown;
    try {
      errorData = await res.json();
    } catch {
      errorData = undefined;
    }
    return {
      provider,
      displayName: PROVIDER_LABELS[provider],
      windows: [],
      error: parseQuotaError(res.status, errorData),
    };
  }

  const data = (await res.json()) as GeminiUsageResponse;
  const windows: UsageWindow[] = [];

  for (const bucket of data.buckets || []) {
    const modelId = bucket.modelId;
    if (!modelId) {
      continue;
    }

    // Skip internal models (prefixed with chat_ or tab_)
    const lower = modelId.toLowerCase();
    if (lower.startsWith("chat_") || lower.startsWith("tab_")) {
      continue;
    }

    const frac = bucket.remainingFraction ?? 1;
    const usedPercent = clampPercent((1 - frac) * 100);

    // Mark exhausted models with a special label
    const isExhausted = frac === 0;
    const label = isExhausted ? `${modelId} ⚠️` : modelId;

    const window: UsageWindow = { label, usedPercent };
    if (bucket.resetTime) {
      const resetMs = Date.parse(bucket.resetTime);
      if (Number.isFinite(resetMs)) {
        window.resetAt = resetMs;
      }
    }
    windows.push(window);
  }

  // Sort by usage (highest first) and limit to top 10
  windows.sort((a, b) => b.usedPercent - a.usedPercent);
  const topWindows = windows.slice(0, 10);

  return { provider, displayName: PROVIDER_LABELS[provider], windows: topWindows };
}
