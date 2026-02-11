/**
 * File-based storage adapter for Gossip SDK in Node.js environment.
 *
 * The Gossip SDK uses IndexedDB (Dexie) for browser storage.
 * For Node.js, we use fake-indexeddb for in-memory storage and persist
 * session state to files using the SDK's persistence callbacks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getGossipResolveUserPath } from "./runtime.js";

export interface GossipSessionData {
  mnemonic: string;
  encryptionKey: string; // base64 encoded
  sessionBlob?: string; // base64 encoded encrypted session
  userId?: string;
  username?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GossipStorageAdapter {
  /** Get the session data directory for an account */
  getSessionDir(accountId: string): string;
  /** Load session data from disk */
  loadSessionData(accountId: string): GossipSessionData | null;
  /** Save session data to disk */
  saveSessionData(accountId: string, data: GossipSessionData): void;
  /** Save encrypted session blob */
  saveSessionBlob(accountId: string, blob: Uint8Array, encryptionKey: Uint8Array): void;
  /** Load encrypted session blob */
  loadSessionBlob(accountId: string): { blob: Uint8Array; encryptionKey: Uint8Array } | null;
  /** Check if session data exists */
  hasSessionData(accountId: string): boolean;
  /** Delete session data */
  deleteSessionData(accountId: string): void;
  /** Save exported Dexie database JSON to disk */
  saveDexieDb(accountId: string, json: string): Promise<void>;
  /** Load exported Dexie database JSON from disk (returns null if not found) */
  loadDexieDb(accountId: string): Promise<string | null>;
}

/**
 * Get the base directory for Gossip sessions.
 * Uses ~/.openclaw/sessions/gossip/
 */
export function getGossipSessionsBaseDir(): string {
  const openclawDir = getGossipResolveUserPath("~/.openclaw");
  return path.join(openclawDir, "sessions", "gossip");
}

/**
 * Create a file-based storage adapter for Gossip sessions.
 */
export function createGossipStorageAdapter(): GossipStorageAdapter {
  const baseDir = getGossipSessionsBaseDir();

  const ensureDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  };

  const getSessionDir = (accountId: string): string => {
    const dir = path.join(baseDir, accountId);
    ensureDir(dir);
    return dir;
  };

  const getSessionFilePath = (accountId: string): string => {
    return path.join(getSessionDir(accountId), "session.json");
  };

  const getBlobFilePath = (accountId: string): string => {
    return path.join(getSessionDir(accountId), "session.blob");
  };

  const getKeyFilePath = (accountId: string): string => {
    return path.join(getSessionDir(accountId), "encryption.key");
  };

  return {
    getSessionDir,

    loadSessionData(accountId: string): GossipSessionData | null {
      const filePath = getSessionFilePath(accountId);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as GossipSessionData;
      } catch {
        return null;
      }
    },

    saveSessionData(accountId: string, data: GossipSessionData): void {
      ensureDir(getSessionDir(accountId));
      const filePath = getSessionFilePath(accountId);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
    },

    saveSessionBlob(accountId: string, blob: Uint8Array, encryptionKey: Uint8Array): void {
      ensureDir(getSessionDir(accountId));

      // Save the encrypted session blob
      const blobPath = getBlobFilePath(accountId);
      fs.writeFileSync(blobPath, Buffer.from(blob), { mode: 0o600 });

      // Save the encryption key
      const keyPath = getKeyFilePath(accountId);
      fs.writeFileSync(keyPath, Buffer.from(encryptionKey).toString("base64"), {
        encoding: "utf-8",
        mode: 0o600,
      });

      // Also update the session.json with the base64 blob
      const sessionData = this.loadSessionData(accountId);
      if (sessionData) {
        sessionData.sessionBlob = Buffer.from(blob).toString("base64");
        sessionData.encryptionKey = Buffer.from(encryptionKey).toString("base64");
        sessionData.updatedAt = new Date().toISOString();
        this.saveSessionData(accountId, sessionData);
      }
    },

    loadSessionBlob(accountId: string): { blob: Uint8Array; encryptionKey: Uint8Array } | null {
      const blobPath = getBlobFilePath(accountId);
      const keyPath = getKeyFilePath(accountId);

      if (!fs.existsSync(blobPath) || !fs.existsSync(keyPath)) {
        // Try to load from session.json as fallback
        const sessionData = this.loadSessionData(accountId);
        if (sessionData?.sessionBlob && sessionData?.encryptionKey) {
          return {
            blob: base64ToUint8Array(sessionData.sessionBlob),
            encryptionKey: base64ToUint8Array(sessionData.encryptionKey),
          };
        }
        return null;
      }

      try {
        const blobBuffer = fs.readFileSync(blobPath);
        const keyBase64 = fs.readFileSync(keyPath, "utf-8").trim();
        const keyBuffer = Buffer.from(keyBase64, "base64");
        return {
          blob: new Uint8Array(blobBuffer.buffer, blobBuffer.byteOffset, blobBuffer.byteLength),
          encryptionKey: new Uint8Array(
            keyBuffer.buffer,
            keyBuffer.byteOffset,
            keyBuffer.byteLength,
          ),
        };
      } catch {
        return null;
      }
    },

    hasSessionData(accountId: string): boolean {
      return fs.existsSync(getSessionFilePath(accountId));
    },

    deleteSessionData(accountId: string): void {
      const sessionDir = path.join(baseDir, accountId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    },

    async saveDexieDb(accountId: string, json: string): Promise<void> {
      ensureDir(getSessionDir(accountId));
      const filePath = path.join(getSessionDir(accountId), "dexie-db.json");
      fs.writeFileSync(filePath, json, { encoding: "utf-8", mode: 0o600 });
    },

    async loadDexieDb(accountId: string): Promise<string | null> {
      const filePath = path.join(getSessionDir(accountId), "dexie-db.json");
      if (!fs.existsSync(filePath)) {
        return null;
      }
      try {
        return fs.readFileSync(filePath, "utf-8");
      } catch {
        return null;
      }
    },
  };
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  return Buffer.from(arr).toString("base64");
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
