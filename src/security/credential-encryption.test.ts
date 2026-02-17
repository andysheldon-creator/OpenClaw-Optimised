/**
 * Tests for FB-015: Credential Encryption at Rest
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

const {
  encryptValue,
  decryptValue,
  encryptConfigFields,
  decryptConfigFields,
  isEncryptableKey,
  isEncryptedValue,
  countUnencryptedFields,
  ENCRYPTED_PREFIX,
} = await import("./credential-encryption.js");

const TEST_CONFIG = { enabled: true, passphrase: "test-passphrase-123" };

describe("FB-015: Credential Encryption at Rest", () => {
  describe("encryptValue / decryptValue", () => {
    it("round-trips a simple string", () => {
      const original = "my-secret-token-abc123";
      const encrypted = encryptValue(original, TEST_CONFIG);
      expect(encrypted).not.toBe(original);
      expect(encrypted.startsWith(ENCRYPTED_PREFIX)).toBe(true);
      const decrypted = decryptValue(encrypted, TEST_CONFIG);
      expect(decrypted).toBe(original);
    });

    it("round-trips unicode strings", () => {
      const original = "pässwörd-with-üñîcödé-🔐";
      const encrypted = encryptValue(original, TEST_CONFIG);
      const decrypted = decryptValue(encrypted, TEST_CONFIG);
      expect(decrypted).toBe(original);
    });

    it("round-trips empty string", () => {
      const encrypted = encryptValue("", TEST_CONFIG);
      // Empty string should be returned as-is
      expect(encrypted).toBe("");
    });

    it("produces different ciphertexts for same input (random IV)", () => {
      const original = "same-secret";
      const a = encryptValue(original, TEST_CONFIG);
      const b = encryptValue(original, TEST_CONFIG);
      expect(a).not.toBe(b); // Different IVs
      expect(decryptValue(a, TEST_CONFIG)).toBe(original);
      expect(decryptValue(b, TEST_CONFIG)).toBe(original);
    });

    it("returns plaintext when disabled", () => {
      const original = "my-secret";
      const result = encryptValue(original, {
        enabled: false,
        passphrase: "x",
      });
      expect(result).toBe(original);
    });

    it("skips already-encrypted values", () => {
      const original = "my-secret";
      const encrypted = encryptValue(original, TEST_CONFIG);
      const doubleEncrypted = encryptValue(encrypted, TEST_CONFIG);
      // Should not double-encrypt
      expect(doubleEncrypted).toBe(encrypted);
    });

    it("returns encrypted string as-is if decryption fails (wrong key)", () => {
      const encrypted = encryptValue("secret", TEST_CONFIG);
      const wrongConfig = { enabled: true, passphrase: "wrong-key" };
      const result = decryptValue(encrypted, wrongConfig);
      // Should return the encrypted string on failure (not crash)
      expect(result).toBe(encrypted);
    });

    it("returns non-prefixed string as-is during decrypt", () => {
      const plain = "not-encrypted-value";
      expect(decryptValue(plain, TEST_CONFIG)).toBe(plain);
    });

    it("handles tampered ciphertext gracefully", () => {
      const encrypted = encryptValue("secret", TEST_CONFIG);
      // Tamper with the base64 payload
      const tampered = ENCRYPTED_PREFIX + "AAAAAA==";
      const result = decryptValue(tampered, TEST_CONFIG);
      // Should return as-is on failure
      expect(result).toBe(tampered);
    });
  });

  describe("isEncryptableKey", () => {
    it("identifies sensitive keys", () => {
      expect(isEncryptableKey("token")).toBe(true);
      expect(isEncryptableKey("botToken")).toBe(true);
      expect(isEncryptableKey("password")).toBe(true);
      expect(isEncryptableKey("apiKey")).toBe(true);
      expect(isEncryptableKey("secret")).toBe(true);
      expect(isEncryptableKey("webhookSecret")).toBe(true);
    });

    it("rejects non-sensitive keys", () => {
      expect(isEncryptableKey("name")).toBe(false);
      expect(isEncryptableKey("enabled")).toBe(false);
      expect(isEncryptableKey("host")).toBe(false);
      expect(isEncryptableKey("port")).toBe(false);
    });
  });

  describe("isEncryptedValue", () => {
    it("detects encrypted values", () => {
      expect(isEncryptedValue("enc:v1:abc123==")).toBe(true);
    });

    it("rejects plain values", () => {
      expect(isEncryptedValue("plain-text")).toBe(false);
      expect(isEncryptedValue("")).toBe(false);
    });
  });

  describe("encryptConfigFields / decryptConfigFields", () => {
    it("encrypts and decrypts nested config objects", () => {
      const config = {
        telegram: {
          botToken: "1234567890:ABCdefGhIjKlMnOpQrStUvWxYz",
          enabled: true,
        },
        discord: {
          token: "my-discord-token",
        },
        gateway: {
          auth: {
            password: "admin-password",
          },
          port: 8080,
        },
      };

      const encrypted = encryptConfigFields(config, TEST_CONFIG) as Record<
        string,
        unknown
      >;

      // Sensitive fields should be encrypted
      const tg = encrypted.telegram as Record<string, unknown>;
      expect(typeof tg.botToken).toBe("string");
      expect((tg.botToken as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);
      expect(tg.enabled).toBe(true); // non-sensitive unchanged

      const dc = encrypted.discord as Record<string, unknown>;
      expect((dc.token as string).startsWith(ENCRYPTED_PREFIX)).toBe(true);

      const gw = encrypted.gateway as Record<string, unknown>;
      const auth = gw.auth as Record<string, unknown>;
      expect((auth.password as string).startsWith(ENCRYPTED_PREFIX)).toBe(
        true,
      );
      expect(gw.port).toBe(8080);

      // Decrypt and verify round-trip
      const decrypted = decryptConfigFields(encrypted, TEST_CONFIG) as Record<
        string,
        unknown
      >;
      expect(decrypted).toEqual(config);
    });

    it("handles null/undefined gracefully", () => {
      expect(encryptConfigFields(null, TEST_CONFIG)).toBeNull();
      expect(encryptConfigFields(undefined, TEST_CONFIG)).toBeUndefined();
      expect(decryptConfigFields(null, TEST_CONFIG)).toBeNull();
    });

    it("does not mutate original object", () => {
      const original = { token: "secret" };
      encryptConfigFields(original, TEST_CONFIG);
      expect(original.token).toBe("secret");
    });

    it("skips non-sensitive fields", () => {
      const config = { name: "test", host: "localhost" };
      const result = encryptConfigFields(config, TEST_CONFIG);
      expect(result).toEqual(config);
    });

    it("handles arrays in config", () => {
      const config = {
        providers: [
          { name: "a", apiKey: "key-a" },
          { name: "b", apiKey: "key-b" },
        ],
      };
      const encrypted = encryptConfigFields(config, TEST_CONFIG) as Record<
        string,
        unknown
      >;
      const providers = encrypted.providers as Array<Record<string, unknown>>;
      expect(
        (providers[0].apiKey as string).startsWith(ENCRYPTED_PREFIX),
      ).toBe(true);
      expect(
        (providers[1].apiKey as string).startsWith(ENCRYPTED_PREFIX),
      ).toBe(true);
      expect(providers[0].name).toBe("a");

      const decrypted = decryptConfigFields(encrypted, TEST_CONFIG) as Record<
        string,
        unknown
      >;
      expect(decrypted).toEqual(config);
    });
  });

  describe("countUnencryptedFields", () => {
    it("counts plaintext sensitive fields", () => {
      const config = {
        token: "plain",
        apiKey: "plain",
        name: "not-sensitive",
      };
      expect(countUnencryptedFields(config)).toBe(2);
    });

    it("ignores already-encrypted fields", () => {
      const config = {
        token: "enc:v1:abc123",
        apiKey: "enc:v1:def456",
      };
      expect(countUnencryptedFields(config)).toBe(0);
    });

    it("counts nested fields", () => {
      const config = {
        telegram: { botToken: "plain" },
        discord: { token: "plain" },
      };
      expect(countUnencryptedFields(config)).toBe(2);
    });

    it("returns 0 for non-objects", () => {
      expect(countUnencryptedFields(null)).toBe(0);
      expect(countUnencryptedFields(undefined)).toBe(0);
      expect(countUnencryptedFields("string")).toBe(0);
    });
  });
});
