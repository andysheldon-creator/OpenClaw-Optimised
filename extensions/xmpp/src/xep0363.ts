/**
 * XEP-0363: HTTP File Upload
 * https://xmpp.org/extensions/xep-0363.html
 *
 * Implements HTTP File Upload for sharing media files via XMPP.
 */

import type { Buffer } from "node:buffer";

export interface HttpUploadSlot {
  putUrl: string;
  getUrl: string;
  headers?: Record<string, string>;
}

export interface HttpUploadSlotRequest {
  filename: string;
  size: number;
  contentType?: string;
}

export interface HttpUploadOptions {
  maxSize?: number;
}

export const XEP0363_NAMESPACE = "urn:xmpp:http:upload:0";
export const XEP0363_FEATURE = "urn:xmpp:http:upload:0";

/**
 * Upload a file buffer to the HTTP upload slot
 */
export async function uploadToSlot(
  slot: HttpUploadSlot,
  buffer: Buffer,
  contentType?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": contentType || "application/octet-stream",
    "Content-Length": buffer.length.toString(),
  };

  // Add custom headers from slot (e.g., Authorization, Expires)
  if (slot.headers) {
    for (const [key, value] of Object.entries(slot.headers)) {
      // Only allow specific headers per XEP-0363 security considerations
      if (["Authorization", "Cookie", "Expires"].includes(key)) {
        headers[key] = value;
      }
    }
  }

  const response = await fetch(slot.putUrl, {
    method: "PUT",
    headers,
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    throw new Error(`HTTP upload failed: ${response.status} ${response.statusText}`);
  }
}
