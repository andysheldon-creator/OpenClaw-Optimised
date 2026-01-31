import crypto from "node:crypto";
import type { ObaVerificationResult } from "./types.js";
import { base64UrlDecode } from "./base64url.js";
import { CanonicalizeError, preparePayloadForSigning } from "./canonicalize.js";
import { classifyObaOffline } from "./extract.js";

type JwkEntry = {
  kty: string;
  crv: string;
  kid: string;
  x: string;
  use?: string;
  alg?: string;
};

// Cache JWKS fetches as promises to prevent stampede (micro-check #4).
const jwksCache = new Map<string, Promise<{ keys: JwkEntry[] }>>();

const JWKS_FETCH_TIMEOUT_MS = 3_000;

/**
 * Fetch JWKS from ownerUrl with a 3s timeout. Caches the promise per URL
 * so concurrent verifications sharing the same owner don't duplicate requests.
 */
export function resolveJwks(ownerUrl: string): Promise<{ keys: JwkEntry[] }> {
  const cached = jwksCache.get(ownerUrl);
  if (cached) return cached;

  const promise = fetchJwks(ownerUrl);
  jwksCache.set(ownerUrl, promise);

  // Evict failed fetches so retries can try again.
  promise.catch(() => {
    jwksCache.delete(ownerUrl);
  });

  return promise;
}

async function fetchJwks(ownerUrl: string): Promise<{ keys: JwkEntry[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ownerUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { keys?: unknown };
    if (!body || !Array.isArray(body.keys)) {
      throw new Error("invalid JWKS response: missing keys array");
    }
    return { keys: body.keys as JwkEntry[] };
  } finally {
    clearTimeout(timeout);
  }
}

export function findKeyByKid(keys: JwkEntry[], kid: string): JwkEntry | null {
  return keys.find((k) => k.kid === kid) ?? null;
}

/**
 * Verify an Ed25519 signature against a JWK.
 */
export function verifyObaSignature(payload: Buffer, sigB64Url: string, jwk: JwkEntry): boolean {
  const sigBytes = base64UrlDecode(sigB64Url);
  const publicKey = crypto.createPublicKey({
    key: jwk as unknown as JsonWebKey,
    format: "jwk",
  });
  return crypto.verify(null, payload, publicKey, sigBytes);
}

/**
 * Full verification of a container (plugin manifest or skill metadata root object).
 * Reads container.oba, validates offline, builds payload, fetches JWKS, verifies.
 */
export async function verifyObaContainer(
  container: Record<string, unknown>,
): Promise<ObaVerificationResult> {
  const { oba, verification } = classifyObaOffline((container as Record<string, unknown>).oba);

  // Not signed or already invalid => return as-is.
  if (verification.status !== "signed" || !oba) {
    return verification;
  }

  let payload: Buffer;
  try {
    payload = preparePayloadForSigning(container);
  } catch (err) {
    const reason =
      err instanceof CanonicalizeError
        ? `canonicalization failed: ${err.message}`
        : "canonicalization failed";
    return { status: "invalid", ownerUrl: oba.owner, reason };
  }

  let jwks: { keys: JwkEntry[] };
  try {
    jwks = await resolveJwks(oba.owner);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: "invalid", ownerUrl: oba.owner, reason: `jwks fetch failed: ${detail}` };
  }

  const key = findKeyByKid(jwks.keys, oba.kid);
  if (!key) {
    return { status: "invalid", ownerUrl: oba.owner, reason: `key not found: kid=${oba.kid}` };
  }

  let valid: boolean;
  try {
    valid = verifyObaSignature(payload, oba.sig, key);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: "invalid",
      ownerUrl: oba.owner,
      reason: `signature verification error: ${detail}`,
    };
  }

  if (!valid) {
    return { status: "invalid", ownerUrl: oba.owner, reason: "signature mismatch" };
  }

  return { status: "verified", ownerUrl: oba.owner };
}

/**
 * Concurrency-limited async map. Runs at most `limit` fn calls in parallel.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Clear cached JWKS entries (for testing). */
export function clearJwksCache(): void {
  jwksCache.clear();
}
