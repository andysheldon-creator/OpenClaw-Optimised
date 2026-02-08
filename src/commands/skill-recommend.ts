/**
 * Skill Recommendation Engine
 *
 * Analyzes user configuration and suggests relevant skills.
 */

import * as os from "node:os";
import type { SkillStatusEntry, SkillStatusReport } from "../agents/skills-status.js";
import type { OpenClawConfig } from "../config/config.js";

export interface SkillRecommendation {
  skill: SkillStatusEntry;
  reason: string;
  priority: number; // higher = more relevant
}

interface RecommendationRule {
  id: string;
  check: (config: OpenClawConfig | null, report: SkillStatusReport) => boolean;
  skillNames: string[];
  reason: string;
  priority: number;
}

const RECOMMENDATION_RULES: RecommendationRule[] = [
  // Platform-specific
  {
    id: "macos-notes",
    check: () => os.platform() === "darwin",
    skillNames: ["apple-notes", "apple-reminders"],
    reason: "You're on macOS — manage Apple Notes and Reminders directly",
    priority: 80,
  },
  {
    id: "macos-things",
    check: () => os.platform() === "darwin",
    skillNames: ["things-mac"],
    reason: "You're on macOS — integrate with Things 3 task manager",
    priority: 70,
  },

  // Channel-based
  {
    id: "telegram-user",
    check: (config) => Boolean(config?.channels?.telegram),
    skillNames: ["imsg", "wacli"],
    reason: "You use Telegram — send messages across platforms",
    priority: 60,
  },
  {
    id: "discord-user",
    check: (config) => Boolean(config?.channels?.discord),
    skillNames: ["discord"],
    reason: "You use Discord — enhanced Discord integration",
    priority: 60,
  },
  {
    id: "slack-user",
    check: (config) => Boolean(config?.channels?.slack),
    skillNames: ["slack"],
    reason: "You use Slack — enhanced Slack integration",
    priority: 60,
  },

  // Productivity
  {
    id: "google-workspace",
    check: () => true, // Always suggest if not installed
    skillNames: ["gog"],
    reason: "Manage Gmail, Google Calendar, and Drive from chat",
    priority: 75,
  },
  {
    id: "github-integration",
    check: () => true,
    skillNames: ["github"],
    reason: "Manage GitHub issues, PRs, and repos from chat",
    priority: 70,
  },
  {
    id: "obsidian-notes",
    check: () => true,
    skillNames: ["obsidian"],
    reason: "Connect your Obsidian vault for note-taking",
    priority: 65,
  },

  // Utilities - good defaults
  {
    id: "starter-weather",
    check: () => true,
    skillNames: ["weather"],
    reason: "Get weather forecasts — great starter skill",
    priority: 90,
  },
  {
    id: "starter-summarize",
    check: () => true,
    skillNames: ["summarize"],
    reason: "Summarize URLs, videos, and documents",
    priority: 85,
  },

  // Media & creative
  {
    id: "tts-elevenlabs",
    check: () => true,
    skillNames: ["sag"],
    reason: "Text-to-speech with ElevenLabs voices",
    priority: 50,
  },
  {
    id: "gif-search",
    check: () => true,
    skillNames: ["gifgrep"],
    reason: "Search and send GIFs in conversations",
    priority: 45,
  },

  // Development
  {
    id: "coding-agent",
    check: () => true,
    skillNames: ["coding-agent"],
    reason: "Run Codex, Claude Code, or other coding agents",
    priority: 55,
  },
];

export interface RecommendOptions {
  limit?: number;
  includeInstalled?: boolean;
}

export function getSkillRecommendations(
  config: OpenClawConfig | null,
  report: SkillStatusReport,
  options: RecommendOptions = {},
): SkillRecommendation[] {
  const { limit = 5, includeInstalled = false } = options;

  // Get names of already installed/eligible skills
  const installedSkills = new Set(
    report.skills
      .filter((s) => s.eligible || s.source === "workspace" || s.source === "managed")
      .map((s) => s.name),
  );

  const recommendations: SkillRecommendation[] = [];

  for (const rule of RECOMMENDATION_RULES) {
    // Check if rule condition is met
    if (!rule.check(config, report)) {
      continue;
    }

    for (const skillName of rule.skillNames) {
      // Skip already installed unless requested
      if (!includeInstalled && installedSkills.has(skillName)) {
        continue;
      }

      // Find skill in report
      const skill = report.skills.find((s) => s.name === skillName);
      if (!skill) {
        continue;
      }

      // Check if already recommended (avoid duplicates)
      if (recommendations.some((r) => r.skill.name === skillName)) {
        continue;
      }

      recommendations.push({
        skill,
        reason: rule.reason,
        priority: rule.priority,
      });
    }
  }

  // Sort by priority (highest first) and limit
  return recommendations.toSorted((a, b) => b.priority - a.priority).slice(0, limit);
}

export function formatRecommendations(
  recommendations: SkillRecommendation[],
  json?: boolean,
): string {
  if (json) {
    return JSON.stringify(
      recommendations.map((r) => ({
        name: r.skill.name,
        description: r.skill.description,
        emoji: r.skill.emoji,
        reason: r.reason,
        priority: r.priority,
        eligible: r.skill.eligible,
      })),
      null,
      2,
    );
  }

  if (recommendations.length === 0) {
    return [
      "",
      "🦞 No new recommendations!",
      "",
      "You've got a great setup. Explore more with:",
      "  → openclaw skills list",
      "  → npx clawhub search",
      "",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("🦞 Recommended skills for you:");
  lines.push("");

  for (const rec of recommendations) {
    const emoji = rec.skill.emoji ?? "📦";
    const status = rec.skill.eligible ? "\x1b[32m(ready)\x1b[0m" : "\x1b[33m(needs setup)\x1b[0m";

    lines.push(`${emoji} \x1b[1m${rec.skill.name}\x1b[0m ${status}`);
    lines.push(`   ${rec.skill.description || rec.reason}`);
    lines.push(`   → npx clawhub install ${rec.skill.name}`);
    lines.push("");
  }

  lines.push("\x1b[2mTip: Run 'openclaw skills list' to see all available skills.\x1b[0m");
  lines.push("");

  return lines.join("\n");
}
