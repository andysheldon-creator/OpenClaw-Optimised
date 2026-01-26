import { resolveFetch } from "./fetch.js";

/**
 * Result type for safeFetch - always resolves, never rejects.
 * Check `ok` to determine if the fetch succeeded.
 */
export type SafeFetchResult =
  | {
      ok: true;
      response: Response;
      error: null;
    }
  | {
      ok: false;
      response: null;
      error: Error;
      /** Original error message for logging/debugging */
      message: string;
      /** Error type classification for better handling */
      type: "network" | "abort" | "timeout" | "unknown";
    };

/**
 * Safe fetch wrapper that never throws - always resolves to a result object.
 *
 * This prevents unhandled promise rejections from crashing the gateway while
 * preserving full error information for logging and debugging.
 *
 * @example
 * ```ts
 * const result = await safeFetch('https://api.example.com/data');
 * if (result.ok) {
 *   const data = await result.response.json();
 *   // handle success
 * } else {
 *   console.error('Fetch failed:', result.message, result.type);
 *   // handle error gracefully without crashing
 * }
 * ```
 */
export async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<SafeFetchResult> {
  const fetchImpl = resolveFetch();
  if (!fetchImpl) {
    const error = new Error("fetch is not available in this environment");
    return {
      ok: false,
      response: null,
      error,
      message: error.message,
      type: "unknown",
    };
  }

  try {
    const response = await fetchImpl(input, init);
    return {
      ok: true,
      response,
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message || "Unknown fetch error";
    const type = classifyFetchError(error);

    // Log the error for debugging but don't crash
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : "[Request]";
    console.error(`[clawdbot] safeFetch failed [${type}]: ${url}`, message);

    return {
      ok: false,
      response: null,
      error,
      message,
      type,
    };
  }
}

/**
 * Classify fetch errors into categories for better error handling
 */
function classifyFetchError(error: Error): "network" | "abort" | "timeout" | "unknown" {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Check for abort signals
  if (name === "aborterror" || message.includes("abort")) {
    return "abort";
  }

  // Check for timeout
  if (message.includes("timeout")) {
    return "timeout";
  }

  // Check for network errors (most common crash cause)
  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  ) {
    return "network";
  }

  return "unknown";
}

/**
 * Helper to extract text from a safe fetch response with proper error handling.
 * Returns null if the fetch failed or if reading the response fails.
 */
export async function safeFetchText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  const result = await safeFetch(input, init);
  if (!result.ok) {
    return null;
  }

  try {
    return await result.response.text();
  } catch (err) {
    console.error("[clawdbot] Failed to read response text:", err);
    return null;
  }
}

/**
 * Helper to extract JSON from a safe fetch response with proper error handling.
 * Returns null if the fetch failed or if parsing the JSON fails.
 */
export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T | null> {
  const result = await safeFetch(input, init);
  if (!result.ok) {
    return null;
  }

  try {
    return (await result.response.json()) as T;
  } catch (err) {
    console.error("[clawdbot] Failed to parse response JSON:", err);
    return null;
  }
}
