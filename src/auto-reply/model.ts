import { escapeRegExp } from "../utils.js";

export function extractModelDirective(
  body?: string,
  options?: { aliases?: string[] },
): {
  cleaned: string;
  rawModel?: string;
  rawProfile?: string;
  hasDirective: boolean;
} {
  if (!body) {
    return { cleaned: "", hasDirective: false };
  }

  const modelMatch = body.match(
    /(?:^|\s)\/model(?=$|\s|:)\s*:?\s*([A-Za-z0-9_.:@-]+(?:\/[A-Za-z0-9_.:@-]+)*)?/i,
  );

  const aliases = (options?.aliases ?? []).map((alias) => alias.trim()).filter(Boolean);
  const aliasMatch =
    modelMatch || aliases.length === 0
      ? null
      : body.match(
          new RegExp(
            `(?:^|\\s)\\/(${aliases.map(escapeRegExp).join("|")})(?=$|\\s|:)(?:\\s*:\\s*)?`,
            "i",
          ),
        );

  const match = modelMatch ?? aliasMatch;
  const raw = modelMatch ? modelMatch?.[1]?.trim() : aliasMatch?.[1]?.trim();

  let rawModel = raw;
  let rawProfile: string | undefined;
  if (raw?.includes("@")) {
    // Find the last @ that could be an auth profile separator.
    // Only treat @ as a separator if it's NOT preceded by a / (to support
    // OpenRouter preset paths like "openrouter/@preset/model-name").
    const atIndex = raw.lastIndexOf("@");
    const charBefore = atIndex > 0 ? raw[atIndex - 1] : undefined;
    if (charBefore !== "/") {
      // Split only on the last @ to preserve any @ in the model path
      rawModel = raw.slice(0, atIndex).trim();
      rawProfile = raw.slice(atIndex + 1).trim() || undefined;
    }
  }

  const cleaned = match ? body.replace(match[0], " ").replace(/\s+/g, " ").trim() : body.trim();

  return {
    cleaned,
    rawModel,
    rawProfile,
    hasDirective: !!match,
  };
}
