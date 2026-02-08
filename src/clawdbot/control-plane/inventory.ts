import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillStatusEntry } from "../../agents/skills-status.js";
import type {
  CapabilityStatus,
  DriftItem,
  SkillCapability,
  SkillInventoryItem,
  WorkflowInventoryItem,
} from "./types.js";
import { resolveDefaultAgentId, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { buildWorkspaceSkillStatus } from "../../agents/skills-status.js";
import { loadConfig } from "../../config/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function resolveRepoRoot(): string {
  const candidates = [
    path.resolve(here, "../../.."),
    path.resolve(here, "../../../.."),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return path.resolve(here, "../../..");
}

const repoRoot = resolveRepoRoot();
const defaultCapabilityMatrixPath = path.join(repoRoot, "skills", "capability-matrix.json");

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).toSorted());
}

function mapCapability(entry: SkillStatusEntry): { status: CapabilityStatus; reason: string } {
  if (entry.disabled) {
    return { status: "blocked", reason: "Skill is disabled in config." };
  }
  if (entry.blockedByAllowlist) {
    return { status: "blocked", reason: "Skill is blocked by bundled allowlist." };
  }
  const missingTotal =
    entry.missing.bins.length +
    entry.missing.anyBins.length +
    entry.missing.env.length +
    entry.missing.config.length +
    entry.missing.os.length;
  if (missingTotal === 0 && entry.eligible) {
    return { status: "live-ready", reason: "All runtime prerequisites satisfied." };
  }
  if (entry.always) {
    return { status: "partial", reason: "Marked always-run; runtime checks bypassed." };
  }
  if (missingTotal > 0) {
    return { status: "blocked", reason: "Missing runtime prerequisites." };
  }
  return { status: "partial", reason: "Skill requires operator review before live execution." };
}

export function readCapabilityMatrixFile(
  filePath = defaultCapabilityMatrixPath,
): SkillCapability[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SkillCapability[]) : [];
  } catch {
    return [];
  }
}

export function writeCapabilityMatrixFile(
  matrix: SkillCapability[],
  filePath = defaultCapabilityMatrixPath,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
}

export function buildSkillInventory(params?: {
  existing?: Record<string, Partial<SkillInventoryItem>>;
}): {
  inventory: SkillInventoryItem[];
  capabilityMatrix: SkillCapability[];
  generatedAt: string;
} {
  const cfg = loadConfig();
  const agentId = resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  const now = new Date().toISOString();

  const matrixFromFile = readCapabilityMatrixFile();
  const matrixByName = new Map(matrixFromFile.map((entry) => [entry.skillName, entry]));

  const inventory: SkillInventoryItem[] = report.skills.map((entry) => {
    const mapped = mapCapability(entry);
    const external = matrixByName.get(entry.name);
    const selectedStatus = external?.status ?? mapped.status;
    const selectedReason = external?.reason ?? mapped.reason;
    const existing = params?.existing?.[entry.name] ?? {};

    const existingVersion = typeof existing.version === "string" ? existing.version : "0.0.0";

    return {
      id: entry.name,
      name: entry.name,
      version: existingVersion,
      description: entry.description,
      lifecycle:
        (existing as { lifecycle?: SkillInventoryItem["lifecycle"] }).lifecycle ??
        (entry.disabled ? "disabled" : "active"),
      capability: selectedStatus,
      liveReady: selectedStatus === "live-ready",
      readinessBlockers: [
        ...entry.missing.bins.map((item) => `missing bin: ${item}`),
        ...entry.missing.anyBins.map((item) => `missing any bin: ${item}`),
        ...entry.missing.env.map((item) => `missing env: ${item}`),
        ...entry.missing.config.map((item) => `missing config: ${item}`),
        ...entry.missing.os.map((item) => `unsupported os: ${item}`),
        ...(selectedStatus !== "live-ready" ? [selectedReason] : []),
      ],
      requiredTools: [...entry.requirements.bins, ...entry.requirements.anyBins],
      requiredEnv: [...entry.requirements.env],
      requiredConfig: [...entry.requirements.config],
      missing: {
        bins: [...entry.missing.bins, ...entry.missing.anyBins],
        env: [...entry.missing.env],
        config: [...entry.missing.config],
        os: [...entry.missing.os],
      },
      source: entry.source,
      owners: (existing as { owners?: string[] }).owners ?? [],
      pinnedVersion: (existing as { pinnedVersion?: string }).pinnedVersion,
      lastOperationAt: (existing as { lastOperationAt?: string }).lastOperationAt,
      lastOperationBy: (existing as { lastOperationBy?: string }).lastOperationBy,
    };
  });

  const generatedCapabilityMatrix: SkillCapability[] = inventory.map((skill) => ({
    skillName: skill.name,
    status: skill.capability,
    reason:
      skill.readinessBlockers[0] ??
      (skill.capability === "live-ready"
        ? "All runtime prerequisites satisfied."
        : "Requires operator review."),
    source: skill.source,
    requiredTools: skill.requiredTools,
    requiredEnv: skill.requiredEnv,
    blockers: skill.readinessBlockers,
    updatedAt: now,
  }));

  return {
    inventory: inventory.toSorted((a, b) => a.name.localeCompare(b.name)),
    capabilityMatrix: generatedCapabilityMatrix,
    generatedAt: now,
  };
}

type N8nWorkflowListResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    active?: boolean;
    updatedAt?: string;
    createdAt?: string;
    tags?: Array<{ name?: string }>;
    versionId?: string;
  }>;
};

function normalizeWorkflowVersion(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "1";
}

async function fetchN8nWorkflowsFromApi(): Promise<WorkflowInventoryItem[]> {
  const baseUrl = process.env.OPENCLAW_N8N_BASE_URL?.trim();
  if (!baseUrl) {
    return [];
  }
  const token = process.env.OPENCLAW_N8N_API_KEY?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers["X-N8N-API-KEY"] = token;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/workflows`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`n8n inventory sync failed (${response.status})`);
  }
  const body = (await response.json()) as N8nWorkflowListResponse;
  const rows = body.data ?? [];
  return rows.map((row) => {
    const id = row.id?.trim() ?? `n8n-${crypto.randomUUID()}`;
    const name = row.name?.trim() ?? id;
    const updatedAt = row.updatedAt ?? row.createdAt ?? new Date().toISOString();
    const version = normalizeWorkflowVersion(row.versionId);
    const tags = (row.tags ?? []).map((item) => item.name?.trim() ?? "").filter(Boolean);
    const category = tags[0] ?? "automation";
    const lifecycle: WorkflowInventoryItem["lifecycle"] = row.active ? "active" : "paused";
    const hash = sha256(stableJson({ id, name, lifecycle, version, category, tags }));
    return {
      id: `workflow-${id}`,
      externalId: id,
      name,
      version,
      lifecycle,
      source: "n8n",
      category,
      mappedSkills: [],
      deployCount: 0,
      isHealthy: true,
      lastSyncAt: updatedAt,
      hash,
      description: `Synced from n8n (${id})`,
    } satisfies WorkflowInventoryItem;
  });
}

function walkTemplateFiles(dir: string): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walkTemplateFiles(full));
      continue;
    }
    if (name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function loadWorkflowTemplatesFromRepo(): WorkflowInventoryItem[] {
  const templatesDir = path.join(repoRoot, "workflows", "templates");
  const files = walkTemplateFiles(templatesDir);
  const rows: WorkflowInventoryItem[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const json = JSON.parse(raw) as Record<string, unknown>;
      const relative = path.relative(templatesDir, file);
      const idBase = relative.replace(/\.json$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
      const name = (typeof json.name === "string" ? json.name : idBase).trim();
      const category = relative.split(path.sep)[0] ?? "automation";
      const mappedSkills = collectMappedSkills(json);
      const version = normalizeWorkflowVersion(
        typeof json.version === "string" ? json.version : undefined,
      );
      const hash = sha256(stableJson(json));
      rows.push({
        id: `template-${idBase}`,
        name,
        version,
        lifecycle: "deployed",
        source: "template",
        category,
        mappedSkills,
        deployCount: 0,
        isHealthy: true,
        hash,
        description: typeof json.description === "string" ? json.description : relative,
      });
    } catch {
      continue;
    }
  }

  return rows;
}

function collectMappedSkills(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const json = input as { nodes?: Array<Record<string, unknown>> };
  const skills = new Set<string>();
  for (const node of json.nodes ?? []) {
    const parameters =
      node.parameters && typeof node.parameters === "object"
        ? (node.parameters as Record<string, unknown>)
        : null;
    const skillName =
      parameters && typeof parameters.skillName === "string" ? parameters.skillName : null;
    if (skillName && skillName.trim()) {
      skills.add(skillName.trim());
    }
  }
  return [...skills].toSorted();
}

export async function buildWorkflowInventory(params?: {
  existing?: Record<string, Partial<WorkflowInventoryItem>>;
}): Promise<{ inventory: WorkflowInventoryItem[]; generatedAt: string }> {
  const now = new Date().toISOString();
  const templateItems = loadWorkflowTemplatesFromRepo();
  let n8nItems: WorkflowInventoryItem[] = [];
  try {
    n8nItems = await fetchN8nWorkflowsFromApi();
  } catch {
    n8nItems = [];
  }

  const merged = new Map<string, WorkflowInventoryItem>();
  for (const row of [...templateItems, ...n8nItems]) {
    const existing = params?.existing?.[row.id] ?? {};
    merged.set(row.id, {
      ...row,
      lifecycle:
        (existing as { lifecycle?: WorkflowInventoryItem["lifecycle"] }).lifecycle ?? row.lifecycle,
      previousVersion: (existing as { previousVersion?: string }).previousVersion,
      deployCount: (existing as { deployCount?: number }).deployCount ?? row.deployCount,
      lastSyncAt: now,
    });
  }

  return {
    inventory: [...merged.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
    generatedAt: now,
  };
}

export function computeInventoryDrift(params: {
  skills: SkillInventoryItem[];
  workflows: WorkflowInventoryItem[];
  storedSkills: Record<string, Partial<SkillInventoryItem>>;
  storedWorkflows: Record<string, Partial<WorkflowInventoryItem>>;
}): DriftItem[] {
  const drift: DriftItem[] = [];
  const now = new Date().toISOString();

  for (const skill of params.skills) {
    const expectedHash = sha256(
      stableJson({
        lifecycle: skill.lifecycle,
        capability: skill.capability,
        pinnedVersion: skill.pinnedVersion,
      }),
    );
    const stored = params.storedSkills[skill.id];
    const observedHash = sha256(stableJson(stored ?? {}));
    if (expectedHash !== observedHash) {
      drift.push({
        id: `drift-skill-${skill.id}`,
        entity: "skill",
        entityId: skill.id,
        expectedHash,
        observedHash,
        severity: skill.capability === "blocked" ? "high" : "medium",
        summary: `Skill metadata drift detected for ${skill.name}.`,
        detectedAt: now,
      });
    }
  }

  for (const workflow of params.workflows) {
    const expectedHash = sha256(
      stableJson({
        lifecycle: workflow.lifecycle,
        version: workflow.version,
        hash: workflow.hash,
      }),
    );
    const stored = params.storedWorkflows[workflow.id];
    const observedHash = sha256(stableJson(stored ?? {}));
    if (expectedHash !== observedHash) {
      drift.push({
        id: `drift-workflow-${workflow.id}`,
        entity: "workflow",
        entityId: workflow.id,
        expectedHash,
        observedHash,
        severity: workflow.source === "n8n" ? "high" : "low",
        summary: `Workflow metadata drift detected for ${workflow.name}.`,
        detectedAt: now,
      });
    }
  }

  return drift;
}

export function evaluateSyncHealth(params: {
  staleAfterSec: number;
  lastSkillSyncAt?: string;
  lastWorkflowSyncAt?: string;
  drift: DriftItem[];
}) {
  const nowMs = Date.now();
  const newest = [params.lastSkillSyncAt, params.lastWorkflowSyncAt]
    .filter((item): item is string => Boolean(item))
    .map((item) => Date.parse(item))
    .filter((value) => Number.isFinite(value))
    .toSorted((a, b) => b - a)[0];
  const stale = typeof newest === "number" ? nowMs - newest > params.staleAfterSec * 1_000 : true;
  return {
    lastSkillSyncAt: params.lastSkillSyncAt,
    lastWorkflowSyncAt: params.lastWorkflowSyncAt,
    lastDriftCheckAt: new Date().toISOString(),
    staleAfterSec: params.staleAfterSec,
    unresolvedDriftCount: params.drift.length,
    unresolvedCriticalDriftCount: params.drift.filter((item) => item.severity === "critical")
      .length,
    stale,
  };
}
