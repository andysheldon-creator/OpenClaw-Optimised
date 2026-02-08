import fs from "node:fs";
import path from "node:path";
import type { ControlPlaneState } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";

const STATE_FILENAME = "clawdbot-control-plane.json";
const STATE_VERSION = 1;

function defaultSyncHealth() {
  return {
    staleAfterSec: 300,
    unresolvedDriftCount: 0,
    unresolvedCriticalDriftCount: 0,
    stale: false,
  };
}

export function resolveControlPlaneStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env);
  return path.join(stateDir, STATE_FILENAME);
}

export function createDefaultControlPlaneState(): ControlPlaneState {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    capabilityMatrix: [],
    skills: {},
    workflows: {},
    bindings: [],
    runs: [],
    approvals: [],
    ledger: [],
    drift: [],
    syncHealth: defaultSyncHealth(),
    audit: [],
  };
}

function normalizeState(raw: unknown): ControlPlaneState {
  if (!raw || typeof raw !== "object") {
    return createDefaultControlPlaneState();
  }
  const parsed = raw as Partial<ControlPlaneState>;
  const normalized = createDefaultControlPlaneState();

  if (parsed.version === STATE_VERSION) {
    normalized.version = parsed.version;
  }
  normalized.updatedAt =
    typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0
      ? parsed.updatedAt
      : new Date().toISOString();
  normalized.capabilityMatrix = Array.isArray(parsed.capabilityMatrix)
    ? parsed.capabilityMatrix
    : [];
  normalized.skills = parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {};
  normalized.workflows =
    parsed.workflows && typeof parsed.workflows === "object" ? parsed.workflows : {};
  normalized.bindings = Array.isArray(parsed.bindings) ? parsed.bindings : [];
  normalized.runs = Array.isArray(parsed.runs) ? parsed.runs : [];
  normalized.approvals = Array.isArray(parsed.approvals) ? parsed.approvals : [];
  normalized.ledger = Array.isArray(parsed.ledger) ? parsed.ledger : [];
  normalized.drift = Array.isArray(parsed.drift) ? parsed.drift : [];
  normalized.audit = Array.isArray(parsed.audit) ? parsed.audit : [];
  normalized.syncHealth = {
    ...defaultSyncHealth(),
    ...(parsed.syncHealth && typeof parsed.syncHealth === "object" ? parsed.syncHealth : {}),
  };

  return normalized;
}

export function loadControlPlaneState(env: NodeJS.ProcessEnv = process.env): ControlPlaneState {
  const statePath = resolveControlPlaneStatePath(env);
  try {
    if (!fs.existsSync(statePath)) {
      return createDefaultControlPlaneState();
    }
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeState(parsed);
  } catch {
    return createDefaultControlPlaneState();
  }
}

export function saveControlPlaneState(
  state: ControlPlaneState,
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneState {
  const statePath = resolveControlPlaneStatePath(env);
  const next: ControlPlaneState = {
    ...state,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function updateControlPlaneState(
  updater: (current: ControlPlaneState) => ControlPlaneState,
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneState {
  const current = loadControlPlaneState(env);
  const next = updater(current);
  return saveControlPlaneState(next, env);
}
