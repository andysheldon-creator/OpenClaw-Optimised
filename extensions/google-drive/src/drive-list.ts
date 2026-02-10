import type { drive_v3 } from "googleapis";
import { createGoogleDriveClient } from "./client.js";
// Dynamic type import for OAuthCredentials (not in plugin SDK)
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;

export type ListGoogleDriveFilesOptions = {
  credentials: OAuthCredentials;
  folderId?: string;
  /** When set, list is scoped to this Shared Drive (uses corpora=drive). Use with folderId for a folder inside the drive. */
  driveId?: string;
  query?: string;
  maxResults?: number;
  pageToken?: string;
  /** When true, include debug info in the result (request params, raw counts) for troubleshooting. */
  debug?: boolean;
};

export async function listGoogleDriveFiles(params: ListGoogleDriveFilesOptions): Promise<{
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    createdTime?: string;
    webViewLink?: string;
    webContentLink?: string;
    parents?: string[];
    isFolder: boolean;
  }>;
  nextPageToken?: string;
  /** Present when debug=true or when 0 files returned (to help troubleshoot Shared Drive listing). */
  _debug?: {
    request: {
      q: string;
      corpora?: string;
      driveId?: string;
      supportsAllDrives: boolean;
      includeItemsFromAllDrives: boolean;
    };
    fileCount: number;
    hint?: string;
  };
}> {
  const drive = createGoogleDriveClient(params.credentials);

  // When listing a Shared Drive root, use driveId as the "folder" (Shared Drive root folder ID = drive ID).
  const effectiveFolderId =
    params.driveId && (!params.folderId || params.folderId === "root")
      ? params.driveId
      : params.folderId;

  const q = buildQuery(effectiveFolderId, params.query);
  const request: drive_v3.Params$Resource$Files$List = {
    q,
    pageSize: params.maxResults || 100,
    fields:
      "nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, parents)",
    orderBy: "modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };

  if (params.pageToken) {
    request.pageToken = params.pageToken;
  }

  // Scope to a single Shared Drive when driveId is provided; otherwise search all drives (My Drive + Shared Drives).
  // Without corpora=allDrives, the default is "user" (My Drive only), so Shared Drive folders return 0 files.
  if (params.driveId) {
    request.corpora = "drive";
    request.driveId = params.driveId;
  } else {
    request.corpora = "allDrives";
  }

  const response = await drive.files.list(request);
  const fileCount = response.data.files?.length ?? 0;
  const wantDebug = params.debug === true || fileCount === 0;

  const debugInfo = wantDebug
    ? {
        request: {
          q,
          corpora: request.corpora,
          driveId: request.driveId,
          supportsAllDrives: request.supportsAllDrives,
          includeItemsFromAllDrives: request.includeItemsFromAllDrives,
        },
        fileCount,
        hint:
          fileCount === 0 && effectiveFolderId && effectiveFolderId !== "root"
            ? "If this folder is in a Shared Drive and not empty in the Drive UI, try passing driveId (the Shared Drive ID) along with folderId."
            : undefined,
      }
    : undefined;

  if (!response.data.files) {
    return { files: [], _debug: debugInfo };
  }

  return {
    files: response.data.files.map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType || "application/octet-stream",
      size: file.size,
      modifiedTime: file.modifiedTime || undefined,
      createdTime: file.createdTime || undefined,
      webViewLink: file.webViewLink || undefined,
      webContentLink: file.webContentLink || undefined,
      parents: file.parents || undefined,
      isFolder: file.mimeType === "application/vnd.google-apps.folder",
    })),
    nextPageToken: response.data.nextPageToken || undefined,
    ...(debugInfo && { _debug: debugInfo }),
  };
}

/** Matches a single parent clause (with optional "and trashed = false") so we use it as folderId and avoid adding 'root' in parents. */
const PARENT_CLAUSE_REGEX = /^\s*'([^']+)'\s+in\s+parents(\s+and\s+trashed\s*=\s*false)?\s*$/i;

/** Build Drive API q parameter. Exported for unit tests. */
export function buildQuery(folderId?: string, searchQuery?: string): string {
  const parts: string[] = [];

  // If the caller put a parent clause in searchQuery (e.g. "'<id>' in parents"), use that as the folder filter
  // and do not add 'root' — no file can have both root and another folder as parent.
  const parentFromQuery = searchQuery?.trim();
  const parentMatch = parentFromQuery ? PARENT_CLAUSE_REGEX.exec(parentFromQuery) : null;
  const effectiveFolderId = parentMatch ? parentMatch[1]! : folderId;
  const queryWithoutParent = parentMatch ? undefined : searchQuery;

  // Folder filter: exactly one of root or effectiveFolderId
  if (effectiveFolderId && effectiveFolderId !== "root") {
    parts.push(`'${effectiveFolderId}' in parents`);
  } else {
    parts.push(`'root' in parents`);
  }

  // Trash filter (exclude trashed files)
  parts.push("trashed = false");

  // Any additional search query (name, mimeType, etc.) — not a bare parent clause
  if (queryWithoutParent) {
    parts.push(`(${queryWithoutParent})`);
  }

  return parts.join(" and ");
}
