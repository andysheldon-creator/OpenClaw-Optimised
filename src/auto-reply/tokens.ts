export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
export const SILENT_REPLY_TOKEN = "NO_REPLY";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const escaped = escapeRegExp(token);
  // Match when the entire message is the token with optional surrounding
  // whitespace or Unicode punctuation (avoid treating CJK letters as "non-word").
  // Uses Unicode property escapes, so enable the `u` flag.
  const pattern = new RegExp(`^[\\s\\p{P}]*${escaped}[\\s\\p{P}]*$`, "u");
  return pattern.test(text);
}
