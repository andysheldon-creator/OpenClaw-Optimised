import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface KeyProvider {
  getKey(): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}

export class EnvKeyProvider implements KeyProvider {
  constructor(private envVar = "OPENCLAW_ENCRYPTION_KEY") {}

  async getKey(): Promise<Buffer> {
    const key = process.env[this.envVar];
    if (!key) {
      throw new Error(`Environment variable ${this.envVar} not set`);
    }

    // If it looks like a hex key (64 hex chars = 32 bytes), use it directly
    // Otherwise derive it using PBKDF2
    return /^[0-9a-f]{64}$/i.test(key)
      ? Buffer.from(key, "hex")
      : crypto.pbkdf2Sync(key, "openclaw-salt", 100000, 32, "sha256");
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env[this.envVar]);
  }
}

export class FileKeyProvider implements KeyProvider {
  constructor(private keyPath: string) {}

  async getKey(): Promise<Buffer> {
    if (!fs.existsSync(this.keyPath)) {
      // Generate new key and store it securely
      const key = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(this.keyPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.keyPath, key.toString("hex"), { mode: 0o600 });
      return key;
    }

    const keyHex = fs.readFileSync(this.keyPath, "utf8").trim();
    return Buffer.from(keyHex, "hex");
  }

  async isAvailable(): Promise<boolean> {
    try {
      const dir = path.dirname(this.keyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a key provider with simplified logic:
 * 1. Try environment variable first
 * 2. Fall back to file-based storage
 */
export async function createKeyProvider(
  options: {
    envVar?: string;
    keyPath?: string;
  } = {},
): Promise<KeyProvider> {
  const defaultKeyPath =
    options.keyPath || path.join(process.env.HOME || ".", ".openclaw", "encryption.key");

  // Try environment variable first
  const env = new EnvKeyProvider(options.envVar);
  if (await env.isAvailable()) {
    return env;
  }

  // Fall back to file storage
  return new FileKeyProvider(defaultKeyPath);
}
