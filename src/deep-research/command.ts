/**
 * Deep Research command parsing - KISS: Keep It Simple, Stupid
 * No @username mention handling - we don't need that complexity
 */

export type DeepResearchCommand = {
  topic: string;
};

const DEEP_COMMAND_RE = /^\/deep\s*(.*)$/s;

export function parseDeepResearchCommand(
  message: string,
): DeepResearchCommand | null {
  const trimmed = message.trim();
  const match = DEEP_COMMAND_RE.exec(trimmed);
  if (!match) return null;

  const topic = match[1]?.trim() ?? "";
  return { topic };
}
