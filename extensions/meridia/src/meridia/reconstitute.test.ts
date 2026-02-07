import { describe, expect, it } from "vitest";
import type { ReconstitutionPack } from "./reconstitute.js";
import type { MeridiaExperienceRecord } from "./types.js";
import { buildRecordSummary, parseProsePack, formatProsePack } from "./reconstitute.js";

// ────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<MeridiaExperienceRecord> = {}): MeridiaExperienceRecord {
  return {
    id: "rec-1",
    ts: new Date().toISOString(),
    kind: "tool_result",
    session: { key: "test-session" },
    tool: { name: "exec", callId: "call-1", isError: false },
    capture: {
      score: 0.75,
      evaluation: { kind: "heuristic", score: 0.75, reason: "shell_exec" },
    },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// buildRecordSummary
// ────────────────────────────────────────────────────────────────────────────

describe("buildRecordSummary", () => {
  it("builds summary with tool name and score", () => {
    const record = makeRecord();
    const summary = buildRecordSummary(record);
    expect(summary).toContain("exec");
    expect(summary).toContain("0.75");
  });

  it("includes ERROR tag for error records", () => {
    const record = makeRecord({
      tool: { name: "exec", callId: "c1", isError: true },
    });
    const summary = buildRecordSummary(record);
    expect(summary).toContain("ERROR");
  });

  it("includes topic from content", () => {
    const record = makeRecord({
      content: { topic: "deployment issue" },
    });
    const summary = buildRecordSummary(record);
    expect(summary).toContain("deployment issue");
  });

  it("includes phenomenology data when present", () => {
    const record = makeRecord({
      content: {
        phenomenology: {
          emotionalSignature: { primary: ["focused", "determined"], intensity: 0.8 },
          engagementQuality: "deep-flow",
          anchors: [{ phrase: "config migration", significance: "key task" }],
          uncertainties: ["database schema unknown"],
        },
      },
    });
    const summary = buildRecordSummary(record);
    expect(summary).toContain("focused");
    expect(summary).toContain("deep-flow");
    expect(summary).toContain("config migration");
    expect(summary).toContain("database schema unknown");
  });

  it("handles records without phenomenology", () => {
    const record = makeRecord({ content: { summary: "simple result" } });
    const summary = buildRecordSummary(record);
    expect(summary).toContain("simple result");
    expect(summary).not.toContain("emotions:");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseProsePack
// ────────────────────────────────────────────────────────────────────────────

describe("parseProsePack", () => {
  const records = [makeRecord()];

  it("parses a valid prose pack", () => {
    const raw = {
      summary: "The agent was working on a deployment task.",
      approachGuidance: ["Start by reviewing the config"],
      anchors: [{ phrase: "deployment", instruction: "check status" }],
      openUncertainties: ["DB migration status"],
      nextActions: ["Run tests"],
    };
    const result = parseProsePack(raw, records);
    expect(result).not.toBeNull();
    expect(result!.summary).toContain("deployment");
    expect(result!.approachGuidance).toHaveLength(1);
    expect(result!.anchors).toHaveLength(1);
    expect(result!.openUncertainties).toHaveLength(1);
    expect(result!.nextActions).toHaveLength(1);
    expect(result!.citations).toHaveLength(1);
  });

  it("returns null for missing summary", () => {
    expect(parseProsePack({}, records)).toBeNull();
    expect(parseProsePack({ summary: "" }, records)).toBeNull();
  });

  it("returns null for empty summary", () => {
    expect(parseProsePack({ summary: "   " }, records)).toBeNull();
  });

  it("handles missing optional fields", () => {
    const result = parseProsePack({ summary: "Basic summary." }, records);
    expect(result).not.toBeNull();
    expect(result!.approachGuidance).toEqual([]);
    expect(result!.anchors).toEqual([]);
    expect(result!.openUncertainties).toEqual([]);
    expect(result!.nextActions).toEqual([]);
  });

  it("filters invalid anchors", () => {
    const raw = {
      summary: "Test",
      anchors: [
        { phrase: "valid", instruction: "ok" },
        { phrase: "missing instruction" },
        "not an object",
      ],
    };
    const result = parseProsePack(raw, records);
    expect(result!.anchors).toHaveLength(1);
  });

  it("filters non-string array items", () => {
    const raw = {
      summary: "Test",
      approachGuidance: ["valid", 42, null],
      openUncertainties: ["valid", true],
      nextActions: ["valid", {}],
    };
    const result = parseProsePack(raw, records);
    expect(result!.approachGuidance).toEqual(["valid"]);
    expect(result!.openUncertainties).toEqual(["valid"]);
    expect(result!.nextActions).toEqual(["valid"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// formatProsePack
// ────────────────────────────────────────────────────────────────────────────

describe("formatProsePack", () => {
  it("formats a complete prose pack as markdown", () => {
    const pack: ReconstitutionPack = {
      summary: "The agent was investigating a memory leak in the Node.js service.",
      approachGuidance: ["Check heap snapshots first", "Look at event listener cleanup"],
      anchors: [
        { phrase: "heap snapshot", instruction: "Compare before/after allocation" },
        {
          phrase: "EventEmitter",
          instruction: "Check for leaked listeners",
          citation: "[exec@2h ago]",
        },
      ],
      openUncertainties: ["Root cause not identified"],
      nextActions: ["Run profiler", "Check recent changes"],
      citations: [
        { id: "r1", kind: "tool_result", citation: "[exec@2h ago]" },
        { id: "r2", kind: "tool_result", citation: "[write@1h ago]" },
      ],
    };
    const text = formatProsePack(pack);

    expect(text).toContain("## Experiential Continuity");
    expect(text).toContain("memory leak");
    expect(text).toContain("### Approach Guidance");
    expect(text).toContain("heap snapshots");
    expect(text).toContain("### Key Anchors");
    expect(text).toContain("**heap snapshot**");
    expect(text).toContain("### Open Uncertainties");
    expect(text).toContain("Root cause");
    expect(text).toContain("### Suggested Next Actions");
    expect(text).toContain("Run profiler");
    expect(text).toContain("### Sources");
    expect(text).toContain("2 experiential records");
  });

  it("omits empty sections", () => {
    const pack: ReconstitutionPack = {
      summary: "Minimal context.",
      approachGuidance: [],
      anchors: [],
      openUncertainties: [],
      nextActions: [],
      citations: [],
    };
    const text = formatProsePack(pack);

    expect(text).toContain("## Experiential Continuity");
    expect(text).toContain("Minimal context.");
    expect(text).not.toContain("### Approach Guidance");
    expect(text).not.toContain("### Key Anchors");
    expect(text).not.toContain("### Open Uncertainties");
    expect(text).not.toContain("### Suggested Next Actions");
    expect(text).not.toContain("### Sources");
  });

  it("includes citation in anchor line", () => {
    const pack: ReconstitutionPack = {
      summary: "Test.",
      approachGuidance: [],
      anchors: [{ phrase: "concept", instruction: "do this", citation: "[ref]" }],
      openUncertainties: [],
      nextActions: [],
      citations: [],
    };
    const text = formatProsePack(pack);
    expect(text).toContain("**concept**: do this [ref]");
  });
});
