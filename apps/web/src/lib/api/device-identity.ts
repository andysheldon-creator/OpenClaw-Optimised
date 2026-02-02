/**
 * Device Identity Module
 *
 * Manages ed25519 keypairs for device authentication with the Gateway.
 * Uses @noble/ed25519 for key generation and signing (compatible with Gateway server).
 * Keys are stored in localStorage for persistence across sessions.
 *
 * This is a browser-compatible port of the ui/src/ui/device-identity.ts implementation.
 */

import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

interface StoredIdentity {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
}

const STORAGE_KEY = "clawdbrain-device-identity-v1";

/**
 * Converts a Uint8Array to a base64url-encoded string.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/**
 * Converts a base64url-encoded string to a Uint8Array.
 */
function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Converts bytes to a hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a device ID by hashing the public key.
 * The device ID is the SHA-256 hash of the raw public key bytes.
 */
async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer to avoid TypeScript issues with ArrayBufferLike
  const buffer = new ArrayBuffer(publicKey.length);
  new Uint8Array(buffer).set(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Generates a new ed25519 keypair for device identity.
 */
async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

/**
 * Loads an existing device identity from localStorage, or creates a new one if none exists.
 */
export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        // Verify the device ID matches the public key fingerprint
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          // Device ID mismatch - update stored identity
          const updated: StoredIdentity = {
            ...parsed,
            deviceId: derivedId,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch (err) {
    console.warn("[device-identity] Failed to load stored identity:", err);
    // Fall through to regenerate
  }

  // Generate new identity
  const identity = await generateIdentity();

  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  return identity;
}

/**
 * Signs a payload string with the device's private key.
 * Returns the signature as a base64url-encoded string.
 */
export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}

/**
 * Clears the stored device identity.
 * Use with caution - this will require re-pairing with the Gateway.
 */
export function clearDeviceIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Checks if crypto.subtle is available (needed for fingerprinting).
 */
export function isSecureContext(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}
