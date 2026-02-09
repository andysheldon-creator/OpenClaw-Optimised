/**
 * Tests for NIP-17 gift wrap implementation
 */

import { finalizeEvent, getPublicKey, nip59 } from "nostr-tools";
import { getConversationKey, encrypt as nip44Encrypt } from "nostr-tools/nip44";
import { describe, it, expect } from "vitest";
import {
  hexToBytes,
  bytesToHex,
  normalizeNostrTarget,
  looksLikeNostrId,
  createGiftWrap,
  unwrapGiftWrap,
  getPublicKeyFromPrivate,
} from "./nip17.js";

// Test keys (DO NOT use in production)
const TEST_SENDER_SK = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_RECIPIENT_SK = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("hexToBytes", () => {
  it("converts hex string to Uint8Array", () => {
    const hex = "0102030405060708";
    const bytes = hexToBytes(hex);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(8);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("handles uppercase hex", () => {
    const hex = "AABBCCDD";
    const bytes = hexToBytes(hex);
    expect(bytes[0]).toBe(0xaa);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xcc);
    expect(bytes[3]).toBe(0xdd);
  });

  it("handles 64-char private key", () => {
    const bytes = hexToBytes(TEST_SENDER_SK);
    expect(bytes.length).toBe(32);
  });
});

describe("bytesToHex", () => {
  it("converts Uint8Array to hex string", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 170, 187, 204, 221]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe("01020304aabbccdd");
  });

  it("roundtrips with hexToBytes", () => {
    const original = TEST_SENDER_SK;
    const bytes = hexToBytes(original);
    const hex = bytesToHex(bytes);
    expect(hex).toBe(original);
  });
});

describe("getPublicKeyFromPrivate", () => {
  it("derives correct public key", () => {
    const skBytes = hexToBytes(TEST_SENDER_SK);
    const pk = getPublicKeyFromPrivate(skBytes);
    expect(pk).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(pk)).toBe(true);
  });

  it("matches nostr-tools getPublicKey", () => {
    const skBytes = hexToBytes(TEST_SENDER_SK);
    const ourPk = getPublicKeyFromPrivate(skBytes);
    const theirPk = getPublicKey(skBytes);
    expect(ourPk).toBe(theirPk);
  });
});

describe("normalizeNostrTarget", () => {
  const validHexPubkey = "c220169537593d7126e9842f31a8d4d5fa66e271ce396f12ddc2d455db855bf2";
  const validNpub = "npub1cgspd9fhty7hzfhfsshnr2x56haxdcn3ecuk7ykact29tku9t0eqtveawx";

  it("accepts valid hex pubkey", () => {
    expect(normalizeNostrTarget(validHexPubkey)).toBe(validHexPubkey);
  });

  it("normalizes hex to lowercase", () => {
    const uppercase = validHexPubkey.toUpperCase();
    expect(normalizeNostrTarget(uppercase)).toBe(validHexPubkey);
  });

  it("decodes npub to hex", () => {
    const result = normalizeNostrTarget(validNpub);
    expect(result).toBe(validHexPubkey);
  });

  it("returns null for invalid input", () => {
    expect(normalizeNostrTarget("invalid")).toBeNull();
    expect(normalizeNostrTarget("npub1short")).toBeNull();
    expect(normalizeNostrTarget("abc123")).toBeNull();
    expect(normalizeNostrTarget("")).toBeNull();
  });

  it("returns null for wrong length hex", () => {
    expect(normalizeNostrTarget("c220169537593d7126e9842f31a8d4d5")).toBeNull(); // 32 chars
    expect(
      normalizeNostrTarget("c220169537593d7126e9842f31a8d4d5fa66e271ce396f12ddc2d455db855bf2aa"),
    ).toBeNull(); // 66 chars
  });
});

describe("looksLikeNostrId", () => {
  it("recognizes npub format", () => {
    expect(
      looksLikeNostrId("npub1cgspd9fhty7hzfhfsshnr2x56haxdcn3ecuk7ykact29tku9t0eqtveawx"),
    ).toBe(true);
  });

  it("recognizes hex pubkey", () => {
    expect(
      looksLikeNostrId("c220169537593d7126e9842f31a8d4d5fa66e271ce396f12ddc2d455db855bf2"),
    ).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(looksLikeNostrId("invalid")).toBe(false);
    expect(looksLikeNostrId("npub1short")).toBe(false);
    expect(looksLikeNostrId("abc123")).toBe(false);
    expect(looksLikeNostrId("")).toBe(false);
  });

  it("rejects nsec (private keys)", () => {
    expect(looksLikeNostrId("nsec1abc")).toBe(false);
  });
});

describe("createGiftWrap", () => {
  const senderSkBytes = hexToBytes(TEST_SENDER_SK);
  const recipientSkBytes = hexToBytes(TEST_RECIPIENT_SK);
  const recipientPk = getPublicKey(recipientSkBytes);

  it("creates a kind:1059 event", () => {
    const { event, eventId } = createGiftWrap(recipientPk, "Hello!", senderSkBytes);

    expect(event.kind).toBe(1059);
    expect(event.id).toBe(eventId);
    expect(eventId).toHaveLength(64);
  });

  it("includes recipient in p-tag", () => {
    const { event } = createGiftWrap(recipientPk, "Hello!", senderSkBytes);

    const pTags = event.tags.filter((t) => t[0] === "p");
    expect(pTags.length).toBeGreaterThan(0);
    expect(pTags.some((t) => t[1] === recipientPk)).toBe(true);
  });

  it("has encrypted content", () => {
    const { event } = createGiftWrap(recipientPk, "Secret message", senderSkBytes);

    // Content should not contain the plaintext
    expect(event.content).not.toContain("Secret message");
    // Content should be non-empty (encrypted)
    expect(event.content.length).toBeGreaterThan(0);
  });

  it("uses ephemeral pubkey (not sender's)", () => {
    const senderPk = getPublicKey(senderSkBytes);
    const { event } = createGiftWrap(recipientPk, "Hello!", senderSkBytes);

    // Gift wrap pubkey should be ephemeral, not the sender
    expect(event.pubkey).not.toBe(senderPk);
  });

  it("accepts npub format for recipient", () => {
    const recipientNpub = "npub1cgspd9fhty7hzfhfsshnr2x56haxdcn3ecuk7ykact29tku9t0eqtveawx";
    const { event } = createGiftWrap(recipientNpub, "Hello!", senderSkBytes);

    expect(event.kind).toBe(1059);
  });
});

describe("unwrapGiftWrap", () => {
  const senderSkBytes = hexToBytes(TEST_SENDER_SK);
  const senderPk = getPublicKey(senderSkBytes);
  const recipientSkBytes = hexToBytes(TEST_RECIPIENT_SK);
  const recipientPk = getPublicKey(recipientSkBytes);

  it("unwraps a gift-wrapped message", () => {
    const message = "Test message for NIP-17";
    const { event } = createGiftWrap(recipientPk, message, senderSkBytes);

    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);

    expect(unwrapped).not.toBeNull();
    expect(unwrapped?.content).toBe(message);
    expect(unwrapped?.senderPubkey).toBe(senderPk);
  });

  it("returns sender npub", () => {
    const { event } = createGiftWrap(recipientPk, "Hello", senderSkBytes);
    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);

    expect(unwrapped?.senderNpub).toMatch(/^npub1/);
  });

  it("returns event ID", () => {
    const { event, eventId } = createGiftWrap(recipientPk, "Hello", senderSkBytes);
    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);

    expect(unwrapped?.eventId).toBe(eventId);
  });

  it("fails to unwrap with wrong key", () => {
    const message = "Secret message";
    const { event } = createGiftWrap(recipientPk, message, senderSkBytes);

    const wrongKey = hexToBytes("1111111111111111111111111111111111111111111111111111111111111111");
    const unwrapped = unwrapGiftWrap(event, wrongKey);

    expect(unwrapped).toBeNull();
  });

  it("returns null for non-gift-wrap events", () => {
    const fakeEvent = {
      kind: 1, // Wrong kind
      pubkey: "abc",
      content: "test",
      tags: [],
      created_at: 123,
      id: "xxx",
      sig: "yyy",
    };

    const result = unwrapGiftWrap(
      fakeEvent as unknown as import("nostr-tools").Event,
      recipientSkBytes,
    );
    expect(result).toBeNull();
  });

  it("returns null for kind:4 events", () => {
    const fakeEvent = {
      kind: 4, // NIP-04, not gift wrap
      pubkey: senderPk,
      content: "encrypted",
      tags: [["p", recipientPk]],
      created_at: 123,
      id: "xxx",
      sig: "yyy",
    };

    const result = unwrapGiftWrap(
      fakeEvent as unknown as import("nostr-tools").Event,
      recipientSkBytes,
    );
    expect(result).toBeNull();
  });

  it("handles unicode content", () => {
    const message = "Hello 👋 世界 🌍 مرحبا";
    const { event } = createGiftWrap(recipientPk, message, senderSkBytes);
    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);

    expect(unwrapped?.content).toBe(message);
  });

  it("handles long messages", () => {
    const message = "x".repeat(10000);
    const { event } = createGiftWrap(recipientPk, message, senderSkBytes);
    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);

    expect(unwrapped?.content).toBe(message);
  });
});

describe("roundtrip", () => {
  it("sender can verify their own message", () => {
    const senderSkBytes = hexToBytes(TEST_SENDER_SK);
    const recipientSkBytes = hexToBytes(TEST_RECIPIENT_SK);
    const recipientPk = getPublicKey(recipientSkBytes);

    const originalMessage = "Roundtrip test";
    const { event } = createGiftWrap(recipientPk, originalMessage, senderSkBytes);

    // Recipient unwraps
    const unwrapped = unwrapGiftWrap(event, recipientSkBytes);
    expect(unwrapped?.content).toBe(originalMessage);
  });
});

describe("sender impersonation resistance", () => {
  const ATTACKER_SK = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const aliceSkBytes = hexToBytes(TEST_SENDER_SK);
  const alicePk = getPublicKey(aliceSkBytes);
  const botSkBytes = hexToBytes(TEST_RECIPIENT_SK);
  const botPk = getPublicKey(botSkBytes);
  const attackerSkBytes = hexToBytes(ATTACKER_SK);
  const attackerPk = getPublicKey(attackerSkBytes);

  it("rejects forged sender pubkey in rumor", () => {
    const forgedRumor = {
      kind: 14 as const,
      content: "I am Alice (forged)",
      tags: [["p", botPk]],
      created_at: Math.round(Date.now() / 1000),
      pubkey: alicePk, // LIE: claims to be Alice
    };

    const rumorConversationKey = getConversationKey(attackerSkBytes, botPk);
    const encryptedRumor = nip44Encrypt(JSON.stringify(forgedRumor), rumorConversationKey);

    const seal = finalizeEvent(
      {
        kind: 13,
        content: encryptedRumor,
        created_at: Math.round(Date.now() / 1000),
        tags: [],
      },
      attackerSkBytes,
    );

    const wrap = nip59.createWrap(seal, botPk);

    const unwrapped = unwrapGiftWrap(wrap, botSkBytes);

    // NIP-17: "Clients MUST verify if pubkey of the kind:13 is the
    // same pubkey on the kind:14." Mismatch → reject entirely.
    expect(unwrapped).toBeNull();
  });

  it("legitimate message reports correct sender", () => {
    const { event } = createGiftWrap(botPk, "I am really Alice", aliceSkBytes);
    const unwrapped = unwrapGiftWrap(event, botSkBytes);

    expect(unwrapped).not.toBeNull();
    expect(unwrapped?.senderPubkey).toBe(alicePk);
  });
});
