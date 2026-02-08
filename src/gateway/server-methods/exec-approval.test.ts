import { describe, expect, it, vi } from "vitest";
import { ExecApprovalManager } from "../exec-approval-manager.js";
import { validateExecApprovalRequestParams } from "../protocol/index.js";
import { createExecApprovalHandlers } from "./exec-approval.js";

const noop = () => {};

describe("exec approval handlers", () => {
  describe("ExecApprovalRequestParams validation", () => {
    it("accepts request with resolvedPath omitted", () => {
      const params = {
        command: "echo hi",
        cwd: "/tmp",
        host: "node",
      };
      expect(validateExecApprovalRequestParams(params)).toBe(true);
    });

    it("accepts request with resolvedPath as string", () => {
      const params = {
        command: "echo hi",
        cwd: "/tmp",
        host: "node",
        resolvedPath: "/usr/bin/echo",
      };
      expect(validateExecApprovalRequestParams(params)).toBe(true);
    });

    it("accepts request with resolvedPath as undefined", () => {
      const params = {
        command: "echo hi",
        cwd: "/tmp",
        host: "node",
        resolvedPath: undefined,
      };
      expect(validateExecApprovalRequestParams(params)).toBe(true);
    });

    // Fixed: null is now accepted (Type.Union([Type.String(), Type.Null()]))
    // This matches the calling code in bash-tools.exec.ts which passes null.
    it("accepts request with resolvedPath as null", () => {
      const params = {
        command: "echo hi",
        cwd: "/tmp",
        host: "node",
        resolvedPath: null,
      };
      expect(validateExecApprovalRequestParams(params)).toBe(true);
    });
  });

  it("broadcasts request + resolve", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const broadcasts: Array<{ event: string; payload: unknown }> = [];

    const respond = vi.fn();
    const context = {
      broadcast: (event: string, payload: unknown) => {
        broadcasts.push({ event, payload });
      },
    };

    const requestPromise = handlers["exec.approval.request"]({
      params: {
        command: "echo ok",
        cwd: "/tmp",
        host: "node",
        timeoutMs: 2000,
      },
      respond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    const requested = broadcasts.find((entry) => entry.event === "exec.approval.requested");
    expect(requested).toBeTruthy();
    const id = (requested?.payload as { id?: string })?.id ?? "";
    expect(id).not.toBe("");

    const resolveRespond = vi.fn();
    await handlers["exec.approval.resolve"]({
      params: { id, decision: "allow-once" },
      respond: resolveRespond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.resolve"]
      >[0]["context"],
      client: { connect: { client: { id: "cli", displayName: "CLI" } } },
      req: { id: "req-2", type: "req", method: "exec.approval.resolve" },
      isWebchatConnect: noop,
    });

    await requestPromise;

    expect(resolveRespond).toHaveBeenCalledWith(true, { ok: true }, undefined);
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id, decision: "allow-once" }),
      undefined,
    );
    expect(broadcasts.some((entry) => entry.event === "exec.approval.resolved")).toBe(true);
  });

  it("lists pending approvals", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const broadcasts: Array<{ event: string; payload: unknown }> = [];
    const context = {
      broadcast: (event: string, payload: unknown) => {
        broadcasts.push({ event, payload });
      },
    };

    const requestRespond = vi.fn();
    const requestPromise = handlers["exec.approval.request"]({
      params: {
        command: "echo ok",
        cwd: "/tmp",
        host: "node",
        timeoutMs: 2_000,
      },
      respond: requestRespond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    const pendingRespond = vi.fn();
    await handlers["exec.approval.pending"]({
      params: {},
      respond: pendingRespond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.pending"]
      >[0]["context"],
      client: null,
      req: { id: "req-pending", type: "req", method: "exec.approval.pending" },
      isWebchatConnect: noop,
    });

    expect(pendingRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        nowMs: expect.any(Number),
        pending: [
          expect.objectContaining({
            id: expect.any(String),
            command: "echo ok",
            cwd: "/tmp",
            host: "node",
            waitingMs: expect.any(Number),
            expiresInMs: expect.any(Number),
          }),
        ],
      }),
      undefined,
    );

    const requested = broadcasts.find((entry) => entry.event === "exec.approval.requested");
    const id = (requested?.payload as { id?: string })?.id ?? "";
    expect(id).not.toBe("");

    await handlers["exec.approval.resolve"]({
      params: { id, decision: "allow-once" },
      respond: vi.fn(),
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.resolve"]
      >[0]["context"],
      client: { connect: { client: { id: "cli", displayName: "CLI" } } },
      req: { id: "req-2", type: "req", method: "exec.approval.resolve" },
      isWebchatConnect: noop,
    });
    await requestPromise;
  });

  it("rejects invalid pending params", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const respond = vi.fn();
    await handlers["exec.approval.pending"]({
      params: { extra: true },
      respond,
      context: { broadcast: () => {} } as unknown as Parameters<
        (typeof handlers)["exec.approval.pending"]
      >[0]["context"],
      client: null,
      req: { id: "req-pending", type: "req", method: "exec.approval.pending" },
      isWebchatConnect: noop,
    });
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("invalid exec.approval.pending params"),
      }),
    );
  });

  it("accepts resolve during broadcast", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const respond = vi.fn();
    const resolveRespond = vi.fn();

    const resolveContext = {
      broadcast: () => {},
    };

    const context = {
      broadcast: (event: string, payload: unknown) => {
        if (event !== "exec.approval.requested") {
          return;
        }
        const id = (payload as { id?: string })?.id ?? "";
        void handlers["exec.approval.resolve"]({
          params: { id, decision: "allow-once" },
          respond: resolveRespond,
          context: resolveContext as unknown as Parameters<
            (typeof handlers)["exec.approval.resolve"]
          >[0]["context"],
          client: { connect: { client: { id: "cli", displayName: "CLI" } } },
          req: { id: "req-2", type: "req", method: "exec.approval.resolve" },
          isWebchatConnect: noop,
        });
      },
    };

    await handlers["exec.approval.request"]({
      params: {
        command: "echo ok",
        cwd: "/tmp",
        host: "node",
        timeoutMs: 2000,
      },
      respond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    expect(resolveRespond).toHaveBeenCalledWith(true, { ok: true }, undefined);
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ decision: "allow-once" }),
      undefined,
    );
  });

  it("accepts explicit approval ids", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const broadcasts: Array<{ event: string; payload: unknown }> = [];

    const respond = vi.fn();
    const context = {
      broadcast: (event: string, payload: unknown) => {
        broadcasts.push({ event, payload });
      },
    };

    const requestPromise = handlers["exec.approval.request"]({
      params: {
        id: "approval-123",
        command: "echo ok",
        cwd: "/tmp",
        host: "gateway",
        timeoutMs: 2000,
      },
      respond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    const requested = broadcasts.find((entry) => entry.event === "exec.approval.requested");
    const id = (requested?.payload as { id?: string })?.id ?? "";
    expect(id).toBe("approval-123");

    const resolveRespond = vi.fn();
    await handlers["exec.approval.resolve"]({
      params: { id, decision: "allow-once" },
      respond: resolveRespond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.resolve"]
      >[0]["context"],
      client: { connect: { client: { id: "cli", displayName: "CLI" } } },
      req: { id: "req-2", type: "req", method: "exec.approval.resolve" },
      isWebchatConnect: noop,
    });

    await requestPromise;
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id: "approval-123", decision: "allow-once" }),
      undefined,
    );
  });

  it("rejects duplicate approval ids", async () => {
    const manager = new ExecApprovalManager();
    const handlers = createExecApprovalHandlers(manager);
    const respondA = vi.fn();
    const respondB = vi.fn();
    const broadcasts: Array<{ event: string; payload: unknown }> = [];
    const context = {
      broadcast: (event: string, payload: unknown) => {
        broadcasts.push({ event, payload });
      },
    };

    const requestPromise = handlers["exec.approval.request"]({
      params: {
        id: "dup-1",
        command: "echo ok",
      },
      respond: respondA,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    await handlers["exec.approval.request"]({
      params: {
        id: "dup-1",
        command: "echo again",
      },
      respond: respondB,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.request"]
      >[0]["context"],
      client: null,
      req: { id: "req-2", type: "req", method: "exec.approval.request" },
      isWebchatConnect: noop,
    });

    expect(respondB).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "approval id already pending" }),
    );

    const requested = broadcasts.find((entry) => entry.event === "exec.approval.requested");
    const id = (requested?.payload as { id?: string })?.id ?? "";
    const resolveRespond = vi.fn();
    await handlers["exec.approval.resolve"]({
      params: { id, decision: "deny" },
      respond: resolveRespond,
      context: context as unknown as Parameters<
        (typeof handlers)["exec.approval.resolve"]
      >[0]["context"],
      client: { connect: { client: { id: "cli", displayName: "CLI" } } },
      req: { id: "req-3", type: "req", method: "exec.approval.resolve" },
      isWebchatConnect: noop,
    });

    await requestPromise;
  });
});
