import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock modules before imports
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

let testWorkspaceRoot: string;

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: vi.fn(() => testWorkspaceRoot),
}));

// Now import after mocks are set up
const { worktreeHandlers } = await import("./worktree.js");
import type { GatewayRequestHandlerOptions } from "./types.js";

describe("worktree handlers", () => {
  let mockContext: GatewayRequestHandlerOptions["context"];
  let mockClient: GatewayRequestHandlerOptions["client"];

  beforeEach(async () => {
    // Create a temporary workspace for testing
    testWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-test-"));

    // Mock context (minimal required fields)
    mockContext = {} as GatewayRequestHandlerOptions["context"];

    // Mock client
    mockClient = {
      connect: { role: "operator", scopes: ["operator.write"] },
    };
  });

  afterEach(async () => {
    // Clean up test workspace
    await fs.rm(testWorkspaceRoot, { recursive: true, force: true });
  });

  describe("worktree.list", () => {
    it("lists files in workspace root", async () => {
      // Create some test files
      await fs.writeFile(path.join(testWorkspaceRoot, "test.txt"), "content");
      await fs.mkdir(path.join(testWorkspaceRoot, "subdir"));

      let responseOk: boolean | undefined;
      let responsePayload: unknown;

      await worktreeHandlers["worktree.list"]({
        req: { id: "test", method: "worktree.list", params: { agentId: "test-agent" } },
        params: { agentId: "test-agent", path: "/" },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok, payload) => {
          responseOk = ok;
          responsePayload = payload;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);
      expect(responsePayload).toMatchObject({
        path: expect.any(String),
        entries: expect.arrayContaining([
          expect.objectContaining({ name: "test.txt", kind: "file" }),
          expect.objectContaining({ name: "subdir", kind: "dir" }),
        ]),
      });
    });

    it("returns error for invalid params", async () => {
      let responseOk: boolean | undefined;
      let responseError: unknown;

      await worktreeHandlers["worktree.list"]({
        req: { id: "test", method: "worktree.list", params: {} },
        params: {},
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok, _payload, error) => {
          responseOk = ok;
          responseError = error;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(false);
      expect(responseError).toMatchObject({
        code: "INVALID_REQUEST",
        message: expect.stringContaining("invalid worktree.list params"),
      });
    });
  });

  describe("worktree.read", () => {
    it("reads file content", async () => {
      const content = "Hello, world!";
      await fs.writeFile(path.join(testWorkspaceRoot, "test.txt"), content);

      let responseOk: boolean | undefined;
      let responsePayload: unknown;

      await worktreeHandlers["worktree.read"]({
        req: {
          id: "test",
          method: "worktree.read",
          params: { agentId: "test-agent", path: "test.txt" },
        },
        params: { agentId: "test-agent", path: "test.txt" },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok, payload) => {
          responseOk = ok;
          responsePayload = payload;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);
      expect(responsePayload).toMatchObject({
        content,
        encoding: "utf8",
        sizeBytes: content.length,
      });
    });
  });

  describe("worktree.write", () => {
    it("creates new file", async () => {
      const content = "New file content";

      let responseOk: boolean | undefined;
      let responsePayload: unknown;

      await worktreeHandlers["worktree.write"]({
        req: {
          id: "test",
          method: "worktree.write",
          params: { agentId: "test-agent", path: "new.txt", content },
        },
        params: { agentId: "test-agent", path: "new.txt", content },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok, payload) => {
          responseOk = ok;
          responsePayload = payload;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);
      expect(responsePayload).toMatchObject({
        created: true,
        sizeBytes: content.length,
      });

      // Verify file was created
      const written = await fs.readFile(path.join(testWorkspaceRoot, "new.txt"), "utf8");
      expect(written).toBe(content);
    });
  });

  describe("worktree.delete", () => {
    it("deletes file", async () => {
      await fs.writeFile(path.join(testWorkspaceRoot, "delete-me.txt"), "content");

      let responseOk: boolean | undefined;

      await worktreeHandlers["worktree.delete"]({
        req: {
          id: "test",
          method: "worktree.delete",
          params: { agentId: "test-agent", path: "delete-me.txt" },
        },
        params: { agentId: "test-agent", path: "delete-me.txt" },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok) => {
          responseOk = ok;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);

      // Verify file was deleted
      await expect(fs.access(path.join(testWorkspaceRoot, "delete-me.txt"))).rejects.toThrow();
    });
  });

  describe("worktree.mkdir", () => {
    it("creates directory", async () => {
      let responseOk: boolean | undefined;

      await worktreeHandlers["worktree.mkdir"]({
        req: {
          id: "test",
          method: "worktree.mkdir",
          params: { agentId: "test-agent", path: "newdir" },
        },
        params: { agentId: "test-agent", path: "newdir" },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok) => {
          responseOk = ok;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);

      // Verify directory was created
      const stats = await fs.stat(path.join(testWorkspaceRoot, "newdir"));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("worktree.move", () => {
    it("moves file", async () => {
      await fs.writeFile(path.join(testWorkspaceRoot, "source.txt"), "content");

      let responseOk: boolean | undefined;

      await worktreeHandlers["worktree.move"]({
        req: {
          id: "test",
          method: "worktree.move",
          params: { agentId: "test-agent", fromPath: "source.txt", toPath: "dest.txt" },
        },
        params: { agentId: "test-agent", fromPath: "source.txt", toPath: "dest.txt" },
        client: mockClient,
        isWebchatConnect: () => false,
        respond: (ok) => {
          responseOk = ok;
        },
        context: mockContext,
      });

      expect(responseOk).toBe(true);

      // Verify source doesn't exist and destination does
      await expect(fs.access(path.join(testWorkspaceRoot, "source.txt"))).rejects.toThrow();
      const content = await fs.readFile(path.join(testWorkspaceRoot, "dest.txt"), "utf8");
      expect(content).toBe("content");
    });
  });
});
