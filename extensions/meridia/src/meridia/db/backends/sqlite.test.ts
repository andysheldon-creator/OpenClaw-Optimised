import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MeridiaExperienceRecord } from "../../types.js";
import { createBackend, closeBackend } from "./index.js";
import { createSqliteBackend, resolveMeridiaDbPath } from "./sqlite.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;

afterEach(() => {
  closeBackend();
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
});

describe("meridia sqlite backend", () => {
  it("runs migrations on fresh database", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-meridia-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const dbPath = resolveMeridiaDbPath({ cfg: {} });
    const backend = createSqliteBackend({ dbPath });
    await backend.init();
    const stats = await backend.getStats();
    await backend.close();

    // Schema version reflects latest migration
    expect(Number(stats.schemaVersion)).toBeGreaterThanOrEqual(1);
  });

  it("inserts and searches records", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-meridia-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const dbPath = resolveMeridiaDbPath({ cfg: {} });
    const backend = createSqliteBackend({ dbPath });
    await backend.init();

    const record: MeridiaExperienceRecord = {
      id: "rec-1",
      ts: new Date().toISOString(),
      kind: "manual",
      session: { key: "s1" },
      tool: { name: "experience_capture", callId: "t1", isError: false },
      capture: {
        score: 0.9,
        evaluation: { kind: "heuristic", score: 0.9, reason: "manual" },
      },
      content: { topic: "debugging breakthrough", tags: ["debugging"] },
      data: { args: { foo: "bar" } },
    };

    const inserted = await backend.insertExperienceRecord(record);
    expect(inserted).toBe(true);

    const results = await backend.searchRecords("breakthrough", { limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.record.id).toBe("rec-1");

    const stats = await backend.getStats();
    expect(stats.recordCount).toBe(1);
    expect(stats.sessionCount).toBe(1);
    expect(Number(stats.schemaVersion)).toBeGreaterThanOrEqual(1);

    const toolStats = await backend.getToolStats();
    expect(toolStats.length).toBeGreaterThan(0);
    expect(toolStats[0]?.toolName).toBe("experience_capture");

    await backend.close();
  });

  it("resolves default db path from config", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-meridia-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const dbPath = resolveMeridiaDbPath({ cfg: {} });
    expect(dbPath).toContain("meridia.sqlite");
    expect(dbPath).toContain(stateDir);
  });
});
