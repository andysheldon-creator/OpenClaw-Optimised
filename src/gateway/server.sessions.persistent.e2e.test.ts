import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import {
  connectOk,
  getFreePort,
  installGatewayTestHooks,
  rpcReq,
  startGatewayServer,
  testState,
  writeSessionStore,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

let server: Awaited<ReturnType<typeof startGatewayServer>>;
let port = 0;
let previousToken: string | undefined;

beforeAll(async () => {
  previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  port = await getFreePort();
  server = await startGatewayServer(port);
});

afterAll(async () => {
  await server.close();
  if (previousToken === undefined) {
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
  } else {
    process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

const openClient = async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve) => ws.once("open", resolve));
  await connectOk(ws);
  return ws;
};

describe("gateway server sessions - persistent sessions", () => {
  test("sessions.create creates a persistent session", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-create-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    await writeSessionStore({ entries: {} });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      key: string;
      sessionId: string;
      entry: {
        sessionId: string;
        persistent?: boolean;
        userCreated?: boolean;
        label?: string;
        description?: string;
        createdAt?: number;
        updatedAt?: number;
      };
    }>(ws, "sessions.create", {
      label: "Test Session",
      description: "A test session",
      persistent: true,
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.ok).toBe(true);
    expect(result.payload?.key).toMatch(/^agent:main:named:/);
    expect(result.payload?.sessionId).toBeTruthy();
    expect(result.payload?.entry.persistent).toBe(true);
    expect(result.payload?.entry.userCreated).toBe(true);
    expect(result.payload?.entry.label).toBe("Test Session");
    expect(result.payload?.entry.description).toBe("A test session");
    expect(result.payload?.entry.createdAt).toBeTruthy();
    expect(result.payload?.entry.updatedAt).toBeTruthy();

    // Verify session was written to store
    const storeContent = await fs.readFile(storePath, "utf-8");
    const store = JSON.parse(storeContent);
    const sessionEntry = store[result.payload!.key];
    expect(sessionEntry).toBeTruthy();
    expect(sessionEntry.persistent).toBe(true);
    expect(sessionEntry.userCreated).toBe(true);
    expect(sessionEntry.label).toBe("Test Session");

    ws.close();
  });

  test("sessions.create defaults to persistent=true", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-create-default-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    await writeSessionStore({ entries: {} });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      key: string;
      entry: { persistent?: boolean };
    }>(ws, "sessions.create", {
      label: "Default Persistent Session",
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.entry.persistent).toBe(true);

    ws.close();
  });

  test("sessions.create allows persistent=false", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-create-nonpers-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    await writeSessionStore({ entries: {} });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      entry: { persistent?: boolean };
    }>(ws, "sessions.create", {
      label: "Non-Persistent Session",
      persistent: false,
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.entry.persistent).toBe(false);

    ws.close();
  });

  test("sessions.reset blocks resetting persistent sessions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-reset-block-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    const sessionKey = "agent:main:named:test-persistent";
    await writeSessionStore({
      entries: {
        [sessionKey]: {
          sessionId: "sess-persistent",
          updatedAt: Date.now(),
          persistent: true,
          userCreated: true,
          label: "My Persistent Session",
        },
      },
    });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      error?: { code?: string; message?: string };
    }>(ws, "sessions.reset", {
      key: sessionKey,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(result.error?.message).toMatch(/cannot reset persistent session/i);
    expect(result.error?.message).toMatch(/my persistent session/i);

    // Verify session was not modified in store
    const storeContent = await fs.readFile(storePath, "utf-8");
    const store = JSON.parse(storeContent);
    const sessionEntry = store[sessionKey];
    expect(sessionEntry.sessionId).toBe("sess-persistent");
    expect(sessionEntry.persistent).toBe(true);

    ws.close();
  });

  test("sessions.reset allows resetting non-persistent sessions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-reset-allow-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    const sessionKey = "agent:main:main";
    await writeSessionStore({
      entries: {
        [sessionKey]: {
          sessionId: "sess-non-persistent",
          updatedAt: Date.now(),
          persistent: false,
        },
      },
    });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      key: string;
      entry: { sessionId: string };
    }>(ws, "sessions.reset", {
      key: sessionKey,
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.ok).toBe(true);
    expect(result.payload?.key).toBe(sessionKey);
    // Session ID should be different after reset
    expect(result.payload?.entry.sessionId).not.toBe("sess-non-persistent");

    ws.close();
  });

  test("sessions.reset allows resetting sessions without persistent field (backward compat)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-reset-compat-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    const sessionKey = "agent:main:main";
    await writeSessionStore({
      entries: {
        [sessionKey]: {
          sessionId: "sess-old",
          updatedAt: Date.now(),
          // No persistent field - should default to allowing reset
        },
      },
    });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      entry: { sessionId: string };
    }>(ws, "sessions.reset", {
      key: sessionKey,
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.ok).toBe(true);
    expect(result.payload?.entry.sessionId).not.toBe("sess-old");

    ws.close();
  });

  test("sessions.create requires label", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-create-nolabel-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    await writeSessionStore({ entries: {} });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      error?: { code?: string; message?: string };
    }>(ws, "sessions.create", {
      label: "",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(result.error?.message).toMatch(/label|must NOT have fewer than 1 characters/i);

    ws.close();
  });

  test("sessions.create copies settings from basedOn session", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-create-basedon-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    const baseKey = "agent:main:main";
    await writeSessionStore({
      entries: {
        [baseKey]: {
          sessionId: "sess-base",
          updatedAt: Date.now(),
          thinkingLevel: "high",
          verboseLevel: "on",
          reasoningLevel: "stream",
          modelOverride: "claude-opus-4",
        },
      },
    });

    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
      entry: {
        thinkingLevel?: string;
        verboseLevel?: string;
        reasoningLevel?: string;
        modelOverride?: string;
      };
    }>(ws, "sessions.create", {
      label: "Copy of Base",
      basedOn: baseKey,
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.entry.thinkingLevel).toBe("high");
    expect(result.payload?.entry.verboseLevel).toBe("on");
    expect(result.payload?.entry.reasoningLevel).toBe("stream");
    expect(result.payload?.entry.modelOverride).toBe("claude-opus-4");

    ws.close();
  });

  test("sessions.list includes persistent flag", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sessions-list-persistent-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    const persistentKey = "agent:main:named:persistent-1";
    const nonPersistentKey = "agent:main:named:non-persistent-1";

    await writeSessionStore({
      entries: {
        [persistentKey]: {
          sessionId: "sess-pers",
          updatedAt: Date.now(),
          persistent: true,
          userCreated: true,
          label: "Persistent Session",
        },
        [nonPersistentKey]: {
          sessionId: "sess-non",
          updatedAt: Date.now(),
          persistent: false,
          label: "Non-Persistent Session",
        },
      },
    });

    const ws = await openClient();

    const result = await rpcReq<{
      sessions: Array<{
        key: string;
        persistent?: boolean;
        userCreated?: boolean;
        label?: string;
      }>;
    }>(ws, "sessions.list", {});

    expect(result.ok).toBe(true);
    const sessions = result.payload?.sessions ?? [];

    const persistentSession = sessions.find((s) => s.key === persistentKey);
    expect(persistentSession).toBeTruthy();
    expect(persistentSession?.persistent).toBe(true);
    expect(persistentSession?.userCreated).toBe(true);
    expect(persistentSession?.label).toBe("Persistent Session");

    const nonPersistentSession = sessions.find((s) => s.key === nonPersistentKey);
    expect(nonPersistentSession).toBeTruthy();
    expect(nonPersistentSession?.persistent).toBe(false);
    expect(nonPersistentSession?.label).toBe("Non-Persistent Session");

    ws.close();
  });
});
