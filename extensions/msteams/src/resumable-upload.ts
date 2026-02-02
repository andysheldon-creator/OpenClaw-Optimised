/**
 * Resumable upload utilities for MS Teams large file support (>4MB).
 * 
 * Implements Microsoft Graph's resumable upload session API.
 * @see https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession
 */

import type { MSTeamsAccessTokenProvider } from "./attachments/types.js";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com";

// 4MB threshold - Graph API requires resumable upload for larger files
export const SIMPLE_UPLOAD_MAX_SIZE = 4 * 1024 * 1024;

// 5MB chunks for optimal speed/reliability balance
export const CHUNK_SIZE = 5 * 1024 * 1024;

export interface UploadSession {
    uploadUrl: string;
    expirationDateTime: string;
}

export interface UploadResult {
    id: string;
    webUrl: string;
    name: string;
}

/**
 * Create a resumable upload session for large files.
 */
export async function createUploadSession(params: {
    uploadPath: string;
    filename: string;
    tokenProvider: MSTeamsAccessTokenProvider;
    driveEndpoint: string;
    fetchFn?: typeof fetch;
}): Promise<UploadSession> {
    const fetchFn = params.fetchFn ?? fetch;
    const token = await params.tokenProvider.getAccessToken(GRAPH_SCOPE);

  const res = await fetchFn(
        `${GRAPH_ROOT}${params.driveEndpoint}/root:${params.uploadPath}:/createUploadSession`,
    {
            method: "POST",
            headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
            },
            body: JSON.stringify({
                      item: {
                                  "@microsoft.graph.conflictBehavior": "rename",
                                  name: params.filename,
                      },
            }),
    },
      );

  if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Create upload session failed: ${res.status} - ${body}`);
  }

  const data = (await res.json()) as { uploadUrl?: string; expirationDateTime?: string };
    if (!data.uploadUrl) throw new Error("Missing uploadUrl in response");

  return { uploadUrl: data.uploadUrl, expirationDateTime: data.expirationDateTime ?? "" };
}

/**
 * Upload file in chunks using resumable session.
 */
export async function uploadInChunks(params: {
    buffer: Buffer;
    uploadSession: UploadSession;
    fetchFn?: typeof fetch;
    onProgress?: (uploaded: number, total: number) => void;
}): Promise<UploadResult> {
    const fetchFn = params.fetchFn ?? fetch;
    const { buffer, uploadSession } = params;
    const totalSize = buffer.length;
    let offset = 0;

  while (offset < totalSize) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE, totalSize);
        const chunk = buffer.subarray(offset, chunkEnd);

      const res = await fetchFn(uploadSession.uploadUrl, {
              method: "PUT",
              headers: {
                        "Content-Length": String(chunk.length),
                        "Content-Range": `bytes ${offset}-${chunkEnd - 1}/${totalSize}`,
              },
              body: new Uint8Array(chunk),
      });

      if (!res.ok) {
              const body = await res.text().catch(() => "");
              throw new Error(`Upload chunk failed: ${res.status} - ${body}`);
      }

      params.onProgress?.(chunkEnd, totalSize);

      if (chunkEnd === totalSize) {
              const data = (await res.json()) as { id?: string; webUrl?: string; name?: string };
              if (!data.id || !data.webUrl || !data.name) {
                        throw new Error("Upload response missing required fields");
              }
              return { id: data.id, webUrl: data.webUrl, name: data.name };
      }
        offset = chunkEnd;
  }
    throw new Error("Upload completed but no final response");
}
