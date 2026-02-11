/**
 * Gossip SDK Bus - Wrapper for SDK lifecycle and event handling
 *
 * This module provides a clean interface for OpenClaw to interact with the
 * Gossip SDK, handling initialization, session management, and message routing.
 */

// Must run before any code that uses IndexedDB (SDK uses Dexie).
import "fake-indexeddb/auto";
import type Dexie from "dexie";
import {
  gossipSdk,
  GossipDatabase,
  generateMnemonic,
  generateEncryptionKey,
  encryptionKeyFromBytes,
  type Message,
  type Discussion,
  type Contact,
  MessageDirection,
  MessageStatus,
  MessageType,
  encodeUserId,
  decodeFromBase64,
  isValidUserId,
} from "@massalabs/gossip-sdk";
import {
  createGossipStorageAdapter,
  type GossipStorageAdapter,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from "./storage.js";

export interface GossipBusOptions {
  /** Account ID for state persistence */
  accountId: string;
  /** BIP39 mnemonic phrase (auto-generated if not provided) */
  mnemonic?: string;
  /** Username for the account */
  username: string;
  /** Gossip protocol API base URL */
  protocolUrl: string;
  /** Called when a message is received */
  onMessage: (
    senderId: string,
    text: string,
    reply: (text: string) => Promise<void>,
  ) => Promise<void>;
  /** Called on errors (optional) */
  onError?: (error: Error, context: string) => void;
  /** Called when SDK is ready (optional) */
  onReady?: (userId: string) => void;
  /** Called on discussion requests (optional) */
  onDiscussionRequest?: (discussion: Discussion, contact: Contact) => void;
  /** Optional debug logger (e.g. ctx.log from channel gateway) */
  log?: { debug?(message: string): void };
}

export interface GossipBusHandle {
  /** Stop the bus and cleanup */
  close: () => Promise<void>;
  /** Get the user's ID (bech32-encoded gossip1… string) */
  userId: string;
  /** Send a DM to a user */
  sendDm: (toUserId: string, text: string) => Promise<void>;
  /** Get the storage adapter */
  storage: GossipStorageAdapter;
  /** Get the mnemonic (for backup purposes) */
  getMnemonic: () => string;
}

/**
 * Start the Gossip bus - initializes SDK and handles message routing
 */
export async function startGossipBus(options: GossipBusOptions): Promise<GossipBusHandle> {
  const {
    accountId,
    username,
    protocolUrl,
    onMessage,
    onError,
    onReady,
    onDiscussionRequest,
    log,
  } = options;

  const debug = (msg: string) => log?.debug?.(msg);

  const storage = createGossipStorageAdapter();

  debug(`gossip bus init accountId=${accountId} protocolUrl=${protocolUrl}`);

  // Load or create session data
  let sessionData = storage.loadSessionData(accountId);
  let mnemonic = options.mnemonic;
  let encryptionKey: Uint8Array;
  let existingSession: { blob: Uint8Array; encryptionKey: Uint8Array } | null = null;

  if (sessionData) {
    debug(`gossip session data found for accountId=${accountId}`);
    // Restore existing session
    mnemonic = sessionData.mnemonic;
    encryptionKey = base64ToUint8Array(sessionData.encryptionKey);
    existingSession = storage.loadSessionBlob(accountId);
    debug(`gossip session restored for accountId=${accountId}`);
  } else {
    debug(`gossip no session data found for accountId=${accountId}`);
    // Generate new account if no mnemonic provided
    if (!mnemonic) {
      mnemonic = generateMnemonic();
    }
    encryptionKey = (await generateEncryptionKey()).to_bytes();

    // Save the new session data
    sessionData = {
      mnemonic,
      encryptionKey: uint8ArrayToBase64(encryptionKey),
      username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveSessionData(accountId, sessionData);
    debug(`gossip new session created for accountId=${accountId}`);
  }

  // Initialize the SDK with a fresh database instance
  const db = new GossipDatabase();
  await db.open();
  debug(`gossip SDK database opened`);

  // Restore Dexie DB state from disk (discussions, contacts, messages).
  // fake-indexeddb is in-memory so this data would otherwise be lost on restart.
  const savedJson = await storage.loadDexieDb(accountId);
  if (savedJson) {
    try {
      await importDexieDb(db, savedJson);
      debug(`gossip Dexie DB restored from disk for accountId=${accountId}`);
    } catch (err) {
      debug(`gossip Dexie DB restore failed: ${(err as Error).message}`);
      onError?.(err as Error, "dexie db restore");
    }
  } else {
    debug(`gossip no saved Dexie DB found for accountId=${accountId}`);
  }

  // Start with polling disabled so we can fetch announcements (discussion requests)
  // before any messages are polled. This avoids the "no discussion for incoming message"
  // error when a message arrives before its discussion request is processed.
  await gossipSdk.init({
    db,
    protocolBaseUrl: protocolUrl,
    config: {
      polling: {
        enabled: false,
        messagesIntervalMs: 5000,
        announcementsIntervalMs: 5000,
        sessionRefreshIntervalMs: 30000,
      },
    },
  });

  // SDK is a singleton; close any existing session (e.g. from onboarding) before opening
  if (gossipSdk.isSessionOpen) {
    debug(`gossip closing existing session before open`);
    await gossipSdk.closeSession();
  }

  // Open session with persistence
  const encKey = await encryptionKeyFromBytes(encryptionKey);
  debug(`gossip opening session for accountId=${accountId}`);

  await gossipSdk.openSession({
    mnemonic,
    encryptedSession: existingSession?.blob,
    encryptionKey: encKey,
    persistEncryptionKey: encKey,
    onPersist: async (blob, key) => {
      storage.saveSessionBlob(accountId, blob, key.to_bytes());
      debug(`gossip session persisted accountId=${accountId} blobSize=${blob.length}`);
    },
  });

  const rawUserId = gossipSdk.userId;
  const userId = encodeUserId(rawUserId);
  debug(`gossip session open userId=${userId}`);

  // Log existing discussions to verify persistence across restarts
  const discussions = await gossipSdk.discussions.list(userId);
  debug(
    `gossip existing discussions: ${discussions.length} → ${discussions.map((d) => `${d.contactUserId.slice(0, 16)}… (status=${d.status})`).join(", ") || "none"}`,
  );

  // Update session data with userId
  if (sessionData && !sessionData.userId) {
    sessionData.userId = userId;
    sessionData.updatedAt = new Date().toISOString();
    storage.saveSessionData(accountId, sessionData);
  }

  // Set up event handlers
  gossipSdk.on("message", async (message: Message) => {
    debug(`gossip incoming message: ${JSON.stringify(message)}`);
    // Only handle incoming messages
    if (message.direction !== MessageDirection.INCOMING) {
      return;
    }

    const senderId = message.contactUserId;
    const text = message.content;
    debug(`gossip incoming message from=${senderId} len=${text?.length ?? 0}`);

    // Create reply function
    const reply = async (responseText: string): Promise<void> => {
      await sendMessage(senderId, responseText);
    };

    try {
      await onMessage(senderId, text, reply);
    } catch (err) {
      onError?.(err as Error, `handling message from ${senderId}`);
    }
  });

  gossipSdk.on("discussionRequest", (discussion: Discussion, contact: Contact) => {
    debug(`gossip discussion request from=${contact.userId}`);
    onDiscussionRequest?.(discussion, contact);

    // Auto-accept discussion requests for contacts
    gossipSdk.discussions.accept(discussion).catch((err) => {
      onError?.(err as Error, `accepting discussion from ${contact.userId}`);
    });
  });

  gossipSdk.on("error", (error: Error, context: string) => {
    debug(`gossip error: ${error.message} context=${context}`);
    onError?.(error, context);
  });

  // Notify that SDK is ready
  onReady?.(userId);

  // Fetch announcements (discussion requests) before starting polling so that
  // discussions are established before the first message poll. Without this,
  // messages can arrive before their discussion exists → "no discussion" error.
  debug(`gossip fetching announcements before starting polls (protocolUrl=${protocolUrl})`);
  try {
    const result = await gossipSdk.announcements.fetch();
    const count = result?.newAnnouncementsCount ?? 0;
    const ok = result?.success;
    debug(
      `gossip initial announcements fetch done: newCount=${count} success=${ok}` +
        (count === 0 && ok ? " (if you expected requests, check bulletin API/network)" : ""),
    );
  } catch (err) {
    onError?.(err as Error, "initial announcements fetch");
  }

  // Now safe to start polling (discussions are established for known contacts)
  debug(`gossip starting polling`);
  gossipSdk.polling.start();

  /** Persist the Dexie DB to disk (discussions, contacts, messages). */
  async function persistDexieDb(): Promise<void> {
    try {
      const json = await exportDexieDb(db);
      await storage.saveDexieDb(accountId, json);
      debug(`gossip Dexie DB persisted to disk for accountId=${accountId}`);
    } catch (err) {
      debug(`gossip Dexie DB persist failed: ${(err as Error).message}`);
      onError?.(err as Error, "dexie db persist");
    }
  }

  // Periodic save for crash safety (every 60 s)
  const persistInterval = setInterval(() => {
    void persistDexieDb();
  }, 60_000);

  /**
   * Send a message to a user
   */
  async function sendMessage(toUserId: string, text: string): Promise<void> {
    debug(`gossip sendDm to=${toUserId} len=${text.length}`);
    // Check if we have a contact for this user
    const contact = await gossipSdk.contacts.get(userId, toUserId);

    if (!contact) {
      throw new Error(`No contact found for user ${toUserId}. Cannot send message.`);
    }

    // Check if discussion is stable (can send messages)
    const isStable = await gossipSdk.discussions.isStable(userId, toUserId);
    debug(`gossip discussion is stable: ${isStable}`);
    if (!isStable) {
      // Discussion not ready - message will be queued as WAITING_SESSION
      // and sent automatically when session becomes active
    }

    await gossipSdk.messages.send({
      ownerUserId: userId,
      contactUserId: toUserId,
      content: text,
      type: MessageType.TEXT,
      direction: MessageDirection.OUTGOING,
      status: isStable ? MessageStatus.SENDING : MessageStatus.WAITING_SESSION,
      timestamp: new Date(),
    });
  }

  return {
    close: async () => {
      debug(`gossip closing session accountId=${accountId}`);
      clearInterval(persistInterval);
      // Final DB export before shutdown so state survives the next restart
      await persistDexieDb();
      await gossipSdk.closeSession();
      db.close();
    },
    userId,
    sendDm: sendMessage,
    storage,
    getMnemonic: () => mnemonic,
  };
}

// ---------------------------------------------------------------------------
// Manual Dexie DB export/import (avoids dexie-export-import which needs `self`)
// ---------------------------------------------------------------------------

/**
 * JSON replacer that tags Date and Uint8Array values so they survive round-trips.
 * Uses `this[key]` to read the original value before Date.toJSON() converts it.
 */
function typedReplacer(this: unknown, key: string, value: unknown): unknown {
  const raw = (this as Record<string, unknown>)[key];
  if (raw instanceof Date) {
    return { __$t: "D", v: raw.toISOString() };
  }
  if (raw instanceof Uint8Array) {
    return { __$t: "U", v: Buffer.from(raw).toString("base64") };
  }
  return value;
}

/** JSON reviver that restores tagged Date and Uint8Array values. */
function typedReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && "__$t" in (value as Record<string, unknown>)) {
    const tagged = value as { __$t: string; v: string };
    if (tagged.__$t === "D") {
      return new Date(tagged.v);
    }
    if (tagged.__$t === "U") {
      const buf = Buffer.from(tagged.v, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
  }
  return value;
}

/** Serialise every table in a Dexie DB to a JSON string. */
async function exportDexieDb(db: Dexie): Promise<string> {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    snapshot[table.name] = await table.toArray();
  }
  return JSON.stringify(snapshot, typedReplacer);
}

/** Restore a previously exported JSON snapshot into a Dexie DB. */
async function importDexieDb(db: Dexie, json: string): Promise<void> {
  const snapshot = JSON.parse(json, typedReviver) as Record<string, unknown[]>;
  for (const [tableName, records] of Object.entries(snapshot)) {
    const table = db.table(tableName);
    await table.clear();
    if (records.length > 0) {
      await table.bulkPut(records);
    }
  }
}

/**
 * Validate a Gossip user ID format
 */
export function isValidGossipUserId(input: string): boolean {
  if (typeof input !== "string") {
    return false;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }
  // Accept both bech32 gossip IDs and raw base64-encoded IDs.
  if (isValidUserId(trimmed)) {
    return true;
  }
  try {
    const decoded = decodeFromBase64(trimmed);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Normalize a Gossip user ID (trim whitespace)
 */
export function normalizeGossipUserId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  // If it's already a valid user ID, return it as-is.
  if (isValidUserId(trimmed)) {
    return trimmed;
  }
  // If it's a base64-encoded 32-byte ID, convert to bech32 gossip1… form.
  try {
    const decoded = decodeFromBase64(trimmed);
    if (decoded.length === 32) {
      return encodeUserId(decoded);
    }
  } catch {
    // fall through to trimmed
  }
  return trimmed;
}
