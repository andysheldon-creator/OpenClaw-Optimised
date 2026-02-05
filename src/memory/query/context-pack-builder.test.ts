import { describe, expect, it } from "vitest";
import { mockQueryRequest, mockQueryResults } from "./__fixtures__/query-results.js";
import { ContextPackBuilder } from "./context-pack-builder.js";
import { MockQueryOrchestrator } from "./mock-orchestrator.js";

describe("ContextPackBuilder", () => {
  it("assembles a context pack from mock orchestrator results", async () => {
    const orchestrator = new MockQueryOrchestrator({ results: mockQueryResults });
    const builder = new ContextPackBuilder(orchestrator, { maxChars: 500 });

    const result = await builder.build({ ...mockQueryRequest, maxChars: 300 });

    expect(result.sources).toEqual(mockQueryResults.slice(0, 2));
    expect(result.pack).toContain("Onboarding checklist");
    expect(result.pack).toContain("Security follow-ups");
    expect(result.pack.length).toBeLessThanOrEqual(300);
  });

  it("uses the builder default maxChars when the request omits it", async () => {
    const orchestrator = new MockQueryOrchestrator({ results: mockQueryResults });
    const builder = new ContextPackBuilder(orchestrator, { maxChars: 120 });

    const result = await builder.build({ query: "check", limit: 1 });

    expect(result.sources).toEqual([mockQueryResults[0]]);
    expect(result.pack.length).toBeLessThanOrEqual(120);
  });
});
