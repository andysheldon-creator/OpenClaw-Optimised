export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function statusIcon(status: string): string {
  switch (status) {
    case "online":
    case "connected":
    case "running":
    case "ok":
    case "active":
      return "\u2705";
    case "offline":
    case "disconnected":
    case "stopped":
    case "error":
    case "failed":
      return "\u274C";
    case "warning":
    case "degraded":
      return "\u26A0\uFE0F";
    case "pending":
    case "connecting":
      return "\u23F3";
    default:
      return "\u2796";
  }
}

export function fmtNum(n: unknown): string {
  if (typeof n !== "number" || Number.isNaN(n)) {
    return "\u2014";
  }
  return n.toLocaleString("en-US");
}

export function fmtDuration(ms: unknown): string {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms < 0) {
    return "\u2014";
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function fmtUptime(startMs: unknown): string {
  if (typeof startMs !== "number" || Number.isNaN(startMs)) {
    return "\u2014";
  }
  return fmtDuration(Date.now() - startMs);
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) {
    return str;
  }
  return str.slice(0, max - 1) + "\u2026";
}
