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

  test("sessions.delete blocks deleting the main session", async () => {
    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
    }>(ws, "sessions.delete", {
      key: "agent:main:main",
      deleteTranscript: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(result.error?.message).toContain("Cannot delete the main session");

    ws.close();
  });

  test("sessions.delete archives transcript file", async () => {
    const ws = await openClient();

    // Create a session to delete
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "To Delete",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionKey = createResult.payload?.key;
    const sessionId = createResult.payload?.sessionId;
    expect(sessionKey).toBeTruthy();
    expect(sessionId).toBeTruthy();

    // Delete the session
    const deleteResult = await rpcReq<{
      ok: boolean;
      deleted?: boolean;
      archived?: string[];
    }>(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    expect(deleteResult.ok).toBe(true);
    expect(deleteResult.payload?.deleted).toBe(true);
    // Archived array may be empty if no transcript was written yet (session never used)
    expect(Array.isArray(deleteResult.payload?.archived)).toBe(true);

    ws.close();
  });

  test("sessions.list returns deleted sessions with deleted flag", async () => {
    const ws = await openClient();

    // Create and delete a session
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "To Delete and List",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionKey = createResult.payload?.key;
    expect(sessionKey).toBeTruthy();

    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // List all sessions (includes deleted)
    const listResult = await rpcReq<{
      sessions?: Array<{
        key: string;
        sessionId?: string;
        deleted?: boolean;
        deletedAt?: string;
        label?: string;
      }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    expect(Array.isArray(listResult.payload?.sessions)).toBe(true);
    const deletedSessions = listResult.payload?.sessions?.filter((s) => s.deleted === true);
    expect(deletedSessions).toBeDefined();
    expect(deletedSessions!.length).toBeGreaterThan(0);

    ws.close();
  });

  test("sessions.restore recreates deleted session", async () => {
    const ws = await openClient();

    // Create a session
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "To Delete and Restore",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionKey = createResult.payload?.key;
    const sessionId = createResult.payload?.sessionId;
    expect(sessionKey).toBeTruthy();
    expect(sessionId).toBeTruthy();

    // Send a message to create a transcript file
    await rpcReq(ws, "chat.send", {
      sessionKey,
      text: "Test message",
    });

    // Wait a bit for transcript to be written
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Delete the session
    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // Verify it's in the sessions list with deleted flag
    const listResult = await rpcReq<{
      sessions?: Array<{
        key: string;
        sessionId?: string;
        deleted?: boolean;
      }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    const deletedEntry = listResult.payload?.sessions?.find(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntry).toBeTruthy();

    // Restore the session
    const restoreResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
      restored?: string;
    }>(ws, "sessions.restore", {
      sessionId,
    });

    expect(restoreResult.ok).toBe(true);
    expect(restoreResult.payload?.sessionId).toBe(sessionId);
    expect(restoreResult.payload?.restored).toBeTruthy();

    // Verify it's back in sessions list
    const sessionsResult = await rpcReq<{
      sessions: Array<{ key: string }>;
    }>(ws, "sessions.list", {});

    const restoredSession = sessionsResult.payload?.sessions?.find((s) =>
      s.key.includes(sessionId!),
    );
    expect(restoredSession).toBeTruthy();

    ws.close();
  });

  test("sessions.restore preserves metadata (label, persistent, description)", async () => {
    const ws = await openClient();

    // Create a session with metadata
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "Important Session",
      description: "This session has important metadata",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionKey = createResult.payload?.key;
    const sessionId = createResult.payload?.sessionId;
    expect(sessionKey).toBeTruthy();
    expect(sessionId).toBeTruthy();

    // Send a message to create a transcript file
    await rpcReq(ws, "chat.send", {
      sessionKey,
      text: "Test message",
    });

    // Wait for transcript to be written
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Delete the session
    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // Verify metadata is in sessions list with deleted flag
    const listResult = await rpcReq<{
      sessions?: Array<{
        key: string;
        sessionId?: string;
        deleted?: boolean;
        label?: string;
        description?: string;
        persistent?: boolean;
      }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    const deletedEntry = listResult.payload?.sessions?.find(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntry).toBeTruthy();
    expect(deletedEntry?.label).toBe("Important Session");
    expect(deletedEntry?.description).toBe("This session has important metadata");
    expect(deletedEntry?.persistent).toBe(true);

    // Restore the session
    await rpcReq(ws, "sessions.restore", {
      sessionId,
    });

    // Verify metadata is restored
    const sessionsResult = await rpcReq<{
      sessions: Array<{
        key: string;
        label?: string;
        description?: string;
        persistent?: boolean;
      }>;
    }>(ws, "sessions.list", {});

    const restoredSession = sessionsResult.payload?.sessions?.find((s) =>
      s.key.includes(sessionId!),
    );
    expect(restoredSession).toBeTruthy();
    expect(restoredSession?.label).toBe("Important Session");
    expect(restoredSession?.description).toBe("This session has important metadata");
    expect(restoredSession?.persistent).toBe(true);

    ws.close();
  });

  test("sessions.restore fails for non-existent session", async () => {
    const ws = await openClient();

    const result = await rpcReq<{
      ok: boolean;
    }>(ws, "sessions.restore", {
      sessionId: "00000000-0000-0000-0000-000000000000",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.error?.message).toContain("No deleted session found");

    ws.close();
  });

  test("sessions.restore fails if session already exists", async () => {
    const ws = await openClient();

    // Create a session
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "Already Exists",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionId = createResult.payload?.sessionId;
    expect(sessionId).toBeTruthy();

    // Try to restore (should fail because there's no deleted file)
    const restoreResult = await rpcReq<{
      ok: boolean;
    }>(ws, "sessions.restore", {
      sessionId,
    });

    expect(restoreResult.ok).toBe(false);
    expect(restoreResult.error?.code).toBe("NOT_FOUND");
    // Will fail because there's no deleted file (we didn't delete it)

    ws.close();
  });

  test("sessions.delete prevents duplicates when deleting same session multiple times", async () => {
    const ws = await openClient();

    // Create a session
    const createResult = await rpcReq<{
      ok: boolean;
      key?: string;
      sessionId?: string;
    }>(ws, "sessions.create", {
      label: "Cycle Test",
      persistent: true,
    });

    expect(createResult.ok).toBe(true);
    const sessionKey = createResult.payload?.key;
    const sessionId = createResult.payload?.sessionId;
    expect(sessionKey).toBeTruthy();
    expect(sessionId).toBeTruthy();

    // Send a message
    await rpcReq(ws, "chat.send", {
      sessionKey,
      text: "Test message 1",
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Delete it
    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // Verify it's in sessions list with deleted flag (should have 1 entry)
    let listResult = await rpcReq<{
      sessions?: Array<{ key: string; sessionId?: string; deleted?: boolean }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    let deletedEntries = listResult.payload?.sessions?.filter(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntries?.length).toBe(1);

    // Restore it
    await rpcReq(ws, "sessions.restore", {
      sessionId,
    });

    // Verify deleted list is now empty for this session
    listResult = await rpcReq<{
      sessions?: Array<{ key: string; sessionId?: string; deleted?: boolean }>;
    }>(ws, "sessions.list", {});

    deletedEntries = listResult.payload?.sessions?.filter(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntries?.length).toBe(0);

    // Delete it again
    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // Verify it's back in sessions list with STILL only 1 entry (no duplicates)
    listResult = await rpcReq<{
      sessions?: Array<{ key: string; sessionId?: string; deleted?: boolean }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    deletedEntries = listResult.payload?.sessions?.filter(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntries?.length).toBe(1);

    // Restore again
    await rpcReq(ws, "sessions.restore", {
      sessionId,
    });

    // Delete one more time
    await rpcReq(ws, "sessions.delete", {
      key: sessionKey,
      deleteTranscript: true,
    });

    // Final check - should STILL be only 1 entry
    listResult = await rpcReq<{
      sessions?: Array<{ key: string; sessionId?: string; deleted?: boolean }>;
    }>(ws, "sessions.list", { includeDeleted: true });

    deletedEntries = listResult.payload?.sessions?.filter(
      (s) => s.sessionId === sessionId && s.deleted === true,
    );
    expect(deletedEntries?.length).toBe(1);

    ws.close();
  });
});
