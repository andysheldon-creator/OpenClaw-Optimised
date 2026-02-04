/**
 * Tests for Improve Service (Self-Improvement Mode)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createImproveService,
  generatePlanId,
  ImproveService,
  isValidPlanId,
} from "./improve-service.js";
import {
  buildFullBlocklist,
  checkBlocklist,
  filterByBlocklist,
  generateOpportunityId,
  isValidOpportunityId,
  matchesScope,
  filterToLineBudget,
  sortOpportunities,
} from "./improve-sources.js";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_IMPROVE_CONFIG,
  MAX_PR_LINES,
  NEVER_AUTO_MERGE,
  type ImprovementOpportunity,
} from "./improve-types.js";

// =============================================================================
// Security Constants Tests
// =============================================================================

describe("Security Constants", () => {
  it("should have NEVER_AUTO_MERGE set to true", () => {
    expect(NEVER_AUTO_MERGE).toBe(true);
  });

  it("should have reasonable MAX_PR_LINES limit", () => {
    expect(MAX_PR_LINES).toBe(500);
    expect(MAX_PR_LINES).toBeLessThanOrEqual(1000);
  });

  it("should have critical files in default blocklist", () => {
    expect(DEFAULT_BLOCKLIST).toContain("src/dj/web-policy.ts");
    expect(DEFAULT_BLOCKLIST).toContain("src/dj/web-operator.ts");
    expect(DEFAULT_BLOCKLIST.some((p) => p.includes("allowlist"))).toBe(true);
    expect(DEFAULT_BLOCKLIST.some((p) => p.includes(".env"))).toBe(true);
    expect(DEFAULT_BLOCKLIST.some((p) => p.includes("credentials"))).toBe(true);
    expect(DEFAULT_BLOCKLIST.some((p) => p.includes("secrets"))).toBe(true);
  });
});

// =============================================================================
// ID Generation Tests
// =============================================================================

describe("ID Generation", () => {
  describe("generateOpportunityId", () => {
    it("should generate valid opportunity IDs", () => {
      const id = generateOpportunityId();
      expect(isValidOpportunityId(id)).toBe(true);
      expect(id).toMatch(/^opp-[a-f0-9]{8}$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateOpportunityId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("generatePlanId", () => {
    it("should generate valid plan IDs", () => {
      const id = generatePlanId();
      expect(isValidPlanId(id)).toBe(true);
      expect(id).toMatch(/^imp-[a-f0-9]{8}$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generatePlanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("isValidOpportunityId", () => {
    it("should accept valid IDs", () => {
      expect(isValidOpportunityId("opp-12345678")).toBe(true);
      expect(isValidOpportunityId("opp-abcdef01")).toBe(true);
    });

    it("should reject invalid IDs", () => {
      expect(isValidOpportunityId("opp-1234567")).toBe(false); // too short
      expect(isValidOpportunityId("opp-123456789")).toBe(false); // too long
      expect(isValidOpportunityId("OPP-12345678")).toBe(false); // wrong case
      expect(isValidOpportunityId("imp-12345678")).toBe(false); // wrong prefix
    });
  });

  describe("isValidPlanId", () => {
    it("should accept valid IDs", () => {
      expect(isValidPlanId("imp-12345678")).toBe(true);
      expect(isValidPlanId("imp-abcdef01")).toBe(true);
    });

    it("should reject invalid IDs", () => {
      expect(isValidPlanId("imp-1234567")).toBe(false);
      expect(isValidPlanId("opp-12345678")).toBe(false);
    });
  });
});

// =============================================================================
// Blocklist Tests
// =============================================================================

describe("Blocklist", () => {
  describe("buildFullBlocklist", () => {
    it("should include default blocklist", () => {
      const blocklist = buildFullBlocklist();
      expect(blocklist).toEqual(expect.arrayContaining(DEFAULT_BLOCKLIST));
    });

    it("should merge custom patterns", () => {
      const custom = ["custom/*.ts", "private/**"];
      const blocklist = buildFullBlocklist(custom);
      expect(blocklist).toEqual(expect.arrayContaining(DEFAULT_BLOCKLIST));
      expect(blocklist).toEqual(expect.arrayContaining(custom));
    });

    it("should deduplicate patterns", () => {
      const blocklist = buildFullBlocklist(["src/dj/web-policy.ts"]);
      const count = blocklist.filter((p) => p === "src/dj/web-policy.ts").length;
      expect(count).toBe(1);
    });
  });

  describe("checkBlocklist", () => {
    const blocklist = buildFullBlocklist();

    it("should block web-policy.ts", () => {
      const result = checkBlocklist("src/dj/web-policy.ts", blocklist);
      expect(result.blocked).toBe(true);
      expect(result.matchedPattern).toBeDefined();
      expect(result.reason).toContain("Security policy");
    });

    it("should block web-operator.ts", () => {
      const result = checkBlocklist("src/dj/web-operator.ts", blocklist);
      expect(result.blocked).toBe(true);
    });

    it("should block allowlist files", () => {
      const result = checkBlocklist("config/allowlist.json", blocklist);
      expect(result.blocked).toBe(true);
    });

    it("should block .env files", () => {
      expect(checkBlocklist(".env", blocklist).blocked).toBe(true);
      expect(checkBlocklist(".env.local", blocklist).blocked).toBe(true);
      expect(checkBlocklist("config/.env.production", blocklist).blocked).toBe(true);
    });

    it("should block credentials directory", () => {
      const result = checkBlocklist("credentials/api-key.json", blocklist);
      expect(result.blocked).toBe(true);
    });

    it("should block secrets directory", () => {
      const result = checkBlocklist("secrets/private.pem", blocklist);
      expect(result.blocked).toBe(true);
    });

    it("should allow normal source files", () => {
      expect(checkBlocklist("src/utils/helpers.ts", blocklist).blocked).toBe(false);
      expect(checkBlocklist("src/components/Button.tsx", blocklist).blocked).toBe(false);
      expect(checkBlocklist("tests/unit/utils.test.ts", blocklist).blocked).toBe(false);
    });

    it("should handle Windows-style paths", () => {
      const result = checkBlocklist("src\\dj\\web-policy.ts", blocklist);
      expect(result.blocked).toBe(true);
    });
  });

  describe("filterByBlocklist", () => {
    const blocklist = buildFullBlocklist();

    it("should separate allowed and blocked files", () => {
      const files = [
        "src/utils/helpers.ts",
        "src/dj/web-policy.ts",
        "src/components/Button.tsx",
        ".env",
      ];

      const { allowed, blocked } = filterByBlocklist(files, blocklist);

      expect(allowed).toEqual(["src/utils/helpers.ts", "src/components/Button.tsx"]);
      expect(blocked).toEqual(["src/dj/web-policy.ts", ".env"]);
    });

    it("should handle empty input", () => {
      const { allowed, blocked } = filterByBlocklist([], blocklist);
      expect(allowed).toEqual([]);
      expect(blocked).toEqual([]);
    });

    it("should handle all allowed files", () => {
      const files = ["src/a.ts", "src/b.ts"];
      const { allowed, blocked } = filterByBlocklist(files, blocklist);
      expect(allowed).toEqual(files);
      expect(blocked).toEqual([]);
    });

    it("should handle all blocked files", () => {
      const files = ["src/dj/web-policy.ts", ".env"];
      const { allowed, blocked } = filterByBlocklist(files, blocklist);
      expect(allowed).toEqual([]);
      expect(blocked).toEqual(files);
    });
  });
});

// =============================================================================
// Scope Matching Tests
// =============================================================================

describe("Scope Matching", () => {
  describe("matchesScope", () => {
    it("should match glob patterns", () => {
      expect(matchesScope("src/utils/helpers.ts", ["src/**/*.ts"])).toBe(true);
      expect(matchesScope("src/components/Button.tsx", ["src/**/*.tsx"])).toBe(true);
    });

    it("should not match outside scope", () => {
      expect(matchesScope("tests/unit/test.ts", ["src/**/*.ts"])).toBe(false);
      expect(matchesScope("lib/utils.ts", ["src/**/*.ts"])).toBe(false);
    });

    it("should handle multiple scope patterns", () => {
      const scope = ["src/**/*.ts", "lib/**/*.ts"];
      expect(matchesScope("src/utils/helpers.ts", scope)).toBe(true);
      expect(matchesScope("lib/helpers.ts", scope)).toBe(true);
      expect(matchesScope("tests/test.ts", scope)).toBe(false);
    });

    it("should handle Windows-style paths", () => {
      expect(matchesScope("src\\utils\\helpers.ts", ["src/**/*.ts"])).toBe(true);
    });
  });
});

// =============================================================================
// Opportunity Management Tests
// =============================================================================

describe("Opportunity Management", () => {
  const createOpportunity = (
    id: string,
    confidence: "high" | "medium" | "low",
    lines: number,
  ): ImprovementOpportunity => ({
    id: id as any,
    type: "refactor",
    file: "src/test.ts",
    description: "Test opportunity",
    confidence,
    estimatedLines: lines,
  });

  describe("sortOpportunities", () => {
    it("should sort by confidence (high first)", () => {
      const opps = [
        createOpportunity("opp-00000001", "low", 10),
        createOpportunity("opp-00000002", "high", 10),
        createOpportunity("opp-00000003", "medium", 10),
      ];

      const sorted = sortOpportunities(opps);

      expect(sorted[0].confidence).toBe("high");
      expect(sorted[1].confidence).toBe("medium");
      expect(sorted[2].confidence).toBe("low");
    });

    it("should sort by lines within same confidence (smallest first)", () => {
      const opps = [
        createOpportunity("opp-00000001", "high", 50),
        createOpportunity("opp-00000002", "high", 10),
        createOpportunity("opp-00000003", "high", 30),
      ];

      const sorted = sortOpportunities(opps);

      expect(sorted[0].estimatedLines).toBe(10);
      expect(sorted[1].estimatedLines).toBe(30);
      expect(sorted[2].estimatedLines).toBe(50);
    });
  });

  describe("filterToLineBudget", () => {
    it("should select opportunities within budget", () => {
      const opps = [
        createOpportunity("opp-00000001", "high", 100),
        createOpportunity("opp-00000002", "high", 200),
        createOpportunity("opp-00000003", "high", 300),
      ];

      const filtered = filterToLineBudget(opps, 250);

      // Should select 100 + 200 = 300 is over, so just 100
      // Actually 100 is selected, then 200 would make 300 > 250, so skip
      // Result: just the 100-line one
      expect(filtered.length).toBe(1);
      expect(filtered[0].estimatedLines).toBe(100);
    });

    it("should prioritize high confidence opportunities", () => {
      const opps = [
        createOpportunity("opp-00000001", "low", 50),
        createOpportunity("opp-00000002", "high", 50),
        createOpportunity("opp-00000003", "medium", 50),
      ];

      const filtered = filterToLineBudget(opps, 100);

      // Should select high (50) + medium (50) = 100
      expect(filtered.length).toBe(2);
      expect(filtered[0].confidence).toBe("high");
      expect(filtered[1].confidence).toBe("medium");
    });

    it("should handle exact budget match", () => {
      const opps = [createOpportunity("opp-00000001", "high", 500)];

      const filtered = filterToLineBudget(opps, 500);

      expect(filtered.length).toBe(1);
    });

    it("should handle budget too small", () => {
      const opps = [createOpportunity("opp-00000001", "high", 100)];

      const filtered = filterToLineBudget(opps, 50);

      expect(filtered.length).toBe(0);
    });
  });
});

// =============================================================================
// ImproveService Tests
// =============================================================================

describe("ImproveService", () => {
  let service: ImproveService;

  beforeEach(() => {
    service = createImproveService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const svc = createImproveService();
      expect(svc).toBeInstanceOf(ImproveService);
    });

    it("should create with custom config", () => {
      const svc = createImproveService({
        defaultScope: ["lib/**/*.ts"],
        defaultBudgetProfile: "cheap",
      });
      expect(svc).toBeInstanceOf(ImproveService);
    });
  });

  describe("setScope", () => {
    it("should allow setting valid scope", () => {
      expect(() => service.setScope(["src/**/*.ts"])).not.toThrow();
    });

    it("should reject scope containing blocked paths", () => {
      expect(() => service.setScope(["src/dj/web-policy.ts"])).toThrow("SECURITY");
    });

    it("should reject scope matching blocklist patterns", () => {
      expect(() => service.setScope([".env"])).toThrow("SECURITY");
    });
  });

  describe("getStatus", () => {
    it("should return current scope", async () => {
      const status = await service.getStatus();
      expect(status.success).toBe(true);
      expect(status.currentScope).toBeDefined();
      expect(status.blocklist).toBeDefined();
    });

    it("should return error for non-existent plan", async () => {
      const status = await service.getStatus("imp-00000000");
      expect(status.success).toBe(false);
      expect(status.message).toContain("not found");
    });
  });

  describe("approvePlan / rejectPlan", () => {
    it("should return false for non-existent plan", () => {
      expect(service.approvePlan("imp-00000000")).toBe(false);
      expect(service.rejectPlan("imp-00000000")).toBe(false);
    });
  });
});

// =============================================================================
// Default Config Tests
// =============================================================================

describe("Default Config", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_IMPROVE_CONFIG.scope).toContain("src/**/*.ts");
    expect(DEFAULT_IMPROVE_CONFIG.customBlocklist).toEqual([]);
    expect(DEFAULT_IMPROVE_CONFIG.maxPrLines).toBe(500);
    expect(DEFAULT_IMPROVE_CONFIG.budgetProfile).toBe("normal");
  });
});
