import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MeridiaExperienceRecord } from "../meridia/types.js";
import { closeBackend, createBackend } from "../meridia/db/index.js";
import { createExperienceReflectTool } from "./experience-reflect-tool.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;

afterEach(() => {
  closeBackend();
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
});

function withTempStateDir(): string {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-meridia-"));
  process.env.OPENCLAW_STATE_DIR = stateDir;
  return stateDir;
}

async function seedRecords(records: MeridiaExperienceRecord[]): Promise<void> {
  const backend = createBackend({ cfg: {} });
  const inserted = await backend.insertExperienceRecordsBatch(records);
  if (inserted !== records.length) {
    throw new Error("Failed to seed Meridia records for tests.");
  }
}

describe("meridia experience_reflect tool", () => {
  it("returns patterns and prompts for recent scope", async () => {
    withTempStateDir();
    const now = new Date();
    const records: MeridiaExperienceRecord[] = [
      {
        id: "rec-1",
        ts: new Date(now.getTime() - 60_000).toISOString(),
        kind: "tool_result",
        session: { key: "s1" },
        tool: { name: "experience_capture", callId: "t1", isError: true },
        capture: {
          score: 0.92,
          evaluation: { kind: "heuristic", score: 0.92, reason: "critical error" },
        },
        content: { topic: "debugging", tags: ["errors"] },
        data: { args: { action: "foo" } },
      },
      {
        id: "rec-2",
        ts: new Date(now.getTime() - 120_000).toISOString(),
        kind: "tool_result",
        session: { key: "s1" },
        tool: { name: "search", callId: "t2", isError: false },
        capture: {
          score: 0.65,
          evaluation: { kind: "heuristic", score: 0.65, reason: "useful find" },
        },
        content: { topic: "debugging breakthrough", summary: "fixed issue" },
        data: { result: { ok: true } },
      },
      {
        id: "rec-3",
        ts: new Date(now.getTime() - 180_000).toISOString(),
        kind: "tool_result",
        session: { key: "s2" },
        tool: { name: "experience_capture", callId: "t3", isError: true },
        capture: {
          score: 0.55,
          evaluation: { kind: "heuristic", score: 0.55, reason: "warning" },
        },
        content: { topic: "errors", anchors: ["recovery"] },
        data: { args: { action: "bar" } },
      },
    ];

    await seedRecords(records);

    const tool = createExperienceReflectTool({ config: {} });
    const res = await tool.execute("call-1", { scope: "recent", limit: 10 });
    const details = res.details as {
      reflection?: { recordCount: number; patterns: string[]; reflectionPrompts: string[] };
    };

    expect(details.reflection?.recordCount).toBe(3);
    expect(details.reflection?.patterns.join(" ")).toMatch(/High error rate/);
    expect(details.reflection?.reflectionPrompts.length).toBeGreaterThan(2);
  });

  it("uses focus search to narrow results", async () => {
    withTempStateDir();
    const now = new Date();
    const records: MeridiaExperienceRecord[] = [
      {
        id: "rec-1",
        ts: new Date(now.getTime() - 60_000).toISOString(),
        kind: "tool_result",
        session: { key: "s1" },
        tool: { name: "search", callId: "t1", isError: false },
        capture: {
          score: 0.9,
          evaluation: { kind: "heuristic", score: 0.9, reason: "debugging breakthrough" },
        },
        content: { topic: "debugging breakthrough", tags: ["debugging"] },
        data: { args: { action: "foo" } },
      },
      {
        id: "rec-2",
        ts: new Date(now.getTime() - 120_000).toISOString(),
        kind: "tool_result",
        session: { key: "s1" },
        tool: { name: "search", callId: "t2", isError: false },
        capture: {
          score: 0.6,
          evaluation: { kind: "heuristic", score: 0.6, reason: "routine" },
        },
        content: { topic: "other topic" },
        data: { args: { action: "bar" } },
      },
    ];

    await seedRecords(records);

    const tool = createExperienceReflectTool({ config: {} });
    const res = await tool.execute("call-2", { scope: "recent", focus: "debugging", limit: 10 });
    const details = res.details as {
      reflection?: { recordCount: number };
      focus?: string | null;
    };

    expect(details.focus).toBe("debugging");
    expect(details.reflection?.recordCount).toBe(1);
  });
});
