import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { CONFIG_DIR, resolveUserPath } from "../../utils.js";
import { resolvePluginSkillDirs } from "./plugin-skills.js";

type SkillsChangeEvent = {
  workspaceDir?: string;
  reason: "watch" | "manual" | "remote-node";
  changedPath?: string;
};

type SkillsWatchState = {
  watcher: FSWatcher | null;
  pathsKey: string;
  debounceMs: number;
  timer?: ReturnType<typeof setTimeout>;
  pendingPath?: string;
  disabled?: boolean;
};

const log = createSubsystemLogger("gateway/skills");
const listeners = new Set<(event: SkillsChangeEvent) => void>();
const workspaceVersions = new Map<string, number>();
const watchers = new Map<string, SkillsWatchState>();
let globalVersion = 0;

export const DEFAULT_SKILLS_WATCH_IGNORED: RegExp[] = [
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  // Common non-skill artifacts that can be extremely large (and can exhaust inotify watchers on Linux).
  /(^|[\\/])venv([\\/]|$)/,
  /(^|[\\/])\.venv([\\/]|$)/,
  /(^|[\\/])__pycache__([\\/]|$)/,
];

function bumpVersion(current: number): number {
  const now = Date.now();
  return now <= current ? current + 1 : now;
}

function emit(event: SkillsChangeEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      log.warn(`skills change listener failed: ${String(err)}`);
    }
  }
}

function resolveWatchPaths(workspaceDir: string, config?: OpenClawConfig): string[] {
  const paths: string[] = [];
  if (workspaceDir.trim()) {
    paths.push(path.join(workspaceDir, "skills"));
  }
  paths.push(path.join(CONFIG_DIR, "skills"));
  const extraDirsRaw = config?.skills?.load?.extraDirs ?? [];
  const extraDirs = extraDirsRaw
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean)
    .map((dir) => resolveUserPath(dir));
  paths.push(...extraDirs);
  const pluginSkillDirs = resolvePluginSkillDirs({ workspaceDir, config });
  paths.push(...pluginSkillDirs);
  return paths;
}

export function registerSkillsChangeListener(listener: (event: SkillsChangeEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpSkillsSnapshotVersion(params?: {
  workspaceDir?: string;
  reason?: SkillsChangeEvent["reason"];
  changedPath?: string;
}): number {
  const reason = params?.reason ?? "manual";
  const changedPath = params?.changedPath;
  if (params?.workspaceDir) {
    const current = workspaceVersions.get(params.workspaceDir) ?? 0;
    const next = bumpVersion(current);
    workspaceVersions.set(params.workspaceDir, next);
    emit({ workspaceDir: params.workspaceDir, reason, changedPath });
    return next;
  }
  globalVersion = bumpVersion(globalVersion);
  emit({ reason, changedPath });
  return globalVersion;
}

export function getSkillsSnapshotVersion(workspaceDir?: string): number {
  if (!workspaceDir) {
    return globalVersion;
  }
  const local = workspaceVersions.get(workspaceDir) ?? 0;
  return Math.max(globalVersion, local);
}

export function ensureSkillsWatcher(params: { workspaceDir: string; config?: OpenClawConfig }) {
  const workspaceDir = params.workspaceDir.trim();
  if (!workspaceDir) {
    return;
  }
  const watchEnabled = params.config?.skills?.load?.watch !== false;
  const debounceMsRaw = params.config?.skills?.load?.watchDebounceMs;
  const debounceMs =
    typeof debounceMsRaw === "number" && Number.isFinite(debounceMsRaw)
      ? Math.max(0, debounceMsRaw)
      : 250;

  const existing = watchers.get(workspaceDir);
  if (!watchEnabled) {
    if (existing) {
      watchers.delete(workspaceDir);
      if (existing.timer) {
        clearTimeout(existing.timer);
      }
      if (existing.watcher) {
        void existing.watcher.close().catch(() => {});
      }
    }
    return;
  }

  const watchPaths = resolveWatchPaths(workspaceDir, params.config);
  const pathsKey = watchPaths.join("|");
  if (existing && existing.pathsKey === pathsKey && existing.debounceMs === debounceMs) {
    if (existing.disabled === true) {
      return;
    }
    if (existing.watcher) {
      return;
    }
  }
  if (existing) {
    watchers.delete(workspaceDir);
    if (existing.timer) {
      clearTimeout(existing.timer);
    }
    if (existing.watcher) {
      void existing.watcher.close().catch(() => {});
    }
  }

  const state: SkillsWatchState = { watcher: null, pathsKey, debounceMs };

  const schedule = (changedPath?: string) => {
    state.pendingPath = changedPath ?? state.pendingPath;
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      const pendingPath = state.pendingPath;
      state.pendingPath = undefined;
      state.timer = undefined;
      bumpSkillsSnapshotVersion({
        workspaceDir,
        reason: "watch",
        changedPath: pendingPath,
      });
    }, debounceMs);
  };

  const startWatcher = (mode: "native" | "polling"): FSWatcher => {
    const usePolling = mode === "polling";
    const watcher = new chokidar.FSWatcher({
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: debounceMs,
        pollInterval: 100,
      },
      // Avoid FD exhaustion on macOS when a workspace contains huge trees.
      // This watcher only needs to react to skill changes.
      ignored: DEFAULT_SKILLS_WATCH_IGNORED,
      usePolling,
      // Polling avoids inotify watcher limits (ENOSPC), but can be more CPU heavy.
      interval: usePolling ? Math.max(250, Math.min(2000, debounceMs)) : undefined,
    });

    watcher.on("add", (p) => schedule(p));
    watcher.on("change", (p) => schedule(p));
    watcher.on("unlink", (p) => schedule(p));

    let watcherClosed = false;
    watcher.on("error", (err) => {
      if (watcherClosed) {
        return;
      }
      const code = (err as NodeJS.ErrnoException)?.code;
      if (mode === "native" && code === "ENOSPC") {
        watcherClosed = true;
        log.warn(
          `skills watcher hit system limit (${code}) (${workspaceDir}); falling back to polling. ` +
            "Consider increasing inotify limits (Linux) for better performance.",
        );
        void watcher.close().catch(() => {});
        if (state.watcher === watcher && !state.disabled) {
          state.watcher = startWatcher("polling");
          state.watcher.add(watchPaths);
        }
        return;
      }
      if (code === "ENOSPC" || code === "EMFILE" || code === "ENFILE") {
        watcherClosed = true;
        log.warn(
          `skills watcher disabled (${code}) (${workspaceDir}). ` +
            "Consider increasing system limits or set skills.load.watch=false.",
        );
        void watcher.close().catch(() => {});
        if (state.watcher === watcher) {
          state.disabled = true;
          state.watcher = null;
        }
        return;
      }
      log.warn(`skills watcher error (${workspaceDir}): ${String(err)}`);
    });

    return watcher;
  };

  state.watcher = startWatcher("native");
  state.watcher.add(watchPaths);

  watchers.set(workspaceDir, state);
}
