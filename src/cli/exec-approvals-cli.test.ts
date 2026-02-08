import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const callGatewayFromCli = vi.fn(async (method: string, _opts: unknown, params?: unknown) => {
  if (method === "exec.approval.pending") {
    return {
      nowMs: 1_700_000_000_000,
      pending: [
        {
          id: "approval-1",
          command: "cat << 'EOF' && sleep 1",
          createdAtMs: 1_699_999_999_000,
          expiresAtMs: 1_700_000_060_000,
          waitingMs: 1_000,
          expiresInMs: 60_000,
          agentId: "main",
        },
      ],
    };
  }
  if (method.endsWith(".get")) {
    return {
      path: "/tmp/exec-approvals.json",
      exists: true,
      hash: "hash-1",
      file: { version: 1, agents: {} },
    };
  }
  return { method, params };
});

const runtimeLogs: string[] = [];
const runtimeErrors: string[] = [];
const defaultRuntime = {
  log: (msg: string) => runtimeLogs.push(msg),
  error: (msg: string) => runtimeErrors.push(msg),
  exit: (code: number) => {
    throw new Error(`__exit__:${code}`);
  },
};

const localSnapshot = {
  path: "/tmp/local-exec-approvals.json",
  exists: true,
  raw: "{}",
  hash: "hash-local",
  file: { version: 1, agents: {} },
};

vi.mock("./gateway-rpc.js", () => ({
  callGatewayFromCli: (method: string, opts: unknown, params?: unknown) =>
    callGatewayFromCli(method, opts, params),
}));

vi.mock("./nodes-cli/rpc.js", async () => {
  const actual = await vi.importActual<typeof import("./nodes-cli/rpc.js")>("./nodes-cli/rpc.js");
  return {
    ...actual,
    resolveNodeId: vi.fn(async () => "node-1"),
  };
});

vi.mock("../runtime.js", () => ({
  defaultRuntime,
}));

vi.mock("../infra/exec-approvals.js", async () => {
  const actual = await vi.importActual<typeof import("../infra/exec-approvals.js")>(
    "../infra/exec-approvals.js",
  );
  return {
    ...actual,
    readExecApprovalsSnapshot: () => localSnapshot,
    saveExecApprovals: vi.fn(),
  };
});

describe("exec approvals CLI", () => {
  it("loads local approvals by default", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "get"], { from: "user" });

    expect(callGatewayFromCli).not.toHaveBeenCalled();
    expect(runtimeErrors).toHaveLength(0);
  });

  it("loads gateway approvals when --gateway is set", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "get", "--gateway"], { from: "user" });

    expect(callGatewayFromCli).toHaveBeenCalledWith("exec.approvals.get", expect.anything(), {});
    expect(runtimeErrors).toHaveLength(0);
  });

  it("loads node approvals when --node is set", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "get", "--node", "macbook"], { from: "user" });

    expect(callGatewayFromCli).toHaveBeenCalledWith("exec.approvals.node.get", expect.anything(), {
      nodeId: "node-1",
    });
    expect(runtimeErrors).toHaveLength(0);
  });

  it("defaults allowlist add to wildcard agent", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const execApprovals = await import("../infra/exec-approvals.js");
    const saveExecApprovals = vi.mocked(execApprovals.saveExecApprovals);
    saveExecApprovals.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "allowlist", "add", "/usr/bin/uname"], { from: "user" });

    expect(callGatewayFromCli).not.toHaveBeenCalledWith(
      "exec.approvals.set",
      expect.anything(),
      {},
    );
    expect(saveExecApprovals).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.objectContaining({
          "*": expect.anything(),
        }),
      }),
    );
  });

  it("lists pending approvals", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "pending"], { from: "user" });

    expect(callGatewayFromCli).toHaveBeenCalledWith("exec.approval.pending", expect.anything(), {});
    expect(runtimeErrors).toHaveLength(0);
    expect(runtimeLogs.join("\n")).toContain("approval-1");
    expect(runtimeLogs.join("\n")).toContain("main");
  });

  it("outputs pending approvals as json", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGatewayFromCli.mockClear();

    const { registerExecApprovalsCli } = await import("./exec-approvals-cli.js");
    const program = new Command();
    program.exitOverride();
    registerExecApprovalsCli(program);

    await program.parseAsync(["approvals", "pending", "--json"], { from: "user" });

    expect(callGatewayFromCli).toHaveBeenCalledWith("exec.approval.pending", expect.anything(), {});
    expect(runtimeErrors).toHaveLength(0);
    const parsed = JSON.parse(runtimeLogs.at(-1) ?? "{}") as { pending?: unknown[] };
    expect(Array.isArray(parsed.pending)).toBe(true);
    expect(parsed.pending?.[0]).toEqual(expect.objectContaining({ id: "approval-1" }));
  });
});
