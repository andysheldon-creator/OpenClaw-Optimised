export type ZulipTopicDirectiveResult = {
  text: string;
  topicOverride?: string;
};

// Outbound directive support:
//   [[zulip_topic: <topic>]]
// If present, remove it from the text and return the topic override.
// Multiple directives: last one wins.
export function extractZulipTopicDirective(rawText: string): ZulipTopicDirectiveResult {
  const text = rawText ?? "";
  if (!text.includes("[[")) {
    return { text };
  }

  const matches = Array.from(
    text.matchAll(/\[\[\s*zulip_topic\s*:\s*([^\]]+?)\s*\]\]/gi),
  );
  if (matches.length === 0) {
    return { text };
  }

  const last = matches[matches.length - 1];
  const topicOverride = (last?.[1] ?? "").trim();

  // Strip all occurrences.
  const stripped = text.replace(/\[\[\s*zulip_topic\s*:\s*[^\]]+?\s*\]\]/gi, "").trim();
  return { text: stripped, topicOverride: topicOverride || undefined };
}
