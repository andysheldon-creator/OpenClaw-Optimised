/**
 * Skill Permissions Audit
 *
 * Scans installed skills and categorizes their capabilities
 * based on the tools they provide.
 */

import type { SkillEntry } from "../agents/skills.js";

export type PermissionKind =
  | "FileSystem"
  | "Network"
  | "Messaging"
  | "System"
  | "Media"
  | "Privacy";

export interface SkillAuditResult {
  skillName: string;
  emoji?: string;
  permissions: PermissionKind[];
  tools: string[];
}

const PERMISSION_PATTERNS: Record<PermissionKind, RegExp> = {
  FileSystem: /\b(file|read|write|edit|path|dir|folder|fs|save|delete|rm|mv|cp)\b/i,
  Network: /\b(web|http|https|fetch|curl|url|request|api|download|upload|search|crawl|brave)\b/i,
  Messaging:
    /\b(message|msg|send|post|broadcast|telegram|discord|slack|whatsapp|signal|imessage|matrix|teams)\b/i,
  System: /\b(exec|shell|process|terminal|cmd|bash|sh|os|run|service|system|host)\b/i,
  Media: /\b(camera|video|image|photo|audio|sound|capture|frame|screenshot|recorder|canvas)\b/i,
  Privacy:
    /\b(location|geo|gps|contact|people|identity|secret|password|key|token|auth|credential|user|profile)\b/i,
};

/**
 * Audit a single skill based on its tool names and descriptions.
 */
export function auditSkill(entry: SkillEntry): SkillAuditResult {
  const permissions = new Set<PermissionKind>();
  const tools = entry.skill.tools.map((t) => t.name);
  const searchableText = [
    entry.skill.name,
    entry.skill.description ?? "",
    ...entry.skill.tools.flatMap((t) => [t.name, t.description ?? ""]),
  ].join(" ");

  for (const [kind, pattern] of Object.entries(PERMISSION_PATTERNS)) {
    if (pattern.test(searchableText)) {
      permissions.add(kind as PermissionKind);
    }
  }

  return {
    skillName: entry.skill.name,
    emoji: entry.metadata?.emoji,
    permissions: Array.from(permissions),
    tools,
  };
}

/**
 * Format the audit result for display.
 */
export function formatAuditReport(results: SkillAuditResult[]): string {
  if (results.length === 0) {
    return "\nNo skills found to audit.\n";
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("🛡️  \x1b[1mSkill Permissions Audit Report\x1b[0m");
  lines.push("\x1b[2mAnalyzing capabilities based on provided tools.\x1b[0m");
  lines.push("");

  // Sort by name
  const sorted = [...results].toSorted((a, b) => a.skillName.localeCompare(b.skillName));

  for (const res of sorted) {
    const emoji = res.emoji ?? "📦";
    const perms =
      res.permissions.length > 0
        ? res.permissions.map((p) => `\x1b[33m${p}\x1b[0m`).join(", ")
        : "\x1b[2mNo sensitive permissions detected\x1b[0m";

    lines.push(`${emoji} \x1b[1m${res.skillName}\x1b[0m`);
    lines.push(`   \x1b[2mPermissions:\x1b[0m ${perms}`);
    if (res.tools.length > 0) {
      lines.push(`   \x1b[2mTools:\x1b[0m ${res.tools.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("\x1b[2mNote: This is an automated analysis based on tool descriptions.\x1b[0m");
  lines.push("");

  return lines.join("\n");
}
