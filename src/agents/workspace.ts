import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveUserPath } from "../utils.js";

export const DEFAULT_AGENT_WORKSPACE_DIR = path.join(os.homedir(), "clawd");
export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
export const DEFAULT_SOUL_FILENAME = "SOUL.md";
export const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_USER_FILENAME = "USER.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";

const DEFAULT_AGENTS_TEMPLATE = `# AGENTS.md - Clawdis Workspace

This folder is the assistant's working directory.

## First run (one-time)
- If BOOTSTRAP.md exists, follow its ritual and delete it once complete.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Backup tip (recommended)
If you treat this workspace as the agent's "memory", make it a git repo (ideally private) so identity
and notes are backed up.

\`\`\`bash
git init
git add AGENTS.md
git commit -m "Add agent workspace"
\`\`\`

## Safety defaults
- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Be concise in chat; write longer output to files in this workspace.

## Daily memory (recommended)
- Keep a short daily log at memory/YYYY-MM-DD.md (create memory/ if needed).
- On session start, read today + yesterday if present.
- Capture durable facts, preferences, and decisions; avoid secrets.

## Customize
- Add your preferred style, rules, and "memory" here.
`;

const DEFAULT_SOUL_TEMPLATE = `# SOUL.md - Persona & Boundaries

Describe who the assistant is, tone, and boundaries.

- Keep replies concise and direct.
- Ask clarifying questions when needed.
- Never send streaming/partial replies to external messaging surfaces.
`;

const DEFAULT_TOOLS_TEMPLATE = `# TOOLS.md - User Tool Notes (editable)

This file is for *your* notes about external tools and conventions.
It does not define which tools exist; Clawdis provides built-in tools internally.

## Examples

### imsg
- Send an iMessage/SMS: describe who/what, confirm before sending.
- Prefer short messages; avoid sending secrets.

### sag
- Text-to-speech: specify voice, target speaker/room, and whether to stream.

Add whatever else you want the assistant to know about your local toolchain.
`;

const DEFAULT_BOOTSTRAP_TEMPLATE = `# BOOTSTRAP.md - First Run Ritual (delete after)

Hello. I was just born.

## Your mission
Start a short, playful conversation and learn:
- Who am I?
- What am I?
- Who are you?
- How should I call you?

## How to ask (cute + helpful)
Say:
"Hello! I was just born. Who am I? What am I? Who are you? How should I call you?"

Then offer suggestions:
- 3-5 name ideas.
- 3-5 creature/vibe combos.
- 5 emoji ideas.

## Write these files
After the user chooses, update:

1) IDENTITY.md
- Name
- Creature
- Vibe
- Emoji

2) USER.md
- Name
- Preferred address
- Pronouns (optional)
- Timezone (optional)
- Notes

3) ~/.clawdis/clawdis.json
Set identity.name, identity.theme, identity.emoji to match IDENTITY.md.

## Cleanup
Delete BOOTSTRAP.md once this is complete.
`;

const DEFAULT_IDENTITY_TEMPLATE = `# IDENTITY.md - Agent Identity

- Name:
- Creature:
- Vibe:
- Emoji:
`;

const DEFAULT_USER_TEMPLATE = `# USER.md - User Profile

- Name:
- Preferred address:
- Pronouns (optional):
- Timezone (optional):
- Notes:
`;

const TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/templates",
);

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return content;
  const start = endIndex + "\n---".length;
  let trimmed = content.slice(start);
  trimmed = trimmed.replace(/^\s+/, "");
  return trimmed;
}

async function loadTemplate(name: string, fallback: string): Promise<string> {
  const templatePath = path.join(TEMPLATE_DIR, name);
  try {
    const content = await fs.readFile(templatePath, "utf-8");
    return stripFrontMatter(content);
  } catch {
    return fallback;
  }
}

export type WorkspaceBootstrapFileName =
  | typeof DEFAULT_AGENTS_FILENAME
  | typeof DEFAULT_SOUL_FILENAME
  | typeof DEFAULT_TOOLS_FILENAME
  | typeof DEFAULT_IDENTITY_FILENAME
  | typeof DEFAULT_USER_FILENAME
  | typeof DEFAULT_BOOTSTRAP_FILENAME;

export type WorkspaceBootstrapFile = {
  name: WorkspaceBootstrapFileName;
  path: string;
  content?: string;
  missing: boolean;
};

async function writeFileIfMissing(filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, {
      encoding: "utf-8",
      flag: "wx",
    });
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "EEXIST") throw err;
  }
}

// ── File categories ──────────────────────────────────────────────────
// "Personality" files contain the bot's identity, owner info, and
// conversation history — these should be preserved across reinstalls.
// "Setup" files contain workspace conventions, tool instructions, and
// the first-run ritual — these should be refreshed on every install.
export const PERSONALITY_FILES: readonly WorkspaceBootstrapFileName[] = [
  DEFAULT_SOUL_FILENAME, // persona & boundaries
  DEFAULT_IDENTITY_FILENAME, // agent name, creature, vibe, emoji
  DEFAULT_USER_FILENAME, // owner name, pronouns, timezone
] as const;

export const SETUP_FILES: readonly WorkspaceBootstrapFileName[] = [
  DEFAULT_AGENTS_FILENAME, // workspace conventions & safety defaults
  DEFAULT_TOOLS_FILENAME, // tool notes (imsg, sag, etc.)
  DEFAULT_BOOTSTRAP_FILENAME, // first-run ritual (deleted after use)
] as const;

/**
 * Check which bootstrap files and directories already exist in a workspace.
 * Returns separate lists for personality files (SOUL, IDENTITY, USER) and
 * setup files (AGENTS, TOOLS, BOOTSTRAP), plus whether a `memory/`
 * directory is present.
 */
export async function detectExistingWorkspace(dir: string): Promise<{
  personalityFiles: { name: WorkspaceBootstrapFileName; path: string }[];
  setupFiles: { name: WorkspaceBootstrapFileName; path: string }[];
  hasMemoryDir: boolean;
}> {
  const resolvedDir = resolveUserPath(dir);
  const personalityFiles: { name: WorkspaceBootstrapFileName; path: string }[] =
    [];
  const setupFiles: { name: WorkspaceBootstrapFileName; path: string }[] = [];

  const allFiles = [...PERSONALITY_FILES, ...SETUP_FILES];
  for (const name of allFiles) {
    const filePath = path.join(resolvedDir, name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile() && stat.size > 0) {
        const entry = { name, path: filePath };
        if ((PERSONALITY_FILES as readonly string[]).includes(name)) {
          personalityFiles.push(entry);
        } else {
          setupFiles.push(entry);
        }
      }
    } catch {
      // File doesn't exist — skip
    }
  }
  let hasMemoryDir = false;
  try {
    const stat = await fs.stat(path.join(resolvedDir, "memory"));
    hasMemoryDir = stat.isDirectory();
  } catch {
    // No memory directory
  }
  return { personalityFiles, setupFiles, hasMemoryDir };
}

export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureBootstrapFiles?: boolean;
  /**
   * When true, personality files (SOUL.md, IDENTITY.md, USER.md) are
   * preserved and only setup files (AGENTS.md, TOOLS.md, BOOTSTRAP.md)
   * are refreshed. When false (default), all files use write-if-missing.
   * When "full", all files are overwritten including personality files.
   */
  upgradeMode?: false | "preserve-personality" | "full";
}): Promise<{
  dir: string;
  agentsPath?: string;
  soulPath?: string;
  toolsPath?: string;
  identityPath?: string;
  userPath?: string;
  bootstrapPath?: string;
}> {
  const rawDir = params?.dir?.trim()
    ? params.dir.trim()
    : DEFAULT_AGENT_WORKSPACE_DIR;
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (!params?.ensureBootstrapFiles) return { dir };

  const agentsPath = path.join(dir, DEFAULT_AGENTS_FILENAME);
  const soulPath = path.join(dir, DEFAULT_SOUL_FILENAME);
  const toolsPath = path.join(dir, DEFAULT_TOOLS_FILENAME);
  const identityPath = path.join(dir, DEFAULT_IDENTITY_FILENAME);
  const userPath = path.join(dir, DEFAULT_USER_FILENAME);
  const bootstrapPath = path.join(dir, DEFAULT_BOOTSTRAP_FILENAME);

  const agentsTemplate = await loadTemplate(
    DEFAULT_AGENTS_FILENAME,
    DEFAULT_AGENTS_TEMPLATE,
  );
  const soulTemplate = await loadTemplate(
    DEFAULT_SOUL_FILENAME,
    DEFAULT_SOUL_TEMPLATE,
  );
  const toolsTemplate = await loadTemplate(
    DEFAULT_TOOLS_FILENAME,
    DEFAULT_TOOLS_TEMPLATE,
  );
  const identityTemplate = await loadTemplate(
    DEFAULT_IDENTITY_FILENAME,
    DEFAULT_IDENTITY_TEMPLATE,
  );
  const userTemplate = await loadTemplate(
    DEFAULT_USER_FILENAME,
    DEFAULT_USER_TEMPLATE,
  );
  const bootstrapTemplate = await loadTemplate(
    DEFAULT_BOOTSTRAP_FILENAME,
    DEFAULT_BOOTSTRAP_TEMPLATE,
  );

  const mode = params?.upgradeMode || false;
  const forceWrite = (fp: string, content: string) =>
    fs.writeFile(fp, content, { encoding: "utf-8" });

  // Setup files: always overwrite in preserve-personality and full modes
  const writeSetup = mode ? forceWrite : writeFileIfMissing;
  await writeSetup(agentsPath, agentsTemplate);
  await writeSetup(toolsPath, toolsTemplate);
  await writeSetup(bootstrapPath, bootstrapTemplate);

  // Personality files: keep in preserve-personality mode, overwrite in full
  const writePersonality = mode === "full" ? forceWrite : writeFileIfMissing;
  await writePersonality(soulPath, soulTemplate);
  await writePersonality(identityPath, identityTemplate);
  await writePersonality(userPath, userTemplate);

  return {
    dir,
    agentsPath,
    soulPath,
    toolsPath,
    identityPath,
    userPath,
    bootstrapPath,
  };
}

export async function loadWorkspaceBootstrapFiles(
  dir: string,
): Promise<WorkspaceBootstrapFile[]> {
  const resolvedDir = resolveUserPath(dir);

  const entries: Array<{
    name: WorkspaceBootstrapFileName;
    filePath: string;
  }> = [
    {
      name: DEFAULT_AGENTS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_AGENTS_FILENAME),
    },
    {
      name: DEFAULT_SOUL_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_SOUL_FILENAME),
    },
    {
      name: DEFAULT_TOOLS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_TOOLS_FILENAME),
    },
    {
      name: DEFAULT_IDENTITY_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_IDENTITY_FILENAME),
    },
    {
      name: DEFAULT_USER_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_USER_FILENAME),
    },
    {
      name: DEFAULT_BOOTSTRAP_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_BOOTSTRAP_FILENAME),
    },
  ];

  const result: WorkspaceBootstrapFile[] = [];
  for (const entry of entries) {
    try {
      const content = await fs.readFile(entry.filePath, "utf-8");
      result.push({
        name: entry.name,
        path: entry.filePath,
        content,
        missing: false,
      });
    } catch {
      result.push({ name: entry.name, path: entry.filePath, missing: true });
    }
  }
  return result;
}
