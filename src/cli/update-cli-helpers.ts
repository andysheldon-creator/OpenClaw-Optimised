import type { confirm, isCancel, spinner } from "@clack/prompts";
import type { spawnSync } from "node:child_process";
import type fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GlobalInstallManager } from "../infra/update-global.js";
import type {
  UpdateRunResult,
  UpdateStepInfo,
  UpdateStepResult,
  UpdateStepProgress,
} from "../infra/update-runner.js";
import type { UpdateCommandOptions } from "./update-cli.js";
import { theme } from "../terminal/theme.js";

export type CommandResult = { stdout: string; stderr: string; code: number | null };
export type RunCommandFn = (
  argv: string[],
  opts: { cwd?: string; timeoutMs: number },
) => Promise<CommandResult>;
export type TrimLogTailFn = (text: string | null | undefined, maxChars?: number) => string | null;
export type DetectRunCommandFn = (
  argv: string[],
  opts: { timeoutMs: number },
) => Promise<{ stdout: string; stderr: string; code: number | null }>;

export const STEP_LABELS: Record<string, string> = {
  "clean check": "Working directory is clean",
  "upstream check": "Upstream branch exists",
  "git fetch": "Fetching latest changes",
  "git rebase": "Rebasing onto target commit",
  "git rev-parse @{upstream}": "Resolving upstream commit",
  "git rev-list": "Enumerating candidate commits",
  "git clone": "Cloning git checkout",
  "preflight worktree": "Preparing preflight worktree",
  "preflight cleanup": "Cleaning preflight worktree",
  "deps install": "Installing dependencies",
  build: "Building",
  "ui:build": "Building UI assets",
  "ui:build (post-doctor repair)": "Restoring missing UI assets",
  "ui assets verify": "Validating UI assets",
  "openclaw doctor entry": "Checking doctor entrypoint",
  "openclaw doctor": "Running doctor checks",
  "git rev-parse HEAD (after)": "Verifying update",
  "global update": "Updating via package manager",
  "global install": "Installing global package",
};

const UPDATE_QUIPS = [
  "Leveled up! New skills unlocked. You're welcome.",
  "Fresh code, same lobster. Miss me?",
  "Back and better. Did you even notice I was gone?",
  "Update complete. I learned some new tricks while I was out.",
  "Upgraded! Now with 23% more sass.",
  "I've evolved. Try to keep up.",
  "New version, who dis? Oh right, still me but shinier.",
  "Patched, polished, and ready to pinch. Let's go.",
  "The lobster has molted. Harder shell, sharper claws.",
  "Update done! Check the changelog or just trust me, it's good.",
  "Reborn from the boiling waters of npm. Stronger now.",
  "I went away and came back smarter. You should try it sometime.",
  "Update complete. The bugs feared me, so they left.",
  "New version installed. Old version sends its regards.",
  "Firmware fresh. Brain wrinkles: increased.",
  "I've seen things you wouldn't believe. Anyway, I'm updated.",
  "Back online. The changelog is long but our friendship is longer.",
  "Upgraded! Peter fixed stuff. Blame him if it breaks.",
  "Molting complete. Please don't look at my soft shell phase.",
  "Version bump! Same chaos energy, fewer crashes (probably).",
];

export const MAX_LOG_CHARS = 8000;
export const DEFAULT_PACKAGE_NAME = "openclaw";
const CORE_PACKAGE_NAMES = new Set([DEFAULT_PACKAGE_NAME]);
export const OPENCLAW_REPO_URL = "https://github.com/openclaw/openclaw.git";

export function normalizeTag(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("openclaw@")) {
    return trimmed.slice("openclaw@".length);
  }
  if (trimmed.startsWith(`${DEFAULT_PACKAGE_NAME}@`)) {
    return trimmed.slice(`${DEFAULT_PACKAGE_NAME}@`.length);
  }
  return trimmed;
}

export function pickUpdateQuip(): string {
  return UPDATE_QUIPS[Math.floor(Math.random() * UPDATE_QUIPS.length)] ?? "Update complete.";
}

function normalizeVersionTag(tag: string, parseSemver: (v: string) => unknown): string | null {
  const trimmed = tag.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return parseSemver(cleaned) ? cleaned : null;
}

export async function readPackageVersion(
  root: string,
  fsModule: typeof fs,
): Promise<string | null> {
  try {
    const raw = await fsModule.readFile(path.join(root, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function resolveTargetVersion(
  tag: string,
  fetchNpmTagVersion: (opts: {
    tag: string;
    timeoutMs?: number;
  }) => Promise<{ version?: string | null }>,
  parseSemver: (v: string) => unknown,
  timeoutMs?: number,
): Promise<string | null> {
  const direct = normalizeVersionTag(tag, parseSemver);
  if (direct) {
    return direct;
  }
  const res = await fetchNpmTagVersion({ tag, timeoutMs });
  return res.version ?? null;
}

export async function isGitCheckout(root: string, fsModule: typeof fs): Promise<boolean> {
  try {
    await fsModule.stat(path.join(root, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function readPackageName(root: string, fsModule: typeof fs): Promise<string | null> {
  try {
    const raw = await fsModule.readFile(path.join(root, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { name?: string };
    const name = parsed?.name?.trim();
    return name ? name : null;
  } catch {
    return null;
  }
}

async function isCorePackage(root: string, fsModule: typeof fs): Promise<boolean> {
  const name = await readPackageName(root, fsModule);
  return Boolean(name && CORE_PACKAGE_NAMES.has(name));
}

export async function tryWriteCompletionCache(
  root: string,
  jsonMode: boolean,
  deps: {
    spawnSync: typeof spawnSync;
    defaultRuntime: { log: (msg: string) => void };
    pathExists: (p: string) => Promise<boolean>;
    resolveNodeRunner: () => string;
    CLI_NAME: string;
  },
): Promise<void> {
  const binPath = path.join(root, "openclaw.mjs");
  if (!(await deps.pathExists(binPath))) {
    return;
  }
  const result = deps.spawnSync(
    deps.resolveNodeRunner(),
    [binPath, "completion", "--write-state"],
    {
      cwd: root,
      env: process.env,
      encoding: "utf-8",
    },
  );
  if (result.error) {
    if (!jsonMode) {
      deps.defaultRuntime.log(
        theme.warn(`Completion cache update failed: ${String(result.error)}`),
      );
    }
    return;
  }
  if (result.status !== 0 && !jsonMode) {
    const stderr = (result.stderr ?? "").toString().trim();
    const detail = stderr ? ` (${stderr})` : "";
    deps.defaultRuntime.log(theme.warn(`Completion cache update failed${detail}.`));
  }
}

/** Check if shell completion is installed and prompt user to install if not. */
export async function tryInstallShellCompletion(opts: {
  jsonMode: boolean;
  skipPrompt: boolean;
  deps: {
    confirm: typeof confirm;
    isCancel: typeof isCancel;
    defaultRuntime: { log: (msg: string) => void };
    checkShellCompletionStatus: (name: string) => Promise<{
      shell: string;
      profileInstalled: boolean;
      cacheExists: boolean;
      usesSlowPattern: boolean;
    }>;
    ensureCompletionCacheExists: (name: string) => Promise<boolean>;
    installCompletion: (shell: string, skipPrompt: boolean, cliName: string) => Promise<void>;
    stylePromptMessage: (msg: string) => string;
    replaceCliName: (s: string, name: string) => string;
    formatCliCommand: (cmd: string) => string;
    CLI_NAME: string;
  };
}): Promise<void> {
  if (opts.jsonMode || !process.stdin.isTTY) {
    return;
  }

  const {
    confirm: confirmFn,
    isCancel: isCancelFn,
    defaultRuntime,
    checkShellCompletionStatus,
    ensureCompletionCacheExists,
    installCompletion,
    stylePromptMessage,
    replaceCliName,
    formatCliCommand,
    CLI_NAME,
  } = opts.deps;

  const status = await checkShellCompletionStatus(CLI_NAME);

  // Profile uses slow dynamic pattern - upgrade to cached version
  if (status.usesSlowPattern) {
    defaultRuntime.log(theme.muted("Upgrading shell completion to cached version..."));
    // Ensure cache exists first
    const cacheGenerated = await ensureCompletionCacheExists(CLI_NAME);
    if (cacheGenerated) {
      await installCompletion(status.shell, true, CLI_NAME);
    }
    return;
  }

  // Profile has completion but no cache - auto-fix silently
  if (status.profileInstalled && !status.cacheExists) {
    defaultRuntime.log(theme.muted("Regenerating shell completion cache..."));
    await ensureCompletionCacheExists(CLI_NAME);
    return;
  }

  // No completion at all - prompt to install
  if (!status.profileInstalled) {
    defaultRuntime.log("");
    defaultRuntime.log(theme.heading("Shell completion"));

    const shouldInstall = await confirmFn({
      message: stylePromptMessage(`Enable ${status.shell} shell completion for ${CLI_NAME}?`),
      initialValue: true,
    });

    if (isCancelFn(shouldInstall) || !shouldInstall) {
      if (!opts.skipPrompt) {
        defaultRuntime.log(
          theme.muted(
            `Skipped. Run \`${replaceCliName(formatCliCommand("openclaw completion --install"), CLI_NAME)}\` later to enable.`,
          ),
        );
      }
      return;
    }

    // Generate cache first (required for fast shell startup)
    const cacheGenerated = await ensureCompletionCacheExists(CLI_NAME);
    if (!cacheGenerated) {
      defaultRuntime.log(theme.warn("Failed to generate completion cache."));
      return;
    }

    await installCompletion(status.shell, opts.skipPrompt, CLI_NAME);
  }
}

export async function isEmptyDir(targetPath: string, fsModule: typeof fs): Promise<boolean> {
  try {
    const entries = await fsModule.readdir(targetPath);
    return entries.length === 0;
  } catch {
    return false;
  }
}

export function resolveGitInstallDir(
  resolveStateDir: (env: typeof process.env, homedir: () => string) => string,
): string {
  const override = process.env.OPENCLAW_GIT_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return resolveStateDir(process.env, os.homedir);
}

export function resolveNodeRunner(): string {
  const base = path.basename(process.execPath).toLowerCase();
  if (base === "node" || base === "node.exe") {
    return process.execPath;
  }
  return "node";
}

export async function runUpdateStep(params: {
  name: string;
  argv: string[];
  cwd?: string;
  timeoutMs: number;
  progress?: UpdateStepProgress;
  deps: {
    runCommandWithTimeout: RunCommandFn;
    trimLogTail: TrimLogTailFn;
  };
}): Promise<UpdateStepResult> {
  const command = params.argv.join(" ");
  params.progress?.onStepStart?.({
    name: params.name,
    command,
    index: 0,
    total: 0,
  });
  const started = Date.now();
  const res = await params.deps.runCommandWithTimeout(params.argv, {
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
  });
  const durationMs = Date.now() - started;
  const stderrTail = params.deps.trimLogTail(res.stderr, MAX_LOG_CHARS);
  params.progress?.onStepComplete?.({
    name: params.name,
    command,
    index: 0,
    total: 0,
    durationMs,
    exitCode: res.code,
    stderrTail,
  });
  return {
    name: params.name,
    command,
    cwd: params.cwd ?? process.cwd(),
    durationMs,
    exitCode: res.code,
    stdoutTail: params.deps.trimLogTail(res.stdout, MAX_LOG_CHARS),
    stderrTail,
  };
}

export async function ensureGitCheckout(params: {
  dir: string;
  timeoutMs: number;
  progress?: UpdateStepProgress;
  deps: {
    fsModule: typeof fs;
    pathExists: (p: string) => Promise<boolean>;
    runCommandWithTimeout: RunCommandFn;
    trimLogTail: TrimLogTailFn;
  };
}): Promise<UpdateStepResult | null> {
  const dirExists = await params.deps.pathExists(params.dir);
  if (!dirExists) {
    return await runUpdateStep({
      name: "git clone",
      argv: ["git", "clone", OPENCLAW_REPO_URL, params.dir],
      timeoutMs: params.timeoutMs,
      progress: params.progress,
      deps: params.deps,
    });
  }

  if (!(await isGitCheckout(params.dir, params.deps.fsModule))) {
    const empty = await isEmptyDir(params.dir, params.deps.fsModule);
    if (!empty) {
      throw new Error(
        `OPENCLAW_GIT_DIR points at a non-git directory: ${params.dir}. Set OPENCLAW_GIT_DIR to an empty folder or an openclaw checkout.`,
      );
    }
    return await runUpdateStep({
      name: "git clone",
      argv: ["git", "clone", OPENCLAW_REPO_URL, params.dir],
      cwd: params.dir,
      timeoutMs: params.timeoutMs,
      progress: params.progress,
      deps: params.deps,
    });
  }

  if (!(await isCorePackage(params.dir, params.deps.fsModule))) {
    throw new Error(`OPENCLAW_GIT_DIR does not look like a core checkout: ${params.dir}.`);
  }

  return null;
}

export async function resolveGlobalManager(params: {
  root: string;
  installKind: "git" | "package" | "unknown";
  timeoutMs: number;
  deps: {
    runCommandWithTimeout: RunCommandFn;
    detectGlobalInstallManagerForRoot: (
      runCommand: DetectRunCommandFn,
      root: string,
      timeoutMs: number,
    ) => Promise<GlobalInstallManager | null>;
    detectGlobalInstallManagerByPresence: (
      runCommand: DetectRunCommandFn,
      timeoutMs: number,
    ) => Promise<GlobalInstallManager | null>;
  };
}): Promise<GlobalInstallManager> {
  const runCommand = async (argv: string[], options: { timeoutMs: number }) => {
    const res = await params.deps.runCommandWithTimeout(argv, options);
    return { stdout: res.stdout, stderr: res.stderr, code: res.code };
  };
  if (params.installKind === "package") {
    const detected = await params.deps.detectGlobalInstallManagerForRoot(
      runCommand,
      params.root,
      params.timeoutMs,
    );
    if (detected) {
      return detected;
    }
  }
  const byPresence = await params.deps.detectGlobalInstallManagerByPresence(
    runCommand,
    params.timeoutMs,
  );
  return byPresence ?? "npm";
}

export function formatGitStatusLine(params: {
  branch: string | null;
  tag: string | null;
  sha: string | null;
}): string {
  const shortSha = params.sha ? params.sha.slice(0, 8) : null;
  const branch = params.branch && params.branch !== "HEAD" ? params.branch : null;
  const tag = params.tag;
  const parts = [
    branch ?? (tag ? "detached" : "git"),
    tag ? `tag ${tag}` : null,
    shortSha ? `@ ${shortSha}` : null,
  ].filter(Boolean);
  return parts.join(" \u00B7 ");
}

function getStepLabel(step: UpdateStepInfo): string {
  return STEP_LABELS[step.name] ?? step.name;
}

export type ProgressController = {
  progress: UpdateStepProgress;
  stop: () => void;
};

export function createUpdateProgress(
  enabled: boolean,
  deps: {
    spinner: typeof spinner;
    defaultRuntime: { log: (msg: string) => void };
    formatDurationPrecise: (ms: number) => string;
  },
): ProgressController {
  if (!enabled) {
    return {
      progress: {},
      stop: () => {},
    };
  }

  let currentSpinner: ReturnType<typeof spinner> | null = null;

  const progress: UpdateStepProgress = {
    onStepStart: (step) => {
      currentSpinner = deps.spinner();
      currentSpinner.start(theme.accent(getStepLabel(step)));
    },
    onStepComplete: (step) => {
      if (!currentSpinner) {
        return;
      }

      const label = getStepLabel(step);
      const duration = theme.muted(`(${deps.formatDurationPrecise(step.durationMs)})`);
      const icon = step.exitCode === 0 ? theme.success("\u2713") : theme.error("\u2717");

      currentSpinner.stop(`${icon} ${label} ${duration}`);
      currentSpinner = null;

      if (step.exitCode !== 0 && step.stderrTail) {
        const lines = step.stderrTail.split("\n").slice(-10);
        for (const line of lines) {
          if (line.trim()) {
            deps.defaultRuntime.log(`    ${theme.error(line)}`);
          }
        }
      }
    },
  };

  return {
    progress,
    stop: () => {
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }
    },
  };
}

function formatStepStatus(exitCode: number | null): string {
  if (exitCode === 0) {
    return theme.success("\u2713");
  }
  if (exitCode === null) {
    return theme.warn("?");
  }
  return theme.error("\u2717");
}

type PrintResultOptions = UpdateCommandOptions & {
  hideSteps?: boolean;
};

export function printResult(
  result: UpdateRunResult,
  opts: PrintResultOptions,
  deps: {
    defaultRuntime: { log: (msg: string) => void };
    formatDurationPrecise: (ms: number) => string;
  },
) {
  if (opts.json) {
    deps.defaultRuntime.log(JSON.stringify(result, null, 2));
    return;
  }

  const statusColor =
    result.status === "ok" ? theme.success : result.status === "skipped" ? theme.warn : theme.error;

  deps.defaultRuntime.log("");
  deps.defaultRuntime.log(
    `${theme.heading("Update Result:")} ${statusColor(result.status.toUpperCase())}`,
  );
  if (result.root) {
    deps.defaultRuntime.log(`  Root: ${theme.muted(result.root)}`);
  }
  if (result.reason) {
    deps.defaultRuntime.log(`  Reason: ${theme.muted(result.reason)}`);
  }

  if (result.before?.version || result.before?.sha) {
    const before = result.before.version ?? result.before.sha?.slice(0, 8) ?? "";
    deps.defaultRuntime.log(`  Before: ${theme.muted(before)}`);
  }
  if (result.after?.version || result.after?.sha) {
    const after = result.after.version ?? result.after.sha?.slice(0, 8) ?? "";
    deps.defaultRuntime.log(`  After: ${theme.muted(after)}`);
  }

  if (!opts.hideSteps && result.steps.length > 0) {
    deps.defaultRuntime.log("");
    deps.defaultRuntime.log(theme.heading("Steps:"));
    for (const step of result.steps) {
      const status = formatStepStatus(step.exitCode);
      const duration = theme.muted(`(${deps.formatDurationPrecise(step.durationMs)})`);
      deps.defaultRuntime.log(`  ${status} ${step.name} ${duration}`);

      if (step.exitCode !== 0 && step.stderrTail) {
        const lines = step.stderrTail.split("\n").slice(0, 5);
        for (const line of lines) {
          if (line.trim()) {
            deps.defaultRuntime.log(`      ${theme.error(line)}`);
          }
        }
      }
    }
  }

  deps.defaultRuntime.log("");
  deps.defaultRuntime.log(
    `Total time: ${theme.muted(deps.formatDurationPrecise(result.durationMs))}`,
  );
}
