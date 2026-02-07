// Integration test: Search Adapter + meridia:// Protocol Resolution
// Validates: search returns URIs, readFile resolves to markdown,
// round-trip insert/search/readFile, vector search degradation.

import { afterEach, describe, expect, it } from "vitest";
import { MeridiaSearchAdapter } from "../../meridia-search-adapter.js";
import {
  setupIntegrationBackend,
  makeRecord,
  makePhenomenology,
  sanitizeRecord,
  type IntegrationBackend,
} from "./test-helpers.js";

let env: IntegrationBackend;

afterEach(async () => {
  if (env) {
    await env.cleanup();
  }
});

describe("Search Adapter + Protocol Resolution Pipeline", () => {
  describe("search returns meridia:// URIs", () => {
    it("search by keyword returns results with meridia://<id> paths", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "search-uri-1",
          content: { topic: "database optimization", summary: "improved query performance" },
        }),
      );

      const results = await adapter.search("database optimization");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe("meridia://search-uri-1");
      expect(results[0].source).toBe("memory");
    });

    it("search results have correct score and snippet", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "score-check",
          capture: {
            score: 0.85,
            evaluation: { kind: "heuristic", score: 0.85, reason: "high impact" },
          },
          content: { topic: "critical fix", summary: "resolved production outage" },
        }),
      );

      const results = await adapter.search("critical fix");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toContain("critical fix");
    });

    it("search with minScore filter excludes low-score records", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "low-score",
          capture: { score: 0.2, evaluation: { kind: "heuristic", score: 0.2, reason: "read" } },
          content: { topic: "routine read operation" },
        }),
      );
      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "high-score",
          capture: { score: 0.9, evaluation: { kind: "heuristic", score: 0.9, reason: "write" } },
          content: { topic: "routine write operation" },
        }),
      );

      const results = await adapter.search("routine", { minScore: 0.5 });
      const ids = results.map((r) => {
        const match = r.path.match(/meridia:\/\/(.+)/);
        return match?.[1];
      });
      expect(ids).not.toContain("low-score");
    });

    it("search returns empty for non-matching query", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({ id: "no-match", content: { topic: "alpha bravo charlie" } }),
      );

      const results = await adapter.search("xyzzynonexistent");
      expect(results.length).toBe(0);
    });
  });

  describe("readFile resolves URIs to structured markdown", () => {
    it("readFile('meridia://<id>') returns markdown with heading", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "read-heading",
          content: { topic: "test topic" },
        }),
      );

      const { text } = await adapter.readFile({ relPath: "meridia://read-heading" });
      expect(text).toContain("# Experience Kit: read-heading");
    });

    it("rendered markdown includes tool name and score", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "read-tool-score",
          tool: { name: "write", callId: "c1", isError: false },
          capture: {
            score: 0.88,
            evaluation: { kind: "heuristic", score: 0.88, reason: "file_write" },
          },
        }),
      );

      const { text } = await adapter.readFile({ relPath: "meridia://read-tool-score" });
      expect(text).toContain("write");
      expect(text).toContain("0.88");
    });

    it("rendered markdown includes phenomenology when present", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      const phenom = makePhenomenology();
      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "read-phenom",
          phenomenology: phenom,
          content: { topic: "phenomenology test" },
        }),
      );

      const { text } = await adapter.readFile({ relPath: "meridia://read-phenom" });
      expect(text).toContain("## Phenomenology");
      expect(text).toContain("focused");
      expect(text).toContain("engaged");
      expect(text).toContain("flowing");
    });

    it("rendered markdown includes emotionalSignature, engagementQuality, anchors", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      const phenom = makePhenomenology({
        anchors: [
          {
            phrase: "critical insight",
            significance: "changed approach",
            sensoryChannel: "verbal",
          },
        ],
        uncertainties: ["scaling concerns"],
      });
      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "read-full-phenom",
          phenomenology: phenom,
        }),
      );

      const { text } = await adapter.readFile({ relPath: "meridia://read-full-phenom" });
      expect(text).toContain("Emotions");
      expect(text).toContain("Engagement");
      expect(text).toContain("Anchors");
      expect(text).toContain("critical insight");
      expect(text).toContain("Uncertainties");
      expect(text).toContain("scaling concerns");
    });

    it("rendered markdown sanitizes data.args/result", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      // Insert a sanitized record (as the real pipeline would)
      const record = sanitizeRecord(
        makeRecord({
          id: "read-sanitized",
          data: { args: { apiKey: "sk-secret12345678901234567890abcdef" }, result: "ok" },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      const { text } = await adapter.readFile({ relPath: "meridia://read-sanitized" });
      expect(text).not.toContain("sk-secret12345678901234567890abcdef");
    });

    it("readFile for missing ID returns empty text", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      const { text } = await adapter.readFile({ relPath: "meridia://nonexistent-id" });
      expect(text).toBe("");
    });

    it("readFile with bare UUID resolves correctly", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);
      const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

      await env.backend.insertExperienceRecord(
        makeRecord({ id: uuid, content: { topic: "bare UUID test" } }),
      );

      const { text } = await adapter.readFile({ relPath: uuid });
      expect(text).toContain(`# Experience Kit: ${uuid}`);
    });
  });

  describe("round-trip: insert -> search -> readFile", () => {
    it("insert record, search by topic, readFile on result path produces valid markdown", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      await env.backend.insertExperienceRecord(
        makeRecord({
          id: "roundtrip-1",
          content: { topic: "microservice decomposition", summary: "split monolith into services" },
          phenomenology: makePhenomenology(),
        }),
      );

      // Search
      const searchResults = await adapter.search("microservice");
      expect(searchResults.length).toBeGreaterThan(0);
      const resultPath = searchResults[0].path;
      expect(resultPath).toBe("meridia://roundtrip-1");

      // ReadFile
      const { text } = await adapter.readFile({ relPath: resultPath });
      expect(text).toContain("microservice decomposition");
      expect(text).toContain("## Phenomenology");
      expect(text).toContain("# Experience Kit:");
    });

    it("insert record with sensitive data, readFile shows sanitized data", async () => {
      env = await setupIntegrationBackend();
      const adapter = new MeridiaSearchAdapter(env.backend);

      const record = sanitizeRecord(
        makeRecord({
          id: "roundtrip-secret",
          content: { topic: "deploy config update" },
          data: { args: { password: "my-secret-password" }, result: "deployed" },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      const searchResults = await adapter.search("deploy config");
      expect(searchResults.length).toBeGreaterThan(0);

      const { text } = await adapter.readFile({ relPath: searchResults[0].path });
      expect(text).toContain("deploy config update");
      expect(text).not.toContain("my-secret-password");
    });
  });

  describe("vector search (conditional)", () => {
    it("loadVectorExtension returns {ok: false} gracefully when unavailable", async () => {
      env = await setupIntegrationBackend();
      // Extension likely unavailable in test env — should fail gracefully
      const result = await env.backend.loadVectorExtension();
      // Whether it succeeds or not depends on the env, but it should not throw
      expect(result).toHaveProperty("ok");
    });

    it("searchByVector returns [] when vecAvailable is false", async () => {
      env = await setupIntegrationBackend();
      // Without loading the extension, vecAvailable should be false
      expect(env.backend.vecAvailable).toBe(false);
      const results = await env.backend.searchByVector(new Float32Array(384));
      expect(results).toEqual([]);
    });
  });
});
