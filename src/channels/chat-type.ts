export type ChatType = "direct" | "group" | "channel" | "thread";

export function normalizeChatType(raw?: string): ChatType | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value === "direct" || value === "dm") {
    return "direct";
  }
  if (value === "group") {
    return "group";
  }
  if (value === "channel") {
    return "channel";
  }
  if (value === "thread") {
    return "thread";
  }
  return undefined;
}
