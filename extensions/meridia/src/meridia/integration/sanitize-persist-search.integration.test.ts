// Integration test: Sanitization + Migration + Persistence Pipeline
// Validates: fresh DB migrations, sanitized record insertion/retrieval,
// FTS search doesn't leak secrets, batch inserts with mixed sensitivity.

import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { getCurrentVersion } from "../db/migrations.js";
import {
  setupIntegrationBackend,
  makeRecord,
  sanitizeRecord,
  seedSanitizedRecords,
  type IntegrationBackend,
} from "./test-helpers.js";

const require = createRequire(import.meta.url);

let env: IntegrationBackend;

afterEach(async () => {
  if (env) {
    await env.cleanup();
  }
});

describe("Sanitization + Persistence Pipeline", () => {
  describe("migrations produce a searchable schema", () => {
    it("fresh backend runs all migrations and reports correct schema version", async () => {
      env = await setupIntegrationBackend();
      const version = await env.backend.getMeta("schema_version");
      expect(Number(version)).toBeGreaterThanOrEqual(3);
    });

    it("meridia_meta tracks vector_enabled = pending", async () => {
      env = await setupIntegrationBackend();
      const vecEnabled = await env.backend.getMeta("vector_enabled");
      expect(vecEnabled).toBe("pending");
    });

    it("re-init on existing database is idempotent", async () => {
      env = await setupIntegrationBackend();

      // Insert a record
      const record = makeRecord({ id: "persist-check" });
      await env.backend.insertExperienceRecord(record);

      // Re-initialize
      await env.backend.init();

      // Data should survive
      const result = await env.backend.getRecordById("persist-check");
      expect(result).not.toBeNull();
      expect(result!.record.id).toBe("persist-check");
    });
  });

  describe("sanitized record insertion and retrieval", () => {
    it("record with sk-* token in data.args is redacted in getRecordById", async () => {
      env = await setupIntegrationBackend();
      const raw = makeRecord({
        id: "secret-sk",
        data: { args: { apiKey: "sk-abc123456789012345678901234567890" } },
      });
      const sanitized = sanitizeRecord(raw);
      await env.backend.insertExperienceRecord(sanitized);

      const result = await env.backend.getRecordById("secret-sk");
      expect(result).not.toBeNull();
      const stored = JSON.stringify(result!.record.data);
      expect(stored).not.toContain("sk-abc123456789012345678901234567890");
    });

    it("record with Bearer token in data.result is redacted", async () => {
      env = await setupIntegrationBackend();
      const raw = makeRecord({
        id: "secret-bearer",
        data: {
          result: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
        },
      });
      const sanitized = sanitizeRecord(raw);
      await env.backend.insertExperienceRecord(sanitized);

      const result = await env.backend.getRecordById("secret-bearer");
      const stored = JSON.stringify(result!.record.data);
      expect(stored).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });

    it("record with PEM private key is redacted", async () => {
      env = await setupIntegrationBackend();
      const pem =
        "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJLA\nSECRETKEYDATA1234567890ABCDEF\n-----END RSA PRIVATE KEY-----";
      const raw = makeRecord({
        id: "secret-pem",
        data: { args: { key: pem } },
      });
      const sanitized = sanitizeRecord(raw);
      await env.backend.insertExperienceRecord(sanitized);

      const result = await env.backend.getRecordById("secret-pem");
      const stored = JSON.stringify(result!.record.data);
      expect(stored).not.toContain("SECRETKEYDATA1234567890ABCDEF");
    });

    it("record with password field is fully masked", async () => {
      env = await setupIntegrationBackend();
      const raw = makeRecord({
        id: "secret-password",
        data: { args: { password: "super-secret-password-123" } },
      });
      const sanitized = sanitizeRecord(raw);
      await env.backend.insertExperienceRecord(sanitized);

      const result = await env.backend.getRecordById("secret-password");
      const stored = JSON.stringify(result!.record.data);
      expect(stored).not.toContain("super-secret-password-123");
      expect(stored).toContain("***");
    });

    it("record with no sensitive data passes through unchanged", async () => {
      env = await setupIntegrationBackend();
      const raw = makeRecord({
        id: "clean-record",
        content: { topic: "refactoring notes", summary: "cleaned up module boundaries" },
        data: { args: { file: "src/main.ts" }, result: "success" },
      });
      const sanitized = sanitizeRecord(raw);
      await env.backend.insertExperienceRecord(sanitized);

      const result = await env.backend.getRecordById("clean-record");
      expect(result).not.toBeNull();
      const data = result!.record.data;
      expect((data?.args as Record<string, unknown>)?.file).toBe("src/main.ts");
      expect(data?.result).toBe("success");
    });
  });

  describe("search does not leak redacted content", () => {
    it("FTS search by topic/summary finds record correctly", async () => {
      env = await setupIntegrationBackend();
      const record = sanitizeRecord(
        makeRecord({
          id: "searchable-1",
          content: { topic: "authentication refactor", summary: "improved OAuth flow" },
          data: { args: { token: "sk-live-secret1234567890abcdefghijklmnop" } },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      const results = await env.backend.searchRecords("authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].record.id).toBe("searchable-1");
    });

    it("FTS search for the raw secret string returns 0 results", async () => {
      env = await setupIntegrationBackend();
      const secret = "sk-live-secret1234567890abcdefghijklmnop";
      const record = sanitizeRecord(
        makeRecord({
          id: "no-leak-1",
          content: { topic: "config update" },
          data: { args: { apiKey: secret } },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      // The raw secret should not appear in searchable text
      const results = await env.backend.searchRecords(secret);
      expect(results.length).toBe(0);
    });

    it("getRecordsBySession returns sanitized records", async () => {
      env = await setupIntegrationBackend();
      const record = sanitizeRecord(
        makeRecord({
          id: "session-secret-1",
          session: { key: "sess-sanitize" },
          data: { args: { secret: "ghp_abcdefghijklmnopqrstuvwxyz1234" } },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      const results = await env.backend.getRecordsBySession("sess-sanitize");
      expect(results.length).toBe(1);
      const stored = JSON.stringify(results[0].record.data);
      expect(stored).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234");
    });

    it("getRecordsByTool returns sanitized records", async () => {
      env = await setupIntegrationBackend();
      const record = sanitizeRecord(
        makeRecord({
          id: "tool-secret-1",
          tool: { name: "deploy", callId: "c1", isError: false },
          data: { args: { accessToken: "xoxb-secret-token-data-1234" } },
        }),
      );
      await env.backend.insertExperienceRecord(record);

      const results = await env.backend.getRecordsByTool("deploy");
      expect(results.length).toBe(1);
      const stored = JSON.stringify(results[0].record.data);
      expect(stored).not.toContain("xoxb-secret-token-data-1234");
    });
  });

  describe("batch insert with mixed sensitivity", () => {
    it("insertExperienceRecordsBatch handles mix of clean + sensitive", async () => {
      env = await setupIntegrationBackend();
      const records = [
        makeRecord({
          id: "batch-clean",
          content: { topic: "clean record" },
          data: { args: { file: "main.ts" } },
        }),
        makeRecord({
          id: "batch-secret",
          content: { topic: "secret record" },
          data: { args: { password: "hunter2" } },
        }),
        makeRecord({
          id: "batch-token",
          content: { topic: "token record" },
          data: { args: { key: "sk-testkey12345678901234567890abcdef" } },
        }),
      ];
      const inserted = await seedSanitizedRecords(env.backend, records);
      expect(inserted).toBe(3);

      // Verify clean record preserved
      const clean = await env.backend.getRecordById("batch-clean");
      expect((clean!.record.data?.args as Record<string, unknown>)?.file).toBe("main.ts");

      // Verify secret record redacted
      const secret = await env.backend.getRecordById("batch-secret");
      expect(JSON.stringify(secret!.record.data)).toContain("***");
      expect(JSON.stringify(secret!.record.data)).not.toContain("hunter2");

      // Verify token record redacted
      const token = await env.backend.getRecordById("batch-token");
      expect(JSON.stringify(token!.record.data)).not.toContain(
        "sk-testkey12345678901234567890abcdef",
      );
    });

    it("getStats reflects correct counts after batch", async () => {
      env = await setupIntegrationBackend();
      const records = [
        makeRecord({ id: "stats-1", session: { key: "s1" } }),
        makeRecord({ id: "stats-2", session: { key: "s1" } }),
        makeRecord({ id: "stats-3", session: { key: "s2" } }),
      ];
      await seedSanitizedRecords(env.backend, records);

      const stats = await env.backend.getStats();
      expect(stats.recordCount).toBe(3);
      expect(stats.sessionCount).toBe(2);
    });
  });
});
