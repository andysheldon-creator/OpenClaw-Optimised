import crypto from "node:crypto";

import { logSecurityEvent } from "./hardening-logger.js";

export type SingleUserEnforcerOptions = {
  /**
   * SHA-256 hex hash of the authorized WhatsApp JID (e.g. "+8613800138000").
   * When set, only messages from this JID are allowed; everything else is silently dropped.
   * Generate with: echo -n "+8613800138000" | sha256sum
   */
  authorizedUserHash: string;
};

let enforcerHash: string | null = null;

/**
 * Hash a sender identifier with SHA-256.
 */
export function hashSender(sender: string): string {
  return crypto.createHash("sha256").update(sender).digest("hex");
}

/**
 * Initialize the single-user enforcer.
 * Must be called before any message processing.
 */
export function initSingleUserEnforcer(opts: SingleUserEnforcerOptions): void {
  const hash = opts.authorizedUserHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(
      "single-user-enforcer: authorizedUserHash must be a 64-char lowercase hex SHA-256 hash",
    );
  }
  enforcerHash = hash;
  logSecurityEvent("hardening_init", {
    module: "single-user-enforcer",
    hashPrefix: hash.slice(0, 8) + "...",
  });
}

/**
 * Check whether a sender is the authorized user.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param senderIdentifier - The sender's normalized identifier (e.g. E.164 phone number "+8613800138000")
 * @returns true if authorized, false otherwise
 */
export function isAuthorizedSender(senderIdentifier: string): boolean {
  if (!enforcerHash) {
    // Enforcer not initialized - fail closed (deny all).
    logSecurityEvent("hardening_error", {
      module: "single-user-enforcer",
      error: "enforcer not initialized, denying all",
    });
    return false;
  }

  const senderHash = hashSender(senderIdentifier);

  // Constant-time comparison to prevent timing side-channel attacks.
  const authorized = crypto.timingSafeEqual(
    Buffer.from(senderHash, "hex"),
    Buffer.from(enforcerHash, "hex"),
  );

  if (!authorized) {
    logSecurityEvent("blocked_sender", {
      senderHashPrefix: senderHash.slice(0, 8) + "...",
      senderIdentifier: senderIdentifier.slice(0, 4) + "****",
    });
  }

  return authorized;
}

/**
 * Check if the single-user enforcer is active.
 */
export function isSingleUserEnforcerActive(): boolean {
  return enforcerHash !== null;
}

/** Reset internal state (test-only). */
export function __resetSingleUserEnforcerForTest(): void {
  enforcerHash = null;
}
