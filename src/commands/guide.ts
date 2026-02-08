/**
 * Starter Guide - Simple onboarding checklist for new users
 *
 * Shows a friendly list of tasks to help users get started with OpenClaw.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot } from "../config/config.js";
import { resolveUserPath } from "../utils.js";

export interface GuideTask {
  id: string;
  title: string;
  description: string;
  command?: string;
  check: (config: OpenClawConfig | null, workspacePath: string) => boolean;
}

const GUIDE_TASKS: GuideTask[] = [
  {
    id: "model",
    title: "Set up an AI model",
    description: "Connect to an AI provider (Anthropic, OpenAI, etc.)",
    command: "openclaw onboard",
    check: (config) => {
      if (!config) {
        return false;
      }
      const model = config.agents?.defaults?.model?.primary;
      return Boolean(model && model !== "");
    },
  },
  {
    id: "channel",
    title: "Connect a chat channel",
    description: "Link Telegram, Discord, WhatsApp, or another messaging app",
    command: "openclaw onboard --channels",
    check: (config) => {
      if (!config?.channels) {
        return false;
      }
      const channels = ["telegram", "discord", "whatsapp", "slack", "signal"] as const;
      return channels.some((ch) => {
        const channelConfig = config.channels?.[ch];
        return (
          channelConfig &&
          typeof channelConfig === "object" &&
          Object.keys(channelConfig).length > 0
        );
      });
    },
  },
  {
    id: "identity",
    title: "Create your identity",
    description: "Tell your agent who you are in IDENTITY.md",
    command: "edit ~/.openclaw/workspace/IDENTITY.md",
    check: (_config, workspacePath) => {
      const identityPath = path.join(workspacePath, "IDENTITY.md");
      if (!fs.existsSync(identityPath)) {
        return false;
      }
      const content = fs.readFileSync(identityPath, "utf-8");
      // Check if it's been customized (not just the template)
      return content.length > 100 && !content.includes("_(待确认)_");
    },
  },
  {
    id: "skill",
    title: "Install a skill",
    description: "Add capabilities like weather, calendar, or notes",
    command: "openclaw skill install weather",
    check: (config) => {
      // Check if skills.install array has entries
      const install = config?.skills?.install;
      return Array.isArray(install) && install.length > 0;
    },
  },
  {
    id: "first-message",
    title: "Send your first message",
    description: "Say hello to your agent!",
    check: (_config, workspacePath) => {
      // Check if any session transcript exists
      const sessionsPath = path.join(workspacePath, "..", "sessions");
      if (!fs.existsSync(sessionsPath)) {
        return false;
      }
      try {
        const files = fs.readdirSync(sessionsPath);
        return files.some((f) => f.endsWith(".jsonl"));
      } catch {
        return false;
      }
    },
  },
];

export interface GuideResult {
  tasks: Array<{
    task: GuideTask;
    completed: boolean;
  }>;
  completedCount: number;
  totalCount: number;
  allDone: boolean;
}

export function checkGuideTasks(config: OpenClawConfig | null, workspacePath: string): GuideResult {
  const results = GUIDE_TASKS.map((task) => ({
    task,
    completed: task.check(config, workspacePath),
  }));

  const completedCount = results.filter((r) => r.completed).length;

  return {
    tasks: results,
    completedCount,
    totalCount: results.length,
    allDone: completedCount === results.length,
  };
}

export function formatGuideOutput(result: GuideResult): string {
  const lines: string[] = [];

  const progressBar = (completed: number, total: number) => {
    const filled = Math.round((completed / total) * 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  };

  lines.push("");
  lines.push("🦞 Welcome to OpenClaw!");
  lines.push("");

  if (result.allDone) {
    lines.push("🎉 You've completed all starter tasks! You're ready to go.");
    lines.push("");
    lines.push("Next steps:");
    lines.push("  • Explore more skills: openclaw skill search");
    lines.push("  • Read the docs: https://docs.openclaw.ai");
    lines.push("  • Join the community: https://discord.gg/openclaw");
  } else {
    lines.push(
      `Progress: ${progressBar(result.completedCount, result.totalCount)} ${result.completedCount}/${result.totalCount}`,
    );
    lines.push("");
    lines.push("Get started:");
    lines.push("");

    for (const { task, completed } of result.tasks) {
      const icon = completed ? "✓" : "○";
      const status = completed ? "\x1b[32m" : "\x1b[0m"; // green or default
      const reset = "\x1b[0m";

      lines.push(`  ${status}${icon}${reset} ${task.title}`);
      if (!completed) {
        lines.push(`    ${task.description}`);
        if (task.command) {
          lines.push(`    → ${task.command}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("Run \x1b[36mopenclaw guide\x1b[0m anytime to see this list.");
  lines.push("");

  return lines.join("\n");
}

export async function runGuideCommand(): Promise<void> {
  const configSnapshot = await readConfigFileSnapshot();
  const config = configSnapshot?.config ?? null;
  const workspacePath = resolveUserPath(
    config?.agents?.defaults?.workspace ?? "~/.openclaw/workspace",
  );

  const result = checkGuideTasks(config, workspacePath);
  console.log(formatGuideOutput(result));
}
