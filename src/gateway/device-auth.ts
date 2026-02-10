export type DeviceAuthPayloadParams = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
};

/**
 * SECURITY: Maximum age for device auth payloads.
 * Payloads older than this are rejected to prevent replay attacks.
 * Set to 5 minutes — generous enough for clock skew, tight enough to limit replay windows.
 */
export const DEVICE_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate that a device auth payload's `signedAtMs` is within the allowed TTL.
 *
 * SECURITY: This prevents replay attacks by rejecting stale payloads.
 * Particularly important for v1 payloads which lack nonce-based replay prevention.
 *
 * @returns An object with `ok: true` if the payload is fresh, or `ok: false` with a reason.
 */
export function validateDeviceAuthTTL(
  signedAtMs: number,
  nowMs?: number,
): { ok: true } | { ok: false; reason: string } {
  const now = nowMs ?? Date.now();
  const age = now - signedAtMs;

  // Reject payloads from the future (clock skew tolerance: 30 seconds)
  if (age < -30_000) {
    return { ok: false, reason: "device_auth_clock_skew" };
  }

  if (age > DEVICE_AUTH_TTL_MS) {
    return { ok: false, reason: "device_auth_expired" };
  }

  return { ok: true };
}

export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}
