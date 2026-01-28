import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createGossipStorageAdapter,
  uint8ArrayToBase64,
  base64ToUint8Array,
  type GossipSessionData,
  type GossipStorageAdapter,
} from "./storage.js";

// Mock the runtime module to control the base directory
vi.mock("./runtime.js", () => ({
  getGossipResolveUserPath: (p: string) => p.replace("~", os.tmpdir()),
}));

describe("storage", () => {
  let storage: GossipStorageAdapter;
  let testBaseDir: string;
  const testAccountId = "test-account-123";

  beforeEach(() => {
    storage = createGossipStorageAdapter();
    testBaseDir = path.join(os.tmpdir(), ".openclaw", "sessions", "gossip");
  });

  afterEach(() => {
    // Clean up test directories
    const accountDir = path.join(testBaseDir, testAccountId);
    if (fs.existsSync(accountDir)) {
      fs.rmSync(accountDir, { recursive: true, force: true });
    }
  });

  describe("getSessionDir", () => {
    it("creates the session directory if it does not exist", () => {
      const dir = storage.getSessionDir(testAccountId);
      expect(fs.existsSync(dir)).toBe(true);
      expect(dir).toContain(testAccountId);
    });

    it("returns the same directory on subsequent calls", () => {
      const dir1 = storage.getSessionDir(testAccountId);
      const dir2 = storage.getSessionDir(testAccountId);
      expect(dir1).toBe(dir2);
    });
  });

  describe("saveSessionData / loadSessionData", () => {
    it("saves and loads session data correctly", () => {
      const sessionData: GossipSessionData = {
        mnemonic: "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12",
        encryptionKey: uint8ArrayToBase64(new Uint8Array([1, 2, 3, 4, 5])),
        userId: "user-123",
        username: "testuser",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      storage.saveSessionData(testAccountId, sessionData);
      const loaded = storage.loadSessionData(testAccountId);

      expect(loaded).toEqual(sessionData);
    });

    it("returns null for non-existent session", () => {
      const loaded = storage.loadSessionData("non-existent-account");
      expect(loaded).toBeNull();
    });

    it("saves session data with correct file permissions", () => {
      const sessionData: GossipSessionData = {
        mnemonic: "test mnemonic",
        encryptionKey: "dGVzdA==",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storage.saveSessionData(testAccountId, sessionData);

      const filePath = path.join(storage.getSessionDir(testAccountId), "session.json");
      const stats = fs.statSync(filePath);
      // Check file mode is 0o600 (owner read/write only)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("saveSessionBlob / loadSessionBlob", () => {
    it("saves and loads session blob correctly", () => {
      // First create session data (required for blob save to update it)
      const sessionData: GossipSessionData = {
        mnemonic: "test mnemonic",
        encryptionKey: "initial-key",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSessionData(testAccountId, sessionData);

      const blob = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      const encryptionKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      storage.saveSessionBlob(testAccountId, blob, encryptionKey);
      const loaded = storage.loadSessionBlob(testAccountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.blob).toEqual(blob);
      expect(loaded!.encryptionKey).toEqual(encryptionKey);
    });

    it("returns null when no blob exists", () => {
      const loaded = storage.loadSessionBlob("non-existent-account");
      expect(loaded).toBeNull();
    });

    it("updates session.json with blob data", () => {
      const sessionData: GossipSessionData = {
        mnemonic: "test mnemonic",
        encryptionKey: "initial-key",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSessionData(testAccountId, sessionData);

      const blob = new Uint8Array([10, 20, 30]);
      const encryptionKey = new Uint8Array([1, 2, 3]);

      storage.saveSessionBlob(testAccountId, blob, encryptionKey);

      const loaded = storage.loadSessionData(testAccountId);
      expect(loaded!.sessionBlob).toBe(uint8ArrayToBase64(blob));
      expect(loaded!.encryptionKey).toBe(uint8ArrayToBase64(encryptionKey));
    });

    it("can load blob from session.json fallback", () => {
      // Manually create session.json with blob data (simulating old format)
      const blob = new Uint8Array([1, 2, 3, 4, 5]);
      const encryptionKey = new Uint8Array([6, 7, 8, 9, 10]);

      const sessionData: GossipSessionData = {
        mnemonic: "test mnemonic",
        encryptionKey: uint8ArrayToBase64(encryptionKey),
        sessionBlob: uint8ArrayToBase64(blob),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSessionData(testAccountId, sessionData);

      // Don't create separate blob files - test fallback
      const loaded = storage.loadSessionBlob(testAccountId);

      expect(loaded).not.toBeNull();
      expect(loaded!.blob).toEqual(blob);
      expect(loaded!.encryptionKey).toEqual(encryptionKey);
    });
  });

  describe("hasSessionData", () => {
    it("returns false for non-existent session", () => {
      expect(storage.hasSessionData("non-existent")).toBe(false);
    });

    it("returns true for existing session", () => {
      const sessionData: GossipSessionData = {
        mnemonic: "test",
        encryptionKey: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSessionData(testAccountId, sessionData);

      expect(storage.hasSessionData(testAccountId)).toBe(true);
    });
  });

  describe("deleteSessionData", () => {
    it("deletes all session files", () => {
      const sessionData: GossipSessionData = {
        mnemonic: "test",
        encryptionKey: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storage.saveSessionData(testAccountId, sessionData);
      storage.saveSessionBlob(testAccountId, new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]));

      expect(storage.hasSessionData(testAccountId)).toBe(true);

      storage.deleteSessionData(testAccountId);

      expect(storage.hasSessionData(testAccountId)).toBe(false);
      expect(storage.loadSessionBlob(testAccountId)).toBeNull();
    });

    it("handles deletion of non-existent session gracefully", () => {
      // Should not throw
      expect(() => storage.deleteSessionData("non-existent")).not.toThrow();
    });
  });
});

describe("base64 utilities", () => {
  describe("uint8ArrayToBase64", () => {
    it("converts Uint8Array to base64 string", () => {
      const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToBase64(arr);
      expect(result).toBe("SGVsbG8=");
    });

    it("handles empty array", () => {
      const arr = new Uint8Array([]);
      const result = uint8ArrayToBase64(arr);
      expect(result).toBe("");
    });

    it("handles binary data", () => {
      const arr = new Uint8Array([0, 255, 128, 64, 32]);
      const result = uint8ArrayToBase64(arr);
      expect(result).toBe("AP+AQCA=");
    });
  });

  describe("base64ToUint8Array", () => {
    it("converts base64 string to Uint8Array", () => {
      const base64 = "SGVsbG8="; // "Hello"
      const result = base64ToUint8Array(base64);
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("handles empty string", () => {
      const result = base64ToUint8Array("");
      expect(result).toEqual(new Uint8Array([]));
    });

    it("round-trips correctly", () => {
      const original = new Uint8Array([0, 1, 2, 255, 254, 253, 100, 200]);
      const base64 = uint8ArrayToBase64(original);
      const result = base64ToUint8Array(base64);
      expect(result).toEqual(original);
    });
  });
});
