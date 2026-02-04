import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createGitHubWebhookHandler, type GitHubWebhookConfig } from "./webhook-handler.js";
import crypto from "node:crypto";

// Mock HTTP request/response
function createMockRequest(overrides?: Partial<IncomingMessage>): IncomingMessage {
  const chunks: Buffer[] = [];
  return {
    url: "/github/webhook",
    method: "POST",
    headers: {},
    on: vi.fn((event: string, handler: Function) => {
      if (event === "end") {
        setTimeout(() => handler(), 0);
      }
      return this;
    }),
    ...overrides,
  } as unknown as IncomingMessage;
}

function createMockResponse(): ServerResponse {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = "";

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
    getStatusCode: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  } as unknown as ServerResponse;
}

// Create request with body
function createRequestWithBody(body: unknown, headers?: Record<string, string>): IncomingMessage {
  const bodyStr = JSON.stringify(body);
  const chunks = [Buffer.from(bodyStr)];
  let dataHandlers: Array<(chunk: Buffer) => void> = [];
  let endHandlers: Array<() => void> = [];

  return {
    url: "/github/webhook",
    method: "POST",
    headers: headers || {},
    on: vi.fn((event: string, handler: Function) => {
      if (event === "data") {
        dataHandlers.push(handler as (chunk: Buffer) => void);
        setTimeout(() => {
          for (const chunk of chunks) {
            for (const h of dataHandlers) h(chunk);
          }
        }, 0);
      } else if (event === "end") {
        endHandlers.push(handler as () => void);
        setTimeout(() => {
          for (const h of endHandlers) h();
        }, 10);
      }
      return this;
    }),
  } as unknown as IncomingMessage;
}

// Compute GitHub signature
function computeSignature(secret: string, payload: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

describe("GitHub Webhook Handler", () => {
  let mockConfig: GitHubWebhookConfig;
  let mockDispatchAgent: ReturnType<typeof vi.fn>;
  let getConfig: () => GitHubWebhookConfig | null;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      secret: "test-secret-123",
      path: "/github/webhook",
      agents: {
        reviewer: "agent-reviewer",
        author: "agent-author",
        autoMerge: false,
      },
      events: {
        pullRequest: true,
        pullRequestReview: true,
        checkSuite: true,
      },
    };

    mockDispatchAgent = vi.fn();
    getConfig = vi.fn(() => mockConfig);
  });

  describe("Configuration", () => {
    it("should return false if webhook is not enabled", async () => {
      getConfig = vi.fn(() => null);
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const req = createMockRequest();
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(false);
    });

    it("should return false if path does not match", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const req = createMockRequest({ url: "/wrong/path" });
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(false);
    });

    it("should reject non-POST requests", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect((res as any).statusCode).toBe(405);
    });
  });

  describe("Signature Verification", () => {
    it("should reject request with invalid signature", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = { action: "opened", number: 1 };
      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=invalid",
      });
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect((res as any).statusCode).toBe(401);
    });

    it("should accept request with valid signature", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          number: 42,
          title: "Test PR",
          body: "Test body",
          state: "open" as const,
          html_url: "https://github.com/owner/repo/pull/42",
          user: { login: "testuser", id: 123 },
          head: { ref: "feature", sha: "abc123" },
          base: { ref: "main", sha: "def456" },
          merged: false,
          mergeable: true,
          mergeable_state: "clean",
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
        sender: { login: "testuser", id: 123 },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = computeSignature("test-secret-123", payloadStr);

      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request",
        "x-hub-signature-256": signature,
      });
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect((res as any).statusCode).toBe(200);
    });

    it("should accept request without signature if secret is not configured", async () => {
      mockConfig.secret = undefined;
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          number: 42,
          title: "Test PR",
          body: "Test body",
          state: "open" as const,
          html_url: "https://github.com/owner/repo/pull/42",
          user: { login: "testuser", id: 123 },
          head: { ref: "feature", sha: "abc123" },
          base: { ref: "main", sha: "def456" },
          merged: false,
          mergeable: true,
          mergeable_state: "clean",
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
        sender: { login: "testuser", id: 123 },
      };

      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request",
      });
      const res = createMockResponse();

      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect((res as any).statusCode).toBe(200);
    });
  });

  describe("Pull Request Events", () => {
    it("should dispatch to reviewer agent when PR is opened", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          number: 42,
          title: "Add new feature",
          body: "This adds a new feature",
          state: "open" as const,
          html_url: "https://github.com/owner/repo/pull/42",
          user: { login: "contributor", id: 123 },
          head: { ref: "feature-branch", sha: "abc123" },
          base: { ref: "main", sha: "def456" },
          merged: false,
          mergeable: true,
          mergeable_state: "clean",
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
        sender: { login: "contributor", id: 123 },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = computeSignature("test-secret-123", payloadStr);

      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request",
        "x-hub-signature-256": signature,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(mockDispatchAgent).toHaveBeenCalledWith(
        "agent-reviewer",
        expect.stringContaining("New PR #42 needs review"),
        expect.objectContaining({
          event: "github.pull_request",
          action: "opened",
          prNumber: 42,
        }),
      );
    });

    it("should not dispatch if reviewer agent is not configured", async () => {
      mockConfig.agents.reviewer = undefined;
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "opened",
        number: 42,
        pull_request: {
          id: 1,
          number: 42,
          title: "Test PR",
          body: "",
          state: "open" as const,
          html_url: "https://github.com/owner/repo/pull/42",
          user: { login: "testuser", id: 123 },
          head: { ref: "feature", sha: "abc123" },
          base: { ref: "main", sha: "def456" },
          merged: false,
          mergeable: true,
          mergeable_state: "clean",
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
        sender: { login: "testuser", id: 123 },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = computeSignature("test-secret-123", payloadStr);

      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request",
        "x-hub-signature-256": signature,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(mockDispatchAgent).not.toHaveBeenCalled();
    });
  });

  describe("Pull Request Review Events", () => {
    it("should dispatch to author agent when PR is approved", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "submitted",
        review: {
          id: 1,
          user: { login: "reviewer-user" },
          body: "LGTM!",
          state: "approved" as const,
          html_url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
        },
        pull_request: {
          id: 1,
          number: 42,
          title: "Add feature",
          body: "",
          state: "open" as const,
          html_url: "https://github.com/owner/repo/pull/42",
          user: { login: "author-user", id: 456 },
          head: { ref: "feature", sha: "abc123" },
          base: { ref: "main", sha: "def456" },
          merged: false,
          mergeable: true,
          mergeable_state: "clean",
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = computeSignature("test-secret-123", payloadStr);

      const req = createRequestWithBody(payload, {
        "x-github-event": "pull_request_review",
        "x-hub-signature-256": signature,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(mockDispatchAgent).toHaveBeenCalledWith(
        "agent-author",
        expect.stringContaining("approved your PR #42"),
        expect.objectContaining({
          event: "github.pull_request_review",
          action: "submitted",
          reviewState: "approved",
        }),
      );
    });
  });

  describe("Check Suite Events", () => {
    it("should dispatch to reviewer when CI passes", async () => {
      const handler = createGitHubWebhookHandler({ getConfig, dispatchAgent: mockDispatchAgent });

      const payload = {
        action: "completed",
        check_suite: {
          id: 1,
          status: "completed" as const,
          conclusion: "success" as const,
          head_branch: "feature",
          head_sha: "abc123",
          pull_requests: [
            {
              number: 42,
              head: { ref: "feature", sha: "abc123" },
              base: { ref: "main", sha: "def456" },
            },
          ],
        },
        repository: {
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = computeSignature("test-secret-123", payloadStr);

      const req = createRequestWithBody(payload, {
        "x-github-event": "check_suite",
        "x-hub-signature-256": signature,
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(mockDispatchAgent).toHaveBeenCalledWith(
        "agent-reviewer",
        expect.stringContaining("CI checks passed for PR #42"),
        expect.objectContaining({
          event: "github.check_suite",
          checkStatus: "success",
        }),
      );
    });
  });
});
