/**
 * Skill Signature Verification — Hash-Based Integrity (FB-011)
 *
 * Provides hash-based integrity verification for skills loaded from
 * the filesystem. Skills are Markdown documentation files (SKILL.md)
 * that get injected into the LLM context — tampered skills could
 * inject malicious instructions.
 *
 * Architecture:
 * - On first load, compute SHA-256 hash of each SKILL.md
 * - Store hash manifest in ~/.clawdis/skills/skill-hashes.json
 * - On subsequent loads, verify hashes match the manifest
 * - Flag/warn on hash mismatches or unknown skills
 * - Separate trust tiers: bundled > managed > workspace > extra
 *
 * This is NOT a cryptographic signature scheme (no PKI). It's a
 * tamper-detection system that catches unauthorized modifications
 * between agent restarts.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CONFIG_DIR } from "../utils.js";
import { defaultRuntime } from "../runtime.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillSource =
  | "clawdis-bundled"
  | "clawdis-managed"
  | "clawdis-workspace"
  | "clawdis-extra"
  | string;

export type SkillHashEntry = {
  /** Skill name (directory name). */
  name: string;
  /** SHA-256 hash of the SKILL.md file contents. */
  hash: string;
  /** Source category (bundled, managed, workspace, extra). */
  source: SkillSource;
  /** File path to the SKILL.md. */
  filePath: string;
  /** Timestamp when hash was first recorded. */
  recordedAt: number;
  /** File size in bytes at time of hashing. */
  sizeBytes: number;
};

export type SkillHashManifest = {
  version: 1;
  generatedAt: number;
  entries: Record<string, SkillHashEntry>;
};

export type SkillVerifyResult = {
  name: string;
  source: SkillSource;
  filePath: string;
  status: "verified" | "new" | "modified" | "missing" | "error";
  /** If modified, the expected vs actual hash. */
  expectedHash?: string;
  actualHash?: string;
};

export type SkillIntegrityReport = {
  totalSkills: number;
  verified: number;
  newSkills: number;
  modified: number;
  missing: number;
  errors: number;
  results: SkillVerifyResult[];
  /** Overall pass = no modifications detected. */
  passed: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MANIFEST_DIR = path.join(CONFIG_DIR, "skills");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "skill-hashes.json");

/**
 * Trust tiers by source.
 * Higher tier = more trusted = modifications are more alarming.
 */
export const SOURCE_TRUST_TIER: Record<string, number> = {
  "clawdis-bundled": 3, // Shipped with the repo — should never change
  "clawdis-managed": 2, // Installed via package manager
  "clawdis-workspace": 1, // Project-local skills — expected to change
  "clawdis-extra": 0, // External directories — least trusted
};

// ─── Hash Computation ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a file's contents.
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Compute SHA-256 hash of a string.
 */
export function hashString(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

// ─── Manifest Persistence ─────────────────────────────────────────────────────

/**
 * Load the hash manifest from disk.
 * Returns null if no manifest exists yet.
 */
export function loadManifest(): SkillHashManifest | null {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) return null;
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SkillHashManifest;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch (err) {
    defaultRuntime.log?.(
      `[skill-integrity] failed to load manifest: ${String(err)}`,
    );
    return null;
  }
}

/**
 * Save the hash manifest to disk.
 */
export function saveManifest(manifest: SkillHashManifest): void {
  try {
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    fs.writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  } catch (err) {
    defaultRuntime.log?.(
      `[skill-integrity] failed to save manifest: ${String(err)}`,
    );
  }
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify a single skill against the manifest.
 */
export function verifySkill(
  name: string,
  filePath: string,
  source: SkillSource,
  manifest: SkillHashManifest | null,
): SkillVerifyResult {
  const base: Omit<SkillVerifyResult, "status"> = { name, source, filePath };

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return { ...base, status: "missing" };
  }

  // Compute current hash
  let actualHash: string;
  try {
    actualHash = hashFile(filePath);
  } catch (err) {
    defaultRuntime.log?.(
      `[skill-integrity] error hashing ${name}: ${String(err)}`,
    );
    return { ...base, status: "error" };
  }

  // No manifest = first run, all skills are "new"
  if (!manifest) {
    return { ...base, status: "new", actualHash };
  }

  const entry = manifest.entries[name];

  // Skill not in manifest = new skill added since last run
  if (!entry) {
    return { ...base, status: "new", actualHash };
  }

  // Compare hashes
  if (entry.hash === actualHash) {
    return { ...base, status: "verified" };
  }

  // Hash mismatch = skill was modified
  return {
    ...base,
    status: "modified",
    expectedHash: entry.hash,
    actualHash,
  };
}

/**
 * Verify all skills and generate an integrity report.
 *
 * @param skills - Array of { name, filePath, source } for all loaded skills
 * @param options.autoAcceptNew - If true, new skills are added to manifest (default: true)
 * @param options.autoAcceptWorkspace - If true, workspace skill changes are accepted (default: true)
 */
export function verifyAllSkills(
  skills: Array<{ name: string; filePath: string; source: SkillSource }>,
  options?: {
    autoAcceptNew?: boolean;
    autoAcceptWorkspace?: boolean;
  },
): SkillIntegrityReport {
  const autoAcceptNew = options?.autoAcceptNew ?? true;
  const autoAcceptWorkspace = options?.autoAcceptWorkspace ?? true;

  const manifest = loadManifest();
  const results: SkillVerifyResult[] = [];
  let modified = 0;
  let verified = 0;
  let newSkills = 0;
  let missing = 0;
  let errors = 0;

  // Verify each loaded skill
  for (const skill of skills) {
    const result = verifySkill(skill.name, skill.filePath, skill.source, manifest);
    results.push(result);

    switch (result.status) {
      case "verified":
        verified++;
        break;
      case "new":
        newSkills++;
        break;
      case "modified":
        // Workspace skills are expected to change during development
        if (autoAcceptWorkspace && skill.source === "clawdis-workspace") {
          defaultRuntime.log?.(
            `[skill-integrity] workspace skill ${skill.name} changed (accepted)`,
          );
        } else {
          const tier = SOURCE_TRUST_TIER[skill.source] ?? 0;
          const severity = tier >= 2 ? "CRITICAL" : "WARNING";
          defaultRuntime.log?.(
            `[skill-integrity] ${severity}: skill ${skill.name} (${skill.source}) ` +
              `has been modified! Expected=${result.expectedHash?.slice(0, 16)}… ` +
              `Actual=${result.actualHash?.slice(0, 16)}…`,
          );
        }
        modified++;
        break;
      case "missing":
        missing++;
        defaultRuntime.log?.(
          `[skill-integrity] skill ${skill.name} file missing: ${skill.filePath}`,
        );
        break;
      case "error":
        errors++;
        break;
    }
  }

  // Check for skills in manifest that are no longer loaded (removed skills)
  if (manifest) {
    for (const [name, entry] of Object.entries(manifest.entries)) {
      if (!skills.find((s) => s.name === name)) {
        results.push({
          name,
          source: entry.source,
          filePath: entry.filePath,
          status: "missing",
        });
        missing++;
        defaultRuntime.log?.(
          `[skill-integrity] previously known skill ${name} no longer present`,
        );
      }
    }
  }

  // Update manifest with new/changed skills
  const updatedManifest: SkillHashManifest = {
    version: 1,
    generatedAt: Date.now(),
    entries: manifest?.entries ? { ...manifest.entries } : {},
  };

  for (const result of results) {
    if (result.status === "new" && autoAcceptNew && result.actualHash) {
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(result.filePath).size;
      } catch { /* ignore */ }

      updatedManifest.entries[result.name] = {
        name: result.name,
        hash: result.actualHash,
        source: result.source,
        filePath: result.filePath,
        recordedAt: Date.now(),
        sizeBytes,
      };
    }

    if (
      result.status === "modified" &&
      autoAcceptWorkspace &&
      result.source === "clawdis-workspace" &&
      result.actualHash
    ) {
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(result.filePath).size;
      } catch { /* ignore */ }

      updatedManifest.entries[result.name] = {
        ...updatedManifest.entries[result.name],
        hash: result.actualHash,
        recordedAt: Date.now(),
        sizeBytes,
      };
    }

    // Remove missing skills from manifest
    if (result.status === "missing") {
      delete updatedManifest.entries[result.name];
    }
  }

  saveManifest(updatedManifest);

  // A modification to bundled or managed skills fails the integrity check
  const hasHighTrustModification = results.some(
    (r) =>
      r.status === "modified" &&
      (r.source === "clawdis-bundled" || r.source === "clawdis-managed"),
  );

  return {
    totalSkills: skills.length,
    verified,
    newSkills,
    modified,
    missing,
    errors,
    results,
    passed: !hasHighTrustModification && errors === 0,
  };
}

/**
 * Quick check: verify skills and log results.
 * Intended to be called during startup.
 */
export function checkSkillIntegrity(
  skills: Array<{ name: string; filePath: string; source: SkillSource }>,
): boolean {
  if (skills.length === 0) return true;

  const report = verifyAllSkills(skills);

  defaultRuntime.log?.(
    `[skill-integrity] checked ${report.totalSkills} skills: ` +
      `${report.verified} verified, ${report.newSkills} new, ` +
      `${report.modified} modified, ${report.missing} missing, ` +
      `${report.errors} errors — ${report.passed ? "PASSED" : "FAILED"}`,
  );

  return report.passed;
}

/**
 * Force regenerate the entire manifest from current skill files.
 * Use this after intentionally updating bundled skills.
 */
export function regenerateManifest(
  skills: Array<{ name: string; filePath: string; source: SkillSource }>,
): SkillHashManifest {
  const entries: Record<string, SkillHashEntry> = {};

  for (const skill of skills) {
    if (!fs.existsSync(skill.filePath)) continue;

    try {
      const hash = hashFile(skill.filePath);
      const sizeBytes = fs.statSync(skill.filePath).size;

      entries[skill.name] = {
        name: skill.name,
        hash,
        source: skill.source,
        filePath: skill.filePath,
        recordedAt: Date.now(),
        sizeBytes,
      };
    } catch {
      // Skip unhashable files
    }
  }

  const manifest: SkillHashManifest = {
    version: 1,
    generatedAt: Date.now(),
    entries,
  };

  saveManifest(manifest);

  defaultRuntime.log?.(
    `[skill-integrity] regenerated manifest with ${Object.keys(entries).length} skills`,
  );

  return manifest;
}
