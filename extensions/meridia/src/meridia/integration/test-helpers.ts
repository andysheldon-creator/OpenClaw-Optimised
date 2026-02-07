// Shared helpers for meridia integration tests.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MeridiaExperienceRecord, Phenomenology } from "../types.js";
import { createSqliteBackend, type SqliteBackend } from "../db/backends/sqlite.js";
import { redactValue } from "../sanitize.js";

export type IntegrationBackend = {
  backend: SqliteBackend;
  tmpDir: string;
  dbPath: string;
  cleanup: () => Promise<void>;
};

/** Create a real SqliteBackend in a temp directory, fully initialized. */
export async function setupIntegrationBackend(): Promise<IntegrationBackend> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "meridia-integ-"));
  const dbPath = path.join(tmpDir, "meridia.sqlite");
  const backend = createSqliteBackend({ dbPath });
  await backend.init();

  return {
    backend,
    tmpDir,
    dbPath,
    cleanup: async () => {
      await backend.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** Build a MeridiaExperienceRecord with sensible defaults. */
export function makeRecord(
  overrides: Partial<MeridiaExperienceRecord> = {},
): MeridiaExperienceRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    ts: overrides.ts ?? new Date().toISOString(),
    kind: overrides.kind ?? "tool_result",
    session: overrides.session ?? { key: "test-session", id: "sid-1", runId: "run-1" },
    tool: overrides.tool ?? {
      name: "exec",
      callId: `call-${crypto.randomUUID().slice(0, 8)}`,
      isError: false,
    },
    capture: overrides.capture ?? {
      score: 0.75,
      evaluation: { kind: "heuristic", score: 0.75, reason: "shell_exec" },
    },
    content: overrides.content,
    phenomenology: overrides.phenomenology,
    data: overrides.data,
  };
}

/** Build a full phenomenology object for testing. */
export function makePhenomenology(overrides: Partial<Phenomenology> = {}): Phenomenology {
  return {
    emotionalSignature: overrides.emotionalSignature ?? {
      primary: ["focused", "engaged"],
      intensity: 0.7,
      valence: 0.3,
      texture: "flowing",
    },
    engagementQuality: overrides.engagementQuality ?? "engaged",
    anchors: overrides.anchors ?? [
      { phrase: "breakthrough moment", significance: "key insight", sensoryChannel: "conceptual" },
    ],
    uncertainties: overrides.uncertainties ?? ["approach might not scale"],
    reconstitutionHints: overrides.reconstitutionHints ?? ["recall the architecture discussion"],
  };
}

/**
 * Sanitize a record's data fields (as the capture handler does)
 * then return it ready for insertion.
 */
export function sanitizeRecord(record: MeridiaExperienceRecord): MeridiaExperienceRecord {
  if (!record.data) {
    return record;
  }
  const sanitized = redactValue(record.data) as typeof record.data;
  return { ...record, data: sanitized };
}

/** Insert multiple records with sanitization applied. */
export async function seedSanitizedRecords(
  backend: SqliteBackend,
  records: MeridiaExperienceRecord[],
): Promise<number> {
  const sanitized = records.map(sanitizeRecord);
  return backend.insertExperienceRecordsBatch(sanitized);
}
