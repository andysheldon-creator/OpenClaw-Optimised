/**
 * DingTalk webhook signature generation and verification
 * Algorithm: HMAC-SHA256(timestamp + "\n" + secret) -> Base64
 */

import { createHmac } from "node:crypto";

export interface SignatureResult {
  timestamp: number;
  sign: string;
}

/**
 * Generate signature for outbound webhook requests
 */
export function generateSignature(secret: string): SignatureResult {
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(stringToSign);
  const sign = hmac.digest("base64");

  return { timestamp, sign };
}

/**
 * Verify signature for inbound webhook requests
 */
export function verifySignature(timestamp: string | number, sign: string, secret: string): boolean {
  try {
    const ts = typeof timestamp === "string" ? Number.parseInt(timestamp, 10) : timestamp;

    // Check timestamp is within 1 hour (DingTalk requirement)
    const now = Date.now();
    const diff = Math.abs(now - ts);
    if (diff > 3600000) {
      return false;
    }

    const stringToSign = `${ts}\n${secret}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(stringToSign);
    const expectedSign = hmac.digest("base64");

    return sign === expectedSign;
  } catch {
    return false;
  }
}
