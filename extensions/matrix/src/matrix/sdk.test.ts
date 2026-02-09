import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeMatrixEvent extends EventEmitter {
  private readonly roomId: string;
  private readonly eventId: string;
  private readonly sender: string;
  private readonly type: string;
  private readonly ts: number;
  private readonly content: Record<string, unknown>;
  private readonly stateKey?: string;
  private readonly unsigned?: {
    age?: number;
    redacted_because?: unknown;
  };
  private readonly decryptionFailure: boolean;

  constructor(params: {
    roomId: string;
    eventId: string;
    sender: string;
    type: string;
    ts: number;
    content: Record<string, unknown>;
    stateKey?: string;
    unsigned?: {
      age?: number;
      redacted_because?: unknown;
    };
    decryptionFailure?: boolean;
  }) {
    super();
    this.roomId = params.roomId;
    this.eventId = params.eventId;
    this.sender = params.sender;
    this.type = params.type;
    this.ts = params.ts;
    this.content = params.content;
    this.stateKey = params.stateKey;
    this.unsigned = params.unsigned;
    this.decryptionFailure = params.decryptionFailure === true;
  }

  getRoomId(): string {
    return this.roomId;
  }

  getId(): string {
    return this.eventId;
  }

  getSender(): string {
    return this.sender;
  }

  getType(): string {
    return this.type;
  }

  getTs(): number {
    return this.ts;
  }

  getContent(): Record<string, unknown> {
    return this.content;
  }

  getUnsigned(): { age?: number; redacted_because?: unknown } {
    return this.unsigned ?? {};
  }

  getStateKey(): string | undefined {
    return this.stateKey;
  }

  isDecryptionFailure(): boolean {
    return this.decryptionFailure;
  }
}

type MatrixJsClientStub = EventEmitter & {
  startClient: ReturnType<typeof vi.fn>;
  stopClient: ReturnType<typeof vi.fn>;
  initRustCrypto: ReturnType<typeof vi.fn>;
  getUserId: ReturnType<typeof vi.fn>;
  getDeviceId: ReturnType<typeof vi.fn>;
  getJoinedRooms: ReturnType<typeof vi.fn>;
  getJoinedRoomMembers: ReturnType<typeof vi.fn>;
  getStateEvent: ReturnType<typeof vi.fn>;
  getAccountData: ReturnType<typeof vi.fn>;
  setAccountData: ReturnType<typeof vi.fn>;
  getRoomIdForAlias: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  sendEvent: ReturnType<typeof vi.fn>;
  sendStateEvent: ReturnType<typeof vi.fn>;
  redactEvent: ReturnType<typeof vi.fn>;
  getProfileInfo: ReturnType<typeof vi.fn>;
  joinRoom: ReturnType<typeof vi.fn>;
  mxcUrlToHttp: ReturnType<typeof vi.fn>;
  uploadContent: ReturnType<typeof vi.fn>;
  fetchRoomEvent: ReturnType<typeof vi.fn>;
  sendTyping: ReturnType<typeof vi.fn>;
  getRoom: ReturnType<typeof vi.fn>;
  getRooms: ReturnType<typeof vi.fn>;
  getCrypto: ReturnType<typeof vi.fn>;
  decryptEventIfNeeded: ReturnType<typeof vi.fn>;
};

function createMatrixJsClientStub(): MatrixJsClientStub {
  const client = new EventEmitter() as MatrixJsClientStub;
  client.startClient = vi.fn(async () => {});
  client.stopClient = vi.fn();
  client.initRustCrypto = vi.fn(async () => {});
  client.getUserId = vi.fn(() => "@bot:example.org");
  client.getDeviceId = vi.fn(() => "DEVICE123");
  client.getJoinedRooms = vi.fn(async () => ({ joined_rooms: [] }));
  client.getJoinedRoomMembers = vi.fn(async () => ({ joined: {} }));
  client.getStateEvent = vi.fn(async () => ({}));
  client.getAccountData = vi.fn(() => undefined);
  client.setAccountData = vi.fn(async () => {});
  client.getRoomIdForAlias = vi.fn(async () => ({ room_id: "!resolved:example.org" }));
  client.sendMessage = vi.fn(async () => ({ event_id: "$sent" }));
  client.sendEvent = vi.fn(async () => ({ event_id: "$sent-event" }));
  client.sendStateEvent = vi.fn(async () => ({ event_id: "$state" }));
  client.redactEvent = vi.fn(async () => ({ event_id: "$redact" }));
  client.getProfileInfo = vi.fn(async () => ({}));
  client.joinRoom = vi.fn(async () => ({}));
  client.mxcUrlToHttp = vi.fn(() => null);
  client.uploadContent = vi.fn(async () => ({ content_uri: "mxc://example/file" }));
  client.fetchRoomEvent = vi.fn(async () => ({}));
  client.sendTyping = vi.fn(async () => {});
  client.getRoom = vi.fn(() => ({ hasEncryptionStateEvent: () => false }));
  client.getRooms = vi.fn(() => []);
  client.getCrypto = vi.fn(() => undefined);
  client.decryptEventIfNeeded = vi.fn(async () => {});
  return client;
}

let matrixJsClient = createMatrixJsClientStub();
let lastCreateClientOpts: Record<string, unknown> | null = null;

vi.mock("matrix-js-sdk", () => ({
  ClientEvent: { Event: "event", Room: "Room" },
  MatrixEventEvent: { Decrypted: "decrypted" },
  createClient: vi.fn((opts: Record<string, unknown>) => {
    lastCreateClientOpts = opts;
    return matrixJsClient;
  }),
}));

import { MatrixClient } from "./sdk.js";

describe("MatrixClient request hardening", () => {
  beforeEach(() => {
    matrixJsClient = createMatrixJsClientStub();
    lastCreateClientOpts = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("blocks absolute endpoints unless explicitly allowed", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new MatrixClient("https://matrix.example.org", "token");
    await expect(client.doRequest("GET", "https://matrix.example.org/start")).rejects.toThrow(
      "Absolute Matrix endpoint is blocked by default",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks cross-protocol redirects when absolute endpoints are allowed", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("", {
        status: 302,
        headers: {
          location: "http://evil.example.org/next",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new MatrixClient("https://matrix.example.org", "token");

    await expect(
      client.doRequest("GET", "https://matrix.example.org/start", undefined, undefined, {
        allowAbsoluteEndpoint: true,
      }),
    ).rejects.toThrow("Blocked cross-protocol redirect");
  });

  it("strips authorization when redirect crosses origin", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
      });
      if (calls.length === 1) {
        return new Response("", {
          status: 302,
          headers: { location: "https://cdn.example.org/next" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new MatrixClient("https://matrix.example.org", "token");
    await client.doRequest("GET", "https://matrix.example.org/start", undefined, undefined, {
      allowAbsoluteEndpoint: true,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://matrix.example.org/start");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer token");
    expect(calls[1]?.url).toBe("https://cdn.example.org/next");
    expect(calls[1]?.headers.get("authorization")).toBeNull();
  });

  it("aborts requests after timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_: URL | string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      localTimeoutMs: 25,
    });

    const pending = client.doRequest("GET", "/_matrix/client/v3/account/whoami");
    const assertion = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(30);

    await assertion;
  });
});

describe("MatrixClient event bridge", () => {
  beforeEach(() => {
    matrixJsClient = createMatrixJsClientStub();
    lastCreateClientOpts = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits room.message only after encrypted events decrypt", async () => {
    const client = new MatrixClient("https://matrix.example.org", "token");
    const messageEvents: Array<{ roomId: string; type: string }> = [];

    client.on("room.message", (roomId, event) => {
      messageEvents.push({ roomId, type: event.type });
    });

    await client.start();

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
    });
    const decrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.message",
      ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    });

    matrixJsClient.emit("event", encrypted);
    expect(messageEvents).toHaveLength(0);

    encrypted.emit("decrypted", decrypted);
    // Simulate a second normal event emission from the SDK after decryption.
    matrixJsClient.emit("event", decrypted);
    expect(messageEvents).toEqual([
      {
        roomId: "!room:example.org",
        type: "m.room.message",
      },
    ]);
  });

  it("emits room.failed_decryption when decrypting fails", async () => {
    const client = new MatrixClient("https://matrix.example.org", "token");
    const failed: string[] = [];
    const delivered: string[] = [];

    client.on("room.failed_decryption", (_roomId, _event, error) => {
      failed.push(error.message);
    });
    client.on("room.message", (_roomId, event) => {
      delivered.push(event.type);
    });

    await client.start();

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
    });
    const decrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.message",
      ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    });

    matrixJsClient.emit("event", encrypted);
    encrypted.emit("decrypted", decrypted, new Error("decrypt failed"));

    expect(failed).toEqual(["decrypt failed"]);
    expect(delivered).toHaveLength(0);
  });

  it("retries failed decryption and emits room.message after late key availability", async () => {
    vi.useFakeTimers();
    const client = new MatrixClient("https://matrix.example.org", "token");
    const failed: string[] = [];
    const delivered: string[] = [];

    client.on("room.failed_decryption", (_roomId, _event, error) => {
      failed.push(error.message);
    });
    client.on("room.message", (_roomId, event) => {
      delivered.push(event.type);
    });

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
      decryptionFailure: true,
    });
    const decrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.message",
      ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    });

    matrixJsClient.decryptEventIfNeeded = vi.fn(async () => {
      encrypted.emit("decrypted", decrypted);
    });

    await client.start();
    matrixJsClient.emit("event", encrypted);
    encrypted.emit("decrypted", encrypted, new Error("missing room key"));

    expect(failed).toEqual(["missing room key"]);
    expect(delivered).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_600);

    expect(matrixJsClient.decryptEventIfNeeded).toHaveBeenCalledTimes(1);
    expect(failed).toEqual(["missing room key"]);
    expect(delivered).toEqual(["m.room.message"]);
  });

  it("retries failed decryptions immediately on crypto key update signals", async () => {
    vi.useFakeTimers();
    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
    });
    const failed: string[] = [];
    const delivered: string[] = [];
    const cryptoListeners = new Map<string, (...args: unknown[]) => void>();

    matrixJsClient.getCrypto = vi.fn(() => ({
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        cryptoListeners.set(eventName, listener);
      }),
      bootstrapCrossSigning: vi.fn(async () => {}),
      bootstrapSecretStorage: vi.fn(async () => {}),
      requestOwnUserVerification: vi.fn(async () => null),
    }));

    client.on("room.failed_decryption", (_roomId, _event, error) => {
      failed.push(error.message);
    });
    client.on("room.message", (_roomId, event) => {
      delivered.push(event.type);
    });

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
      decryptionFailure: true,
    });
    const decrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.message",
      ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    });
    matrixJsClient.decryptEventIfNeeded = vi.fn(async () => {
      encrypted.emit("decrypted", decrypted);
    });

    await client.start();
    matrixJsClient.emit("event", encrypted);
    encrypted.emit("decrypted", encrypted, new Error("missing room key"));

    expect(failed).toEqual(["missing room key"]);
    expect(delivered).toHaveLength(0);

    const trigger = cryptoListeners.get("crypto.keyBackupDecryptionKeyCached");
    expect(trigger).toBeTypeOf("function");
    trigger?.();
    await Promise.resolve();

    expect(matrixJsClient.decryptEventIfNeeded).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual(["m.room.message"]);
  });

  it("stops decryption retries after hitting retry cap", async () => {
    vi.useFakeTimers();
    const client = new MatrixClient("https://matrix.example.org", "token");
    const failed: string[] = [];

    client.on("room.failed_decryption", (_roomId, _event, error) => {
      failed.push(error.message);
    });

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
      decryptionFailure: true,
    });

    matrixJsClient.decryptEventIfNeeded = vi.fn(async () => {
      throw new Error("still missing key");
    });

    await client.start();
    matrixJsClient.emit("event", encrypted);
    encrypted.emit("decrypted", encrypted, new Error("missing room key"));

    expect(failed).toEqual(["missing room key"]);

    await vi.advanceTimersByTimeAsync(200_000);
    expect(matrixJsClient.decryptEventIfNeeded).toHaveBeenCalledTimes(8);

    await vi.advanceTimersByTimeAsync(200_000);
    expect(matrixJsClient.decryptEventIfNeeded).toHaveBeenCalledTimes(8);
  });

  it("does not start duplicate retries when crypto signals fire while retry is in-flight", async () => {
    vi.useFakeTimers();
    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
    });
    const delivered: string[] = [];
    const cryptoListeners = new Map<string, (...args: unknown[]) => void>();

    matrixJsClient.getCrypto = vi.fn(() => ({
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        cryptoListeners.set(eventName, listener);
      }),
      bootstrapCrossSigning: vi.fn(async () => {}),
      bootstrapSecretStorage: vi.fn(async () => {}),
      requestOwnUserVerification: vi.fn(async () => null),
    }));

    client.on("room.message", (_roomId, event) => {
      delivered.push(event.type);
    });

    const encrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.encrypted",
      ts: Date.now(),
      content: {},
      decryptionFailure: true,
    });
    const decrypted = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$event",
      sender: "@alice:example.org",
      type: "m.room.message",
      ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    });

    let releaseRetry: (() => void) | null = null;
    matrixJsClient.decryptEventIfNeeded = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          releaseRetry = () => {
            encrypted.emit("decrypted", decrypted);
            resolve();
          };
        }),
    );

    await client.start();
    matrixJsClient.emit("event", encrypted);
    encrypted.emit("decrypted", encrypted, new Error("missing room key"));

    const trigger = cryptoListeners.get("crypto.keyBackupDecryptionKeyCached");
    expect(trigger).toBeTypeOf("function");
    trigger?.();
    trigger?.();
    await Promise.resolve();

    expect(matrixJsClient.decryptEventIfNeeded).toHaveBeenCalledTimes(1);
    releaseRetry?.();
    await Promise.resolve();
    expect(delivered).toEqual(["m.room.message"]);
  });

  it("emits room.invite when a membership invite targets the current user", async () => {
    const client = new MatrixClient("https://matrix.example.org", "token");
    const invites: string[] = [];

    client.on("room.invite", (roomId) => {
      invites.push(roomId);
    });

    await client.start();

    const inviteMembership = new FakeMatrixEvent({
      roomId: "!room:example.org",
      eventId: "$invite",
      sender: "@alice:example.org",
      type: "m.room.member",
      ts: Date.now(),
      stateKey: "@bot:example.org",
      content: {
        membership: "invite",
      },
    });

    matrixJsClient.emit("event", inviteMembership);

    expect(invites).toEqual(["!room:example.org"]);
  });

  it("emits room.invite when SDK emits Room event with invite membership", async () => {
    const client = new MatrixClient("https://matrix.example.org", "token");
    const invites: string[] = [];
    client.on("room.invite", (roomId) => {
      invites.push(roomId);
    });

    await client.start();

    matrixJsClient.emit("Room", {
      roomId: "!invite:example.org",
      getMyMembership: () => "invite",
    });

    expect(invites).toEqual(["!invite:example.org"]);
  });

  it("replays outstanding invite rooms at startup", async () => {
    matrixJsClient.getRooms = vi.fn(() => [
      {
        roomId: "!pending:example.org",
        getMyMembership: () => "invite",
      },
      {
        roomId: "!joined:example.org",
        getMyMembership: () => "join",
      },
    ]);

    const client = new MatrixClient("https://matrix.example.org", "token");
    const invites: string[] = [];
    client.on("room.invite", (roomId) => {
      invites.push(roomId);
    });

    await client.start();

    expect(invites).toEqual(["!pending:example.org"]);
  });
});

describe("MatrixClient crypto bootstrapping", () => {
  beforeEach(() => {
    matrixJsClient = createMatrixJsClientStub();
    lastCreateClientOpts = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("passes cryptoDatabasePrefix into initRustCrypto", async () => {
    matrixJsClient.getCrypto = vi.fn(() => undefined);

    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
      cryptoDatabasePrefix: "openclaw-matrix-test",
    });

    await client.start();

    expect(matrixJsClient.initRustCrypto).toHaveBeenCalledWith({
      cryptoDatabasePrefix: "openclaw-matrix-test",
    });
  });

  it("bootstraps cross-signing with setupNewCrossSigning enabled", async () => {
    const bootstrapCrossSigning = vi.fn(async () => {});
    matrixJsClient.getCrypto = vi.fn(() => ({
      on: vi.fn(),
      bootstrapCrossSigning,
      bootstrapSecretStorage: vi.fn(async () => {}),
      requestOwnUserVerification: vi.fn(async () => null),
    }));

    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
    });

    await client.start();

    expect(bootstrapCrossSigning).toHaveBeenCalledWith(
      expect.objectContaining({
        authUploadDeviceSigningKeys: expect.any(Function),
      }),
    );
  });

  it("provides secret storage callbacks and resolves stored recovery key", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-sdk-test-"));
    const recoveryKeyPath = path.join(tmpDir, "recovery-key.json");
    const privateKeyBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
    fs.writeFileSync(
      recoveryKeyPath,
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        keyId: "SSSSKEY",
        privateKeyBase64,
      }),
      "utf8",
    );

    new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
      recoveryKeyPath,
    });

    const callbacks = (lastCreateClientOpts?.cryptoCallbacks ?? null) as {
      getSecretStorageKey?: (
        params: { keys: Record<string, unknown> },
        name: string,
      ) => Promise<[string, Uint8Array] | null>;
    } | null;
    expect(callbacks?.getSecretStorageKey).toBeTypeOf("function");

    const resolved = await callbacks?.getSecretStorageKey?.(
      { keys: { SSSSKEY: { algorithm: "m.secret_storage.v1.aes-hmac-sha2" } } },
      "m.cross_signing.master",
    );
    expect(resolved?.[0]).toBe("SSSSKEY");
    expect(Array.from(resolved?.[1] ?? [])).toEqual([1, 2, 3, 4]);
  });

  it("schedules periodic crypto snapshot persistence with fake timers", async () => {
    vi.useFakeTimers();
    const databasesSpy = vi.spyOn(indexedDB, "databases").mockResolvedValue([]);

    const client = new MatrixClient("https://matrix.example.org", "token", undefined, undefined, {
      encryption: true,
      idbSnapshotPath: path.join(os.tmpdir(), "matrix-idb-interval.json"),
      cryptoDatabasePrefix: "openclaw-matrix-interval",
    });

    await client.start();
    const callsAfterStart = databasesSpy.mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(databasesSpy.mock.calls.length).toBeGreaterThan(callsAfterStart);

    client.stop();
    const callsAfterStop = databasesSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(databasesSpy.mock.calls.length).toBe(callsAfterStop);
  });
});
