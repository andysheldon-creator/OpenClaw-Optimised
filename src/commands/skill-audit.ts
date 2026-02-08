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

export type RiskLevel = "Low" | "Medium" | "High";

export interface SkillAuditResult {
  skillName: string;
  emoji?: string;
  permissions: PermissionKind[];
  tools: string[];
  riskLevel: RiskLevel;
  riskReason?: string;
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

  // Risk Assessment Logic
  let riskLevel: RiskLevel = "Low";
  let riskReason = "";

  const hasSystem = permissions.has("System");
  const hasNetwork = permissions.has("Network");
  const hasFile = permissions.has("FileSystem");
  const hasPrivacy = permissions.has("Privacy");

  if (hasSystem && hasNetwork) {
    riskLevel = "High";
    riskReason =
      "Can execute system commands AND access the internet (potential data exfiltration risk).";
  } else if (hasSystem || (hasFile && hasNetwork)) {
    riskLevel = "High";
    riskReason = "Critical access to system or files with network capabilities.";
  } else if (hasFile || hasPrivacy || hasNetwork) {
    riskLevel = "Medium";
    riskReason = "Has access to files, privacy data, or network.";
  } else {
    riskLevel = "Low";
    riskReason = "Only limited or no sensitive permissions detected.";
  }

  return {
    skillName: entry.skill.name,
    emoji: entry.metadata?.emoji,
    permissions: Array.from(permissions),
    tools,
    riskLevel,
    riskReason,
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
  lines.push("\x1b[2mAnalyzing capabilities and potential risks of installed skills.\x1b[0m");
  lines.push("");

  // Sort by risk (High first) then name
  const riskOrder: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...results].toSorted((a, b) => {
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    return a.skillName.localeCompare(b.skillName);
  });

  for (const res of sorted) {
    const emoji = res.emoji ?? "📦";
    const riskColors: Record<RiskLevel, string> = {
      High: "\x1b[31m", // Red
      Medium: "\x1b[33m", // Yellow
      Low: "\x1b[32m", // Green
    };
    const riskLabel = `${riskColors[res.riskLevel]}${res.riskLevel} Risk\x1b[0m`;

    lines.push(`${emoji} \x1b[1m${res.skillName}\x1b[0m  [${riskLabel}]`);

    if (res.permissions.length > 0) {
      lines.push(`   \x1b[2mPermissions:\x1b[0m ${res.permissions.join(", ")}`);
    }

    if (res.riskLevel !== "Low") {
      lines.push(`   \x1b[2mWhy:\x1b[0m ${res.riskReason}`);
    }

    if (res.tools.length > 0) {
      lines.push(`   \x1b[2mTools:\x1b[0m ${res.tools.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(
    "\x1b[2mNote: This is an automated security analysis. Always review skill source code if unsure.\x1b[0m",
  );
  lines.push("");

  return lines.join("\n");
}
