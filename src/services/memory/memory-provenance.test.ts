/**
 * Tests for FB-009: Memory Source Provenance
 *
 * Verifies that facts stored in the memory system carry source_type and
 * trust_level metadata, that defaults are applied correctly, and that
 * the data flows through retain → store → recall.
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config to use a temp directory for tests
const TEST_DIR = path.join(
  process.env.TEMP ?? "/tmp",
  `memory-test-${Date.now()}`,
);

vi.mock("../../config/config.js", () => ({
  STATE_DIR_CLAWDIS: TEST_DIR,
}));

// Suppress logging during tests
vi.mock("../../runtime.js", () => ({
  defaultRuntime: { log: undefined },
}));

// Import after mocks are set up
const {
  closeMemoryStore,
  DEFAULT_TRUST_LEVELS,
  getDb,
  insertFact,
  insertFacts,
  searchFts,
  getFactsByDay,
  getMemoryStats,
} = await import("./memory-store.js");

const { retainMessages } = await import("./memory-retain.js");
const { buildMemoryContext, recallLexical } = await import(
  "./memory-recall.js"
);

describe("FB-009: Memory Source Provenance", () => {
  beforeEach(() => {
    // Ensure test directory exists
    fs.mkdirSync(path.join(TEST_DIR, "memory"), { recursive: true });
    // Initialise the database
    getDb();
  });

  afterEach(() => {
    closeMemoryStore();
    // Clean up test database
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ── Schema & Migration ──────────────────────────────────────────────────

  it("creates facts table with source_type and trust_level columns", () => {
    const db = getDb();
    const columns = db
      .prepare("PRAGMA table_info(facts)")
      .all() as Array<{ name: string; type: string }>;
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("source_type");
    expect(colNames).toContain("trust_level");
  });

  it("creates indexes for source_type and trust_level", () => {
    const db = getDb();
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='facts'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_facts_source_type");
    expect(indexNames).toContain("idx_facts_trust_level");
  });

  // ── insertFact with provenance ──────────────────────────────────────────

  it("stores source_type and trust_level on insert", () => {
    const id = insertFact({
      sessionId: "test-session",
      factType: "world",
      content: "TypeScript 5.4 was released in March 2024.",
      timestamp: Date.now(),
      sourceDay: "2024-03-01",
      sourceType: "user",
      trustLevel: 1.0,
    });

    const db = getDb();
    const row = db.prepare("SELECT source_type, trust_level FROM facts WHERE id = ?").get(id) as {
      source_type: string;
      trust_level: number;
    };

    expect(row.source_type).toBe("user");
    expect(row.trust_level).toBe(1.0);
  });

  it("defaults source_type to 'unknown' when not provided", () => {
    const id = insertFact({
      sessionId: "test-session",
      factType: "observation",
      content: "The sky is blue and the grass is green today.",
      timestamp: Date.now(),
      sourceDay: "2024-01-01",
    });

    const db = getDb();
    const row = db.prepare("SELECT source_type, trust_level FROM facts WHERE id = ?").get(id) as {
      source_type: string;
      trust_level: number;
    };

    expect(row.source_type).toBe("unknown");
    expect(row.trust_level).toBe(DEFAULT_TRUST_LEVELS.unknown);
  });

  it("applies default trust level based on source_type", () => {
    const sources = ["user", "system", "tool", "skill", "web"] as const;
    const ids: Record<string, number> = {};

    for (const src of sources) {
      ids[src] = insertFact({
        sessionId: "test-session",
        factType: "world",
        content: `Fact from ${src} source for provenance testing.`,
        timestamp: Date.now(),
        sourceDay: "2024-01-01",
        sourceType: src,
      });
    }

    const db = getDb();
    for (const src of sources) {
      const row = db
        .prepare("SELECT trust_level FROM facts WHERE id = ?")
        .get(ids[src]) as { trust_level: number };
      expect(row.trust_level).toBe(DEFAULT_TRUST_LEVELS[src]);
    }
  });

  it("allows custom trust_level to override default", () => {
    const id = insertFact({
      sessionId: "test-session",
      factType: "world",
      content: "Web content that has been verified and is trustworthy.",
      timestamp: Date.now(),
      sourceDay: "2024-01-01",
      sourceType: "web",
      trustLevel: 0.9, // Override the default 0.3 for web
    });

    const db = getDb();
    const row = db.prepare("SELECT trust_level FROM facts WHERE id = ?").get(id) as {
      trust_level: number;
    };

    expect(row.trust_level).toBe(0.9);
  });

  // ── insertFacts (batch) ─────────────────────────────────────────────────

  it("batch insert preserves provenance per-fact", () => {
    const ids = insertFacts([
      {
        sessionId: "test-session",
        factType: "world",
        content: "User says the project uses TypeScript with React.",
        timestamp: Date.now(),
        sourceDay: "2024-01-01",
        sourceType: "user",
      },
      {
        sessionId: "test-session",
        factType: "observation",
        content: "Web scrape found that React 19 is out and available.",
        timestamp: Date.now(),
        sourceDay: "2024-01-01",
        sourceType: "web",
        trustLevel: 0.2,
      },
    ]);

    expect(ids).toHaveLength(2);

    const db = getDb();
    const row1 = db.prepare("SELECT source_type, trust_level FROM facts WHERE id = ?").get(ids[0]) as {
      source_type: string;
      trust_level: number;
    };
    const row2 = db.prepare("SELECT source_type, trust_level FROM facts WHERE id = ?").get(ids[1]) as {
      source_type: string;
      trust_level: number;
    };

    expect(row1.source_type).toBe("user");
    expect(row1.trust_level).toBe(1.0);
    expect(row2.source_type).toBe("web");
    expect(row2.trust_level).toBe(0.2);
  });

  // ── FTS search returns provenance ───────────────────────────────────────

  it("searchFts returns sourceType and trustLevel", () => {
    insertFact({
      sessionId: "test-session",
      factType: "world",
      content: "Python 3.12 introduced improved error messages for developers.",
      timestamp: Date.now(),
      sourceDay: "2024-01-01",
      sourceType: "web",
      trustLevel: 0.35,
    });

    const results = searchFts("Python error messages");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sourceType).toBe("web");
    expect(results[0].trustLevel).toBe(0.35);
  });

  // ── getFactsByDay returns provenance ────────────────────────────────────

  it("getFactsByDay returns sourceType and trustLevel", () => {
    insertFact({
      sessionId: "test-session",
      factType: "experience",
      content: "Deployed the new feature to production this morning successfully.",
      timestamp: Date.now(),
      sourceDay: "2024-06-15",
      sourceType: "tool",
    });

    const facts = getFactsByDay("2024-06-15");
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].sourceType).toBe("tool");
    expect(facts[0].trustLevel).toBe(DEFAULT_TRUST_LEVELS.tool);
  });

  // ── retainMessages passes provenance ────────────────────────────────────

  it("retainMessages passes sourceType to stored facts", () => {
    const result = retainMessages({
      sessionId: "test-retain",
      messages: [
        {
          role: "user",
          content: "I have configured the server to use PostgreSQL instead of MySQL for the database.",
        } as unknown as import("@mariozechner/pi-agent-core").AgentMessage,
      ],
      sourceType: "user",
    });

    expect(result.factsStored).toBeGreaterThan(0);
    expect(result.sourceType).toBe("user");
    expect(result.trustLevel).toBe(DEFAULT_TRUST_LEVELS.user);

    // Verify in DB
    const db = getDb();
    const row = db
      .prepare(
        "SELECT source_type, trust_level FROM facts WHERE session_id = ? LIMIT 1",
      )
      .get("test-retain") as { source_type: string; trust_level: number };

    expect(row.source_type).toBe("user");
    expect(row.trust_level).toBe(1.0);
  });

  it("retainMessages defaults to unknown source", () => {
    const result = retainMessages({
      sessionId: "test-retain-default",
      messages: [
        {
          role: "user",
          content: "The weather forecast says it will rain tomorrow afternoon and evening.",
        } as unknown as import("@mariozechner/pi-agent-core").AgentMessage,
      ],
    });

    expect(result.sourceType).toBe("unknown");
    expect(result.trustLevel).toBe(DEFAULT_TRUST_LEVELS.unknown);
  });

  // ── Recall includes provenance ──────────────────────────────────────────

  it("recallLexical includes sourceType and trustLevel in items", () => {
    insertFact({
      sessionId: "test-recall",
      factType: "world",
      content: "Kubernetes supports automatic horizontal pod autoscaling natively.",
      timestamp: Date.now(),
      sourceDay: "2024-01-01",
      sourceType: "skill",
      trustLevel: 0.65,
    });

    const result = recallLexical("Kubernetes autoscaling");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].sourceType).toBe("skill");
    expect(result.items[0].trustLevel).toBe(0.65);
  });

  // ── buildMemoryContext shows low-trust warning ──────────────────────────

  it("buildMemoryContext shows warning for low-trust items", () => {
    const context = buildMemoryContext({
      items: [
        {
          kind: "world",
          timestamp: Date.now(),
          entities: [],
          content: "Some unverified claim from the internet.",
          source: "facts/1 (2024-01-01)",
          sourceType: "web",
          trustLevel: 0.3,
        },
      ],
      totalFound: 1,
      durationMs: 1,
      queryType: "lexical",
    });

    expect(context).toContain("low-trust:web(0.3)");
  });

  it("buildMemoryContext does NOT show warning for high-trust items", () => {
    const context = buildMemoryContext({
      items: [
        {
          kind: "experience",
          timestamp: Date.now(),
          entities: [],
          content: "I deployed the app yesterday successfully.",
          source: "facts/2 (2024-01-01)",
          sourceType: "user",
          trustLevel: 1.0,
        },
      ],
      totalFound: 1,
      durationMs: 1,
      queryType: "lexical",
    });

    expect(context).not.toContain("low-trust");
  });

  // ── DEFAULT_TRUST_LEVELS sanity ─────────────────────────────────────────

  it("DEFAULT_TRUST_LEVELS has correct ordering", () => {
    expect(DEFAULT_TRUST_LEVELS.user).toBeGreaterThan(DEFAULT_TRUST_LEVELS.system);
    expect(DEFAULT_TRUST_LEVELS.system).toBeGreaterThan(DEFAULT_TRUST_LEVELS.tool);
    expect(DEFAULT_TRUST_LEVELS.tool).toBeGreaterThan(DEFAULT_TRUST_LEVELS.skill);
    expect(DEFAULT_TRUST_LEVELS.skill).toBeGreaterThan(DEFAULT_TRUST_LEVELS.web);
  });

  // ── Stats still work ────────────────────────────────────────────────────

  it("getMemoryStats works after schema migration", () => {
    insertFact({
      sessionId: "test-stats",
      factType: "world",
      content: "A test fact to verify stats work after the migration.",
      timestamp: Date.now(),
      sourceDay: "2024-01-01",
      sourceType: "system",
    });

    const stats = getMemoryStats();
    expect(stats.factCount).toBe(1);
  });
});
