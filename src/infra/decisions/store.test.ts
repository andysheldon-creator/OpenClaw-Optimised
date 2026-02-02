import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupExpiredDecisions,
  createDecision,
  getDecision,
  listDecisions,
  respondToDecision,
  updateDecisionSlackInfo,
} from "./store.js";

function readStoreFile(stateDir: string): any {
  const p = path.join(stateDir, "decisions", "store.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("decisions store", () => {
  let prevStateDir: string | undefined;
  let stateDir: string;

  let uuidSpy: ReturnType<typeof vi.spyOn<typeof crypto, "randomUUID">>;

  beforeEach(() => {
    prevStateDir = process.env.OPENCLAW_STATE_DIR;
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-state-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    uuidSpy = vi.spyOn(crypto, "randomUUID");
    uuidSpy.mockReturnValue("00000000-0000-0000-0000-000000000001");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    if (prevStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = prevStateDir;
    }

    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it("creates a text decision without options and persists it", () => {
    const decision = createDecision({
      type: "text",
      title: "Need input",
      question: "What should we do?",
      context: { agentId: "agent1", sessionKey: "s1" },
      timeoutMinutes: 10,
    });

    expect(decision.decisionId).toBe("D_00000000");
    expect(decision.type).toBe("text");
    expect(decision.options).toBeUndefined();
    expect(decision.status).toBe("pending");
    expect(decision.expiresAt).toBe(Date.now() + 10 * 60 * 1000);

    const store = readStoreFile(stateDir);
    expect(store.version).toBe(1);
    expect(store.updatedAt).toBeTypeOf("number");
    expect(store.decisions[decision.decisionId].title).toBe("Need input");
  });

  it("creates binary + confirmation decisions with built-in options", () => {
    const d1 = createDecision({
      type: "binary",
      title: "Approve?",
      question: "Approve deployment?",
    });
    expect(d1.options?.map((o) => o.id)).toEqual(["approve", "reject"]);

    // second ID
    uuidSpy.mockReturnValueOnce("11111111-0000-0000-0000-000000000001");
    const d2 = createDecision({
      type: "confirmation",
      title: "Proceed?",
      question: "Proceed with action?",
    });
    expect(d2.options?.map((o) => o.id)).toEqual(["proceed", "cancel"]);
  });

  it("creates choice decisions from provided options and throws if options are missing", () => {
    expect(() =>
      createDecision({
        type: "choice",
        title: "Pick one",
        question: "Pick an option",
      }),
    ).toThrow(/requires at least one option/i);

    const d = createDecision({
      type: "choice",
      title: "Pick one",
      question: "Pick an option",
      options: [{ label: "A", value: "a", style: "primary" }, { label: "B" }],
    });

    expect(d.options?.map((o) => ({ id: o.id, label: o.label, value: o.value }))).toEqual([
      { id: "a", label: "A", value: "a" },
      { id: "opt_1", label: "B", value: "B" },
    ]);
  });

  it("respondToDecision returns null if decision not found", () => {
    const res = respondToDecision({
      decisionId: "D_missing",
      respondedBy: { userId: "U1" },
      optionId: "approve",
      optionValue: "approve",
    });
    expect(res).toBeNull();
  });

  it("respondToDecision marks expired if decision is past expiresAt", () => {
    const d = createDecision({
      type: "binary",
      title: "Approve?",
      question: "Approve?",
      timeoutMinutes: 1,
    });

    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));

    const res = respondToDecision({
      decisionId: d.decisionId,
      respondedBy: { userId: "U1" },
      optionId: "approve",
      optionValue: "approve",
    });

    expect(res?.status).toBe("expired");

    const stored = getDecision(d.decisionId);
    expect(stored?.status).toBe("expired");
  });

  it("respondToDecision records response details and persists", () => {
    const d = createDecision({
      type: "choice",
      title: "Pick",
      question: "Pick",
      options: [{ label: "A", value: "a" }],
    });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));

    const res = respondToDecision({
      decisionId: d.decisionId,
      respondedBy: { userId: "U1", userName: "David" },
      optionId: "a",
      optionValue: "a",
    });

    expect(res?.status).toBe("responded");
    expect(res?.respondedAt).toBe(Date.now());
    expect(res?.respondedBy?.userId).toBe("U1");
    expect(res?.response?.optionId).toBe("a");

    const store = readStoreFile(stateDir);
    expect(store.decisions[d.decisionId].status).toBe("responded");
    expect(store.decisions[d.decisionId].respondedAt).toBe(Date.now());
  });

  it("respondToDecision does not overwrite already-resolved decisions", () => {
    const d = createDecision({
      type: "binary",
      title: "Approve?",
      question: "Approve?",
    });

    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    respondToDecision({
      decisionId: d.decisionId,
      respondedBy: { userId: "U1" },
      optionId: "approve",
      optionValue: "approve",
    });

    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    const res2 = respondToDecision({
      decisionId: d.decisionId,
      respondedBy: { userId: "U2" },
      optionId: "reject",
      optionValue: "reject",
    });

    expect(res2?.status).toBe("responded");
    expect(res2?.respondedBy?.userId).toBe("U1");
    expect(res2?.response?.optionId).toBe("approve");
  });

  it("listDecisions auto-expires pending decisions with expiresAt in the past, and supports filters", () => {
    uuidSpy.mockReturnValueOnce("aaaaaaaa-0000-0000-0000-000000000001");
    const d1 = createDecision({
      type: "text",
      title: "t1",
      question: "q1",
      context: { agentId: "a1", sessionKey: "s1" },
      timeoutMinutes: 1,
    });

    // ensure distinct createdAt ordering
    vi.advanceTimersByTime(1);

    uuidSpy.mockReturnValueOnce("bbbbbbbb-0000-0000-0000-000000000001");
    const d2 = createDecision({
      type: "text",
      title: "t2",
      question: "q2",
      context: { agentId: "a2", sessionKey: "s2" },
      timeoutMinutes: 0,
    });

    // Move time forward so d1 expires
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));

    const all = listDecisions();
    expect(all.map((d) => d.decisionId)).toEqual([d2.decisionId, d1.decisionId]);

    const expired = listDecisions({ status: "expired" });
    expect(expired.map((d) => d.decisionId)).toEqual([d1.decisionId]);

    const byAgent = listDecisions({ agentId: "a2" });
    expect(byAgent.map((d) => d.decisionId)).toEqual([d2.decisionId]);

    const bySession = listDecisions({ sessionKey: "s1" });
    expect(bySession.map((d) => d.decisionId)).toEqual([d1.decisionId]);

    const store = readStoreFile(stateDir);
    expect(store.decisions[d1.decisionId].status).toBe("expired");
  });

  it("updateDecisionSlackInfo persists slackChannel + slackMessageTs", () => {
    const d = createDecision({
      type: "binary",
      title: "Approve?",
      question: "Approve?",
    });

    expect(updateDecisionSlackInfo("D_missing", "C1", "1.2")).toBeNull();

    const updated = updateDecisionSlackInfo(d.decisionId, "C123", "1712345678.0001");
    expect(updated?.slackChannel).toBe("C123");
    expect(updated?.slackMessageTs).toBe("1712345678.0001");

    const store = readStoreFile(stateDir);
    expect(store.decisions[d.decisionId].slackChannel).toBe("C123");
    expect(store.decisions[d.decisionId].slackMessageTs).toBe("1712345678.0001");
  });

  it("cleanupExpiredDecisions deletes old non-pending decisions but keeps pending", () => {
    uuidSpy.mockReturnValueOnce("aaaaaaaa-0000-0000-0000-000000000001");
    const pending = createDecision({
      type: "text",
      title: "pending",
      question: "q",
      timeoutMinutes: 0,
    });

    uuidSpy.mockReturnValueOnce("bbbbbbbb-0000-0000-0000-000000000001");
    const responded = createDecision({
      type: "binary",
      title: "respond",
      question: "q",
      timeoutMinutes: 0,
    });

    // Respond immediately
    respondToDecision({
      decisionId: responded.decisionId,
      respondedBy: { userId: "U1" },
      optionId: "approve",
      optionValue: "approve",
    });

    // Move time far enough for cleanup
    vi.setSystemTime(new Date("2026-01-10T00:00:00.000Z"));

    const cleaned = cleanupExpiredDecisions(1); // anything older than 1ms
    expect(cleaned).toBe(1);

    const store = readStoreFile(stateDir);
    expect(store.decisions[pending.decisionId]).toBeTruthy();
    expect(store.decisions[responded.decisionId]).toBeUndefined();
  });

  it("recovers from a corrupt store file by starting fresh", () => {
    const storePath = path.join(stateDir, "decisions", "store.json");
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, "{not-json", "utf8");

    const d = createDecision({
      type: "text",
      title: "after-corrupt",
      question: "q",
    });

    const store = readStoreFile(stateDir);
    expect(store.decisions[d.decisionId]).toBeTruthy();
  });
});
