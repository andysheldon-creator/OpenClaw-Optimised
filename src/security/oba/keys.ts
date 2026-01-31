import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CONFIG_DIR } from "../../utils.js";
import { base64UrlEncode } from "./base64url.js";

export type ObaKeyFile = {
  kid: string;
  publicKeyPem: string;
  privateKeyPem: string;
  owner?: string;
  createdAt: string;
};

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function extractRawPublicKey(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

export function deriveKid(publicKeyPem: string): string {
  const raw = extractRawPublicKey(publicKeyPem);
  const hash = crypto.createHash("sha256").update(raw).digest();
  return base64UrlEncode(hash).slice(0, 16);
}

export function publicKeyToJwkX(publicKeyPem: string): string {
  const raw = extractRawPublicKey(publicKeyPem);
  return base64UrlEncode(raw);
}

export function getObaKeysDir(): string {
  return path.join(CONFIG_DIR, "oba", "keys");
}

function ensureKeysDir(): void {
  const dir = getObaKeysDir();
  fs.mkdirSync(dir, { recursive: true });
}

export function generateObaKeyPair(owner?: string): ObaKeyFile {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const kid = deriveKid(publicKeyPem);
  return {
    kid,
    publicKeyPem,
    privateKeyPem,
    owner,
    createdAt: new Date().toISOString(),
  };
}

export function saveObaKey(key: ObaKeyFile): void {
  ensureKeysDir();
  const filePath = path.join(getObaKeysDir(), `${key.kid}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(key, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

export function loadObaKey(kid: string): ObaKeyFile {
  const filePath = path.join(getObaKeysDir(), `${kid}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ObaKeyFile;
}

export function loadMostRecentObaKey(): ObaKeyFile | null {
  const keys = listObaKeys();
  if (keys.length === 0) return null;
  keys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return keys[0];
}

export function listObaKeys(): ObaKeyFile[] {
  const dir = getObaKeysDir();
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const keys: ObaKeyFile[] = [];
  for (const entry of entries) {
    try {
      const raw = fs.readFileSync(path.join(dir, entry), "utf-8");
      keys.push(JSON.parse(raw) as ObaKeyFile);
    } catch {
      // skip malformed key files
    }
  }
  return keys;
}

export function signPayload(payload: Buffer, privateKeyPem: string): Buffer {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto.sign(null, payload, key);
}
