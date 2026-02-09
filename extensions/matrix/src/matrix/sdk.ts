// Polyfill IndexedDB for WASM crypto in Node.js
import "fake-indexeddb/auto";
import {
  ClientEvent,
  createClient as createMatrixJsClient,
  type MatrixClient as MatrixJsClient,
  type MatrixEvent,
} from "matrix-js-sdk";
import { VerificationMethod } from "matrix-js-sdk/lib/types.js";
import { EventEmitter } from "node:events";
import type {
  MatrixClientEventMap,
  MatrixCryptoBootstrapApi,
  MatrixRawEvent,
  MessageEventContent,
} from "./sdk/types.js";
import { MatrixCryptoBootstrapper } from "./sdk/crypto-bootstrap.js";
import { createMatrixCryptoFacade, type MatrixCryptoFacade } from "./sdk/crypto-facade.js";
import { MatrixDecryptBridge } from "./sdk/decrypt-bridge.js";
import { matrixEventToRaw, parseMxc } from "./sdk/event-helpers.js";
import { MatrixAuthedHttpClient } from "./sdk/http-client.js";
import { persistIdbToDisk, restoreIdbFromDisk } from "./sdk/idb-persistence.js";
import { ConsoleLogger, LogService, noop } from "./sdk/logger.js";
import { MatrixRecoveryKeyStore } from "./sdk/recovery-key-store.js";
import { type HttpMethod, type QueryParams } from "./sdk/transport.js";
import { MatrixVerificationManager } from "./sdk/verification-manager.js";

export { ConsoleLogger, LogService };
export type {
  DimensionalFileInfo,
  FileWithThumbnailInfo,
  TimedFileInfo,
  VideoFileInfo,
} from "./sdk/types.js";
export type {
  EncryptedFile,
  LocationMessageEventContent,
  MessageEventContent,
  TextualMessageEventContent,
} from "./sdk/types.js";

export class MatrixClient {
  private readonly client: MatrixJsClient;
  private readonly emitter = new EventEmitter();
  private readonly httpClient: MatrixAuthedHttpClient;
  private readonly localTimeoutMs: number;
  private readonly initialSyncLimit?: number;
  private readonly encryptionEnabled: boolean;
  private readonly idbSnapshotPath?: string;
  private readonly cryptoDatabasePrefix?: string;
  private bridgeRegistered = false;
  private started = false;
  private selfUserId: string | null;
  private readonly dmRoomIds = new Set<string>();
  private cryptoInitialized = false;
  private readonly decryptBridge: MatrixDecryptBridge<MatrixRawEvent>;
  private readonly verificationManager = new MatrixVerificationManager();
  private readonly recoveryKeyStore: MatrixRecoveryKeyStore;
  private readonly cryptoBootstrapper: MatrixCryptoBootstrapper<MatrixRawEvent>;

  readonly dms = {
    update: async (): Promise<void> => {
      await this.refreshDmCache();
    },
    isDm: (roomId: string): boolean => this.dmRoomIds.has(roomId),
  };

  crypto?: MatrixCryptoFacade;

  constructor(
    homeserver: string,
    accessToken: string,
    _storage?: unknown,
    _cryptoStorage?: unknown,
    opts: {
      userId?: string;
      password?: string;
      deviceId?: string;
      localTimeoutMs?: number;
      encryption?: boolean;
      initialSyncLimit?: number;
      recoveryKeyPath?: string;
      idbSnapshotPath?: string;
      cryptoDatabasePrefix?: string;
    } = {},
  ) {
    this.httpClient = new MatrixAuthedHttpClient(homeserver, accessToken);
    this.localTimeoutMs = Math.max(1, opts.localTimeoutMs ?? 60_000);
    this.initialSyncLimit = opts.initialSyncLimit;
    this.encryptionEnabled = opts.encryption === true;
    this.idbSnapshotPath = opts.idbSnapshotPath;
    this.cryptoDatabasePrefix = opts.cryptoDatabasePrefix;
    this.selfUserId = opts.userId?.trim() || null;
    this.recoveryKeyStore = new MatrixRecoveryKeyStore(opts.recoveryKeyPath);
    const cryptoCallbacks = this.encryptionEnabled
      ? this.recoveryKeyStore.buildCryptoCallbacks()
      : undefined;
    this.client = createMatrixJsClient({
      baseUrl: homeserver,
      accessToken,
      userId: opts.userId,
      deviceId: opts.deviceId,
      localTimeoutMs: this.localTimeoutMs,
      cryptoCallbacks,
      verificationMethods: [
        VerificationMethod.Sas,
        VerificationMethod.ShowQrCode,
        VerificationMethod.ScanQrCode,
        VerificationMethod.Reciprocate,
      ],
    });
    this.decryptBridge = new MatrixDecryptBridge<MatrixRawEvent>({
      client: this.client,
      toRaw: (event) => matrixEventToRaw(event),
      emitDecryptedEvent: (roomId, event) => {
        this.emitter.emit("room.decrypted_event", roomId, event);
      },
      emitMessage: (roomId, event) => {
        this.emitter.emit("room.message", roomId, event);
      },
      emitFailedDecryption: (roomId, event, error) => {
        this.emitter.emit("room.failed_decryption", roomId, event, error);
      },
    });
    this.cryptoBootstrapper = new MatrixCryptoBootstrapper<MatrixRawEvent>({
      getUserId: () => this.getUserId(),
      getPassword: () => opts.password,
      getDeviceId: () => this.client.getDeviceId(),
      verificationManager: this.verificationManager,
      recoveryKeyStore: this.recoveryKeyStore,
      decryptBridge: this.decryptBridge,
    });

    if (this.encryptionEnabled) {
      this.crypto = createMatrixCryptoFacade({
        client: this.client,
        verificationManager: this.verificationManager,
        recoveryKeyStore: this.recoveryKeyStore,
        getRoomStateEvent: (roomId, eventType, stateKey = "") =>
          this.getRoomStateEvent(roomId, eventType, stateKey),
        downloadContent: (mxcUrl) => this.downloadContent(mxcUrl),
      });
    }
  }

  on<TEvent extends keyof MatrixClientEventMap>(
    eventName: TEvent,
    listener: (...args: MatrixClientEventMap[TEvent]) => void,
  ): this;
  on(eventName: string, listener: (...args: unknown[]) => void): this;
  on(eventName: string, listener: (...args: unknown[]) => void): this {
    this.emitter.on(eventName, listener as (...args: unknown[]) => void);
    return this;
  }

  off<TEvent extends keyof MatrixClientEventMap>(
    eventName: TEvent,
    listener: (...args: MatrixClientEventMap[TEvent]) => void,
  ): this;
  off(eventName: string, listener: (...args: unknown[]) => void): this;
  off(eventName: string, listener: (...args: unknown[]) => void): this {
    this.emitter.off(eventName, listener as (...args: unknown[]) => void);
    return this;
  }

  private idbPersistTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.registerBridge();
    await this.initializeCryptoIfNeeded();

    await this.client.startClient({
      initialSyncLimit: this.initialSyncLimit,
    });
    this.started = true;
    this.emitOutstandingInviteEvents();
    await this.refreshDmCache().catch(noop);
  }

  stop(): void {
    if (this.idbPersistTimer) {
      clearInterval(this.idbPersistTimer);
      this.idbPersistTimer = null;
    }
    this.decryptBridge.stop();
    // Final persist on shutdown
    persistIdbToDisk({
      snapshotPath: this.idbSnapshotPath,
      databasePrefix: this.cryptoDatabasePrefix,
    }).catch(noop);
    this.client.stopClient();
    this.started = false;
  }

  private async initializeCryptoIfNeeded(): Promise<void> {
    if (!this.encryptionEnabled || this.cryptoInitialized) {
      return;
    }

    // Restore persisted IndexedDB crypto store before initializing WASM crypto.
    await restoreIdbFromDisk(this.idbSnapshotPath);

    try {
      await this.client.initRustCrypto({
        cryptoDatabasePrefix: this.cryptoDatabasePrefix,
      });
      this.cryptoInitialized = true;

      const crypto = this.client.getCrypto() as MatrixCryptoBootstrapApi | undefined;
      if (crypto) {
        await this.cryptoBootstrapper.bootstrap(crypto);
      }

      // Persist the crypto store after successful init (captures fresh keys on first run).
      await persistIdbToDisk({
        snapshotPath: this.idbSnapshotPath,
        databasePrefix: this.cryptoDatabasePrefix,
      });

      // Periodically persist to capture new Olm sessions and room keys.
      this.idbPersistTimer = setInterval(() => {
        persistIdbToDisk({
          snapshotPath: this.idbSnapshotPath,
          databasePrefix: this.cryptoDatabasePrefix,
        }).catch(noop);
      }, 60_000);
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to initialize rust crypto:", err);
    }
  }

  async getUserId(): Promise<string> {
    const fromClient = this.client.getUserId();
    if (fromClient) {
      this.selfUserId = fromClient;
      return fromClient;
    }
    if (this.selfUserId) {
      return this.selfUserId;
    }
    const whoami = (await this.doRequest("GET", "/_matrix/client/v3/account/whoami")) as {
      user_id?: string;
    };
    const resolved = whoami.user_id?.trim();
    if (!resolved) {
      throw new Error("Matrix whoami did not return user_id");
    }
    this.selfUserId = resolved;
    return resolved;
  }

  async getJoinedRooms(): Promise<string[]> {
    const joined = await this.client.getJoinedRooms();
    return Array.isArray(joined.joined_rooms) ? joined.joined_rooms : [];
  }

  async getJoinedRoomMembers(roomId: string): Promise<string[]> {
    const members = await this.client.getJoinedRoomMembers(roomId);
    const joined = members?.joined;
    if (!joined || typeof joined !== "object") {
      return [];
    }
    return Object.keys(joined);
  }

  async getRoomStateEvent(
    roomId: string,
    eventType: string,
    stateKey = "",
  ): Promise<Record<string, unknown>> {
    const state = await this.client.getStateEvent(roomId, eventType, stateKey);
    return (state ?? {}) as Record<string, unknown>;
  }

  async getAccountData(eventType: string): Promise<Record<string, unknown> | undefined> {
    const event = this.client.getAccountData(eventType);
    return (event?.getContent() as Record<string, unknown> | undefined) ?? undefined;
  }

  async setAccountData(eventType: string, content: Record<string, unknown>): Promise<void> {
    await this.client.setAccountData(eventType as never, content as never);
    await this.refreshDmCache().catch(noop);
  }

  async resolveRoom(aliasOrRoomId: string): Promise<string | null> {
    if (aliasOrRoomId.startsWith("!")) {
      return aliasOrRoomId;
    }
    if (!aliasOrRoomId.startsWith("#")) {
      return aliasOrRoomId;
    }
    try {
      const resolved = await this.client.getRoomIdForAlias(aliasOrRoomId);
      return resolved.room_id ?? null;
    } catch {
      return null;
    }
  }

  async sendMessage(roomId: string, content: MessageEventContent): Promise<string> {
    const sent = await this.client.sendMessage(roomId, content as never);
    return sent.event_id;
  }

  async sendEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<string> {
    const sent = await this.client.sendEvent(roomId, eventType as never, content as never);
    return sent.event_id;
  }

  async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    content: Record<string, unknown>,
  ): Promise<string> {
    const sent = await this.client.sendStateEvent(
      roomId,
      eventType as never,
      content as never,
      stateKey,
    );
    return sent.event_id;
  }

  async redactEvent(roomId: string, eventId: string, reason?: string): Promise<string> {
    const sent = await this.client.redactEvent(
      roomId,
      eventId,
      undefined,
      reason?.trim() ? { reason } : undefined,
    );
    return sent.event_id;
  }

  async doRequest(
    method: HttpMethod,
    endpoint: string,
    qs?: QueryParams,
    body?: unknown,
    opts?: { allowAbsoluteEndpoint?: boolean },
  ): Promise<unknown> {
    return await this.httpClient.requestJson({
      method,
      endpoint,
      qs,
      body,
      timeoutMs: this.localTimeoutMs,
      allowAbsoluteEndpoint: opts?.allowAbsoluteEndpoint,
    });
  }

  async getUserProfile(userId: string): Promise<{ displayname?: string; avatar_url?: string }> {
    return await this.client.getProfileInfo(userId);
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.client.joinRoom(roomId);
  }

  mxcToHttp(mxcUrl: string): string | null {
    return this.client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, true, false, true);
  }

  async downloadContent(mxcUrl: string, allowRemote = true): Promise<Buffer> {
    const parsed = parseMxc(mxcUrl);
    if (!parsed) {
      throw new Error(`Invalid Matrix content URI: ${mxcUrl}`);
    }
    const endpoint = `/_matrix/media/v3/download/${encodeURIComponent(parsed.server)}/${encodeURIComponent(parsed.mediaId)}`;
    const response = await this.httpClient.requestRaw({
      method: "GET",
      endpoint,
      qs: { allow_remote: allowRemote },
      timeoutMs: this.localTimeoutMs,
    });
    return response;
  }

  async uploadContent(file: Buffer, contentType?: string, filename?: string): Promise<string> {
    const uploaded = await this.client.uploadContent(file, {
      type: contentType || "application/octet-stream",
      name: filename,
      includeFilename: Boolean(filename),
    });
    return uploaded.content_uri;
  }

  async getEvent(roomId: string, eventId: string): Promise<Record<string, unknown>> {
    return (await this.client.fetchRoomEvent(roomId, eventId)) as Record<string, unknown>;
  }

  async setTyping(roomId: string, typing: boolean, timeoutMs: number): Promise<void> {
    await this.client.sendTyping(roomId, typing, timeoutMs);
  }

  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    await this.httpClient.requestJson({
      method: "POST",
      endpoint: `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(
        eventId,
      )}`,
      body: {},
      timeoutMs: this.localTimeoutMs,
    });
  }

  private registerBridge(): void {
    if (this.bridgeRegistered) {
      return;
    }
    this.bridgeRegistered = true;

    this.client.on(ClientEvent.Event, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (!roomId) {
        return;
      }

      const raw = matrixEventToRaw(event);
      const isEncryptedEvent = raw.type === "m.room.encrypted";
      this.emitter.emit("room.event", roomId, raw);
      if (isEncryptedEvent) {
        this.emitter.emit("room.encrypted_event", roomId, raw);
      } else {
        if (this.decryptBridge.shouldEmitUnencryptedMessage(roomId, raw.event_id)) {
          this.emitter.emit("room.message", roomId, raw);
        }
      }

      const stateKey = raw.state_key ?? "";
      const selfUserId = this.client.getUserId() ?? this.selfUserId ?? "";
      const membership =
        raw.type === "m.room.member"
          ? (raw.content as { membership?: string }).membership
          : undefined;
      if (stateKey && selfUserId && stateKey === selfUserId) {
        if (membership === "invite") {
          this.emitter.emit("room.invite", roomId, raw);
        } else if (membership === "join") {
          this.emitter.emit("room.join", roomId, raw);
        }
      }

      if (isEncryptedEvent) {
        this.decryptBridge.attachEncryptedEvent(event, roomId);
      }
    });

    // Some SDK invite transitions are surfaced as room lifecycle events instead of raw timeline events.
    this.client.on(ClientEvent.Room, (room) => {
      this.emitMembershipForRoom(room);
    });
  }

  private emitMembershipForRoom(room: unknown): void {
    const roomObj = room as {
      roomId?: string;
      getMyMembership?: () => string | null | undefined;
      selfMembership?: string | null | undefined;
    };
    const roomId = roomObj.roomId?.trim();
    if (!roomId) {
      return;
    }
    const membership = roomObj.getMyMembership?.() ?? roomObj.selfMembership ?? undefined;
    const selfUserId = this.client.getUserId() ?? this.selfUserId ?? "";
    if (!selfUserId) {
      return;
    }
    const raw: MatrixRawEvent = {
      type: "m.room.member",
      room_id: roomId,
      sender: selfUserId,
      state_key: selfUserId,
      content: { membership },
      origin_server_ts: Date.now(),
      unsigned: { age: 0 },
    };
    if (membership === "invite") {
      this.emitter.emit("room.invite", roomId, raw);
      return;
    }
    if (membership === "join") {
      this.emitter.emit("room.join", roomId, raw);
    }
  }

  private emitOutstandingInviteEvents(): void {
    const listRooms = (this.client as { getRooms?: () => unknown[] }).getRooms;
    if (typeof listRooms !== "function") {
      return;
    }
    const rooms = listRooms.call(this.client);
    if (!Array.isArray(rooms)) {
      return;
    }
    for (const room of rooms) {
      this.emitMembershipForRoom(room);
    }
  }

  private async refreshDmCache(): Promise<void> {
    const direct = await this.getAccountData("m.direct");
    this.dmRoomIds.clear();
    if (!direct || typeof direct !== "object") {
      return;
    }
    for (const value of Object.values(direct)) {
      if (!Array.isArray(value)) {
        continue;
      }
      for (const roomId of value) {
        if (typeof roomId === "string" && roomId.trim()) {
          this.dmRoomIds.add(roomId);
        }
      }
    }
  }
}
