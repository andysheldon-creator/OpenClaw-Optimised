import { describe, expect, it } from "vitest";

import { BOARD_AGENT_ROLES, isBoardAgentRole } from "./types.js";

describe("BOARD_AGENT_ROLES", () => {
  it("contains exactly six roles", () => {
    expect(BOARD_AGENT_ROLES).toHaveLength(6);
  });

  it("contains all expected roles", () => {
    expect(BOARD_AGENT_ROLES).toContain("general");
    expect(BOARD_AGENT_ROLES).toContain("research");
    expect(BOARD_AGENT_ROLES).toContain("content");
    expect(BOARD_AGENT_ROLES).toContain("finance");
    expect(BOARD_AGENT_ROLES).toContain("strategy");
    expect(BOARD_AGENT_ROLES).toContain("critic");
  });
});

describe("isBoardAgentRole", () => {
  it("returns true for valid roles", () => {
    for (const role of BOARD_AGENT_ROLES) {
      expect(isBoardAgentRole(role)).toBe(true);
    }
  });

  it("returns false for invalid strings", () => {
    expect(isBoardAgentRole("unknown")).toBe(false);
    expect(isBoardAgentRole("")).toBe(false);
    expect(isBoardAgentRole("General")).toBe(false); // case-sensitive
    expect(isBoardAgentRole("admin")).toBe(false);
  });
});
