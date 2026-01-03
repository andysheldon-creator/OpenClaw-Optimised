import { describe, expect, it } from "vitest";
import { parseDeepResearchCommand } from "./command.js";

describe("parseDeepResearchCommand", () => {
  it("extracts topic from /deep", () => {
    const result = parseDeepResearchCommand("/deep AI safety");
    expect(result).toEqual({ topic: "AI safety" });
  });

  it("handles @botname mention (includes it in topic for simplicity)", () => {
    const result = parseDeepResearchCommand("/deep@testbot Climate");
    expect(result).toEqual({ topic: "@testbot Climate" });
  });

  it("handles separators like colon", () => {
    const result = parseDeepResearchCommand("/deep: topic");
    expect(result).toEqual({ topic: ": topic" });
  });

  it("handles multiple spaces after command", () => {
    const result = parseDeepResearchCommand("/deep  rick n Morty 7 сезон стоит смотреть ?");
    expect(result).toEqual({ topic: "rick n Morty 7 сезон стоит смотреть ?" });
  });

  it("returns null for non-command text", () => {
    const result = parseDeepResearchCommand("deep research on AI");
    expect(result).toBeNull();
  });

  it("returns empty topic for bare command", () => {
    const result = parseDeepResearchCommand("/deep");
    expect(result).toEqual({ topic: "" });
  });
});
