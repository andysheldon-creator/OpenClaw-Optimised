import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { base64UrlEncode } from "./base64url.js";
import { preparePayloadForSigning } from "./canonicalize.js";
import {
  deriveKid,
  generateObaKeyPair,
  listObaKeys,
  loadObaKey,
  publicKeyToJwkX,
  saveObaKey,
  signPayload,
} from "./keys.js";
import { signPluginManifest, signSkillMetadata } from "./sign.js";
import { clearJwksCache, verifyObaContainer } from "./verify.js";

// Helper: generate a test keypair.
function makeTestKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { publicKeyPem, privateKeyPem };
}

describe("OBA key management", () => {
  let tmpDir: string;
  const origConfigDir = process.env.OPENCLAW_STATE_DIR;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oba-keys-test-"));
    process.env.OPENCLAW_STATE_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origConfigDir) {
      process.env.OPENCLAW_STATE_DIR = origConfigDir;
    } else {
      delete process.env.OPENCLAW_STATE_DIR;
    }
  });

  it("deriveKid produces a 16-char string", () => {
    const { publicKeyPem } = makeTestKeyPair();
    const kid = deriveKid(publicKeyPem);
    expect(kid).toHaveLength(16);
    expect(kid).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("deriveKid is deterministic", () => {
    const { publicKeyPem } = makeTestKeyPair();
    expect(deriveKid(publicKeyPem)).toBe(deriveKid(publicKeyPem));
  });

  it("publicKeyToJwkX produces a base64url string", () => {
    const { publicKeyPem } = makeTestKeyPair();
    const x = publicKeyToJwkX(publicKeyPem);
    expect(x).toMatch(/^[A-Za-z0-9_-]+$/);
    // Ed25519 raw key is 32 bytes → 43 base64url chars.
    expect(x).toHaveLength(43);
  });

  it("generateObaKeyPair creates valid key file", () => {
    const key = generateObaKeyPair("https://example.com/jwks.json");
    expect(key.kid).toHaveLength(16);
    expect(key.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(key.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(key.owner).toBe("https://example.com/jwks.json");
    expect(key.createdAt).toBeTruthy();
  });

  it("signPayload produces valid Ed25519 signature", () => {
    const { publicKeyPem, privateKeyPem } = makeTestKeyPair();
    const payload = Buffer.from("test payload", "utf-8");
    const sig = signPayload(payload, privateKeyPem);
    expect(sig).toBeInstanceOf(Buffer);
    expect(sig.length).toBe(64); // Ed25519 signatures are 64 bytes.
    // Verify with public key.
    const valid = crypto.verify(null, payload, publicKeyPem, sig);
    expect(valid).toBe(true);
  });
});

describe("OBA plugin signing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oba-sign-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("signs a plugin manifest and produces valid oba block", () => {
    const manifest = { id: "test-plugin", configSchema: { type: "object" } };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const key = generateObaKeyPair("https://example.com/jwks/test.json");
    const { kid, sig } = signPluginManifest({ manifestPath, key });

    expect(kid).toBe(key.kid);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);

    // Read back and verify structure.
    const signed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(signed.oba).toBeDefined();
    expect(signed.oba.owner).toBe("https://example.com/jwks/test.json");
    expect(signed.oba.kid).toBe(key.kid);
    expect(signed.oba.alg).toBe("EdDSA");
    expect(signed.oba.sig).toBe(sig);

    // Verify the signature locally.
    const payload = preparePayloadForSigning(JSON.parse(fs.readFileSync(manifestPath, "utf-8")));
    const sigBytes = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/") + "==", "base64");
    const valid = crypto.verify(null, payload, key.publicKeyPem, sigBytes);
    expect(valid).toBe(true);
  });

  it("re-signs a previously signed manifest", () => {
    const manifest = {
      id: "test-plugin",
      oba: { owner: "https://old.com/jwks.json", kid: "old-kid", alg: "EdDSA", sig: "old-sig" },
    };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const key = generateObaKeyPair("https://new.com/jwks.json");
    signPluginManifest({ manifestPath, key });

    const signed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(signed.oba.owner).toBe("https://new.com/jwks.json");
    expect(signed.oba.kid).toBe(key.kid);
    expect(signed.oba.sig).not.toBe("old-sig");
  });

  it("throws if no owner is set", () => {
    const manifest = { id: "test-plugin" };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const key = generateObaKeyPair(); // no owner
    expect(() => signPluginManifest({ manifestPath, key })).toThrow("No owner URL");
  });

  it("owner override takes precedence", () => {
    const manifest = { id: "test-plugin" };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const key = generateObaKeyPair("https://original.com/jwks.json");
    signPluginManifest({ manifestPath, key, ownerOverride: "https://override.com/jwks.json" });

    const signed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(signed.oba.owner).toBe("https://override.com/jwks.json");
  });
});

describe("OBA skill signing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oba-skill-sign-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("signs a SKILL.md and produces valid oba block", () => {
    const skillContent = `---
metadata: {
  openclaw: {
    emoji: "test"
  }
}
---

# Test Skill

This is a test skill.
`;
    const skillPath = path.join(tmpDir, "SKILL.md");
    fs.writeFileSync(skillPath, skillContent);

    const key = generateObaKeyPair("https://example.com/jwks/test.json");
    const { kid, sig } = signSkillMetadata({ skillPath, key });

    expect(kid).toBe(key.kid);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);

    // Read back — should still have frontmatter.
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("---");
    expect(content).toContain("oba");
    expect(content).toContain(key.kid);
  });

  it("throws if no frontmatter found", () => {
    const skillPath = path.join(tmpDir, "SKILL.md");
    fs.writeFileSync(skillPath, "# No Frontmatter\n\nJust content.\n");

    const key = generateObaKeyPair("https://example.com/jwks.json");
    expect(() => signSkillMetadata({ skillPath, key })).toThrow("No frontmatter block");
  });
});

describe("OBA sign + verify round-trip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oba-roundtrip-"));
    clearJwksCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    clearJwksCache();
  });

  it("signed plugin verifies successfully with mocked JWKS", async () => {
    const manifest = { id: "roundtrip-plugin", version: "1.0.0" };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const key = generateObaKeyPair("https://test.openbotauth.org/jwks/test.json");
    signPluginManifest({ manifestPath, key });

    // Build JWK from the public key for mock JWKS response.
    const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const pubKeyObj = crypto.createPublicKey(key.publicKeyPem);
    const spki = pubKeyObj.export({ type: "spki", format: "der" }) as Buffer;
    const rawPub = spki.subarray(ED25519_SPKI_PREFIX.length);
    const xValue = base64UrlEncode(rawPub);

    const jwk = { kty: "OKP", crv: "Ed25519", kid: key.kid, x: xValue, use: "sig", alg: "EdDSA" };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const signed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    const result = await verifyObaContainer(signed);
    expect(result.status).toBe("verified");
  });

  it("tampered manifest fails verification", async () => {
    const manifest = { id: "tamper-test", version: "1.0.0" };
    const manifestPath = path.join(tmpDir, "openclaw.plugin.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const key = generateObaKeyPair("https://test.openbotauth.org/jwks/test.json");
    signPluginManifest({ manifestPath, key });

    // Tamper with the manifest.
    const signed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    signed.id = "tampered-id";
    fs.writeFileSync(manifestPath, JSON.stringify(signed, null, 2));

    // Build mock JWKS.
    const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const pubKeyObj = crypto.createPublicKey(key.publicKeyPem);
    const spki = pubKeyObj.export({ type: "spki", format: "der" }) as Buffer;
    const rawPub = spki.subarray(ED25519_SPKI_PREFIX.length);
    const xValue = base64UrlEncode(rawPub);
    const jwk = { kty: "OKP", crv: "Ed25519", kid: key.kid, x: xValue, use: "sig", alg: "EdDSA" };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const tampered = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    const result = await verifyObaContainer(tampered);
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("signature mismatch");
  });
});
