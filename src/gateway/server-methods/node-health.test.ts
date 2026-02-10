import { afterEach, describe, expect, it } from "vitest";
import { clearNodeHealthFramesForNode, upsertNodeHealthFrame } from "../node-health.js";
import { nodeHealthHandlers } from "./node-health.js";

async function callNodeHealthGet(params: Record<string, unknown>) {
  return await new Promise<{ ok: boolean; payload?: unknown; error?: unknown }>((resolve) => {
    void nodeHealthHandlers["node.health.get"]!({
      req: {
        type: "req",
        id: "t1",
        method: "node.health.get",
        params,
      },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond: (ok, payload, error) => resolve({ ok, payload, error }),
      context: {} as never,
    });
  });
}

describe("node.health.get", () => {
  afterEach(() => {
    clearNodeHealthFramesForNode("n1");
    clearNodeHealthFramesForNode("n2");
  });

  it("returns latest entry per node when nodeId omitted", async () => {
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: 1, data: { seq: 1 } } });
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: 2, data: { seq: 2 } } });
    upsertNodeHealthFrame({ nodeId: "n2", frame: { ts: 3, data: { seq: 9 } } });

    const res = await callNodeHealthGet({});
    expect(res.ok).toBe(true);

    const payload = res.payload as {
      entries?: Array<{ nodeId?: string; frame?: { ts?: number } }>;
    };
    const entries = payload.entries ?? [];
    expect(entries.map((e) => e.nodeId).toSorted()).toEqual(["n1", "n2"]);

    const n1 = entries.find((e) => e.nodeId === "n1");
    expect(n1?.frame?.ts).toBe(2);
  });

  it("returns recent entries for a node when nodeId is provided", async () => {
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: 1, data: { seq: 1 } } });
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: 2, data: { seq: 2 } } });
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: 3, data: { seq: 3 } } });

    const res = await callNodeHealthGet({ nodeId: "n1", limit: 2 });
    expect(res.ok).toBe(true);

    const payload = res.payload as {
      nodeId?: string;
      entries?: Array<{ frame?: { data?: { seq?: number } } }>;
    };
    expect(payload.nodeId).toBe("n1");
    expect(payload.entries?.map((e) => e.frame?.data?.seq)).toEqual([2, 3]);
  });

  it("rejects limit without nodeId", async () => {
    const res = await callNodeHealthGet({ limit: 2 });
    expect(res.ok).toBe(false);
  });

  it("rejects whitespace-only nodeId", async () => {
    const res = await callNodeHealthGet({ nodeId: "   " });
    expect(res.ok).toBe(false);
  });
});
