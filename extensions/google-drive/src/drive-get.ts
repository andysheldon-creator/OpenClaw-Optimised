import type { drive_v3 } from "googleapis";
import { createGoogleDriveClient } from "./client.js";
// Dynamic type import for OAuthCredentials (not in plugin SDK)
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;

export async function getGoogleDriveFile(params: {
  credentials: OAuthCredentials;
  fileId: string;
}): Promise<{
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
  isGoogleWorkspaceFile: boolean;
  exportFormats?: string[];
}> {
  const drive = createGoogleDriveClient(params.credentials);

  const response = await drive.files.get({
    fileId: params.fileId,
    fields:
      "id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, parents, capabilities",
    supportsAllDrives: true,
  });

  const file = response.data;
  if (!file.id || !file.name) {
    throw new Error("Invalid file response from Google Drive API");
  }

  const isGoogleWorkspaceFile = file.mimeType?.startsWith("application/vnd.google-apps.") ?? false;

  // Get export formats for Google Workspace files
  let exportFormats: string[] | undefined;
  if (isGoogleWorkspaceFile) {
    const aboutResponse = await drive.about.get({ fields: "exportFormats" });
    const allExportFormats = aboutResponse.data.exportFormats;
    if (allExportFormats && file.mimeType) {
      exportFormats = allExportFormats[file.mimeType] || [];
    }
  }

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType || "application/octet-stream",
    size: file.size,
    modifiedTime: file.modifiedTime || undefined,
    createdTime: file.createdTime || undefined,
    webViewLink: file.webViewLink || undefined,
    webContentLink: file.webContentLink || undefined,
    parents: file.parents || undefined,
    isFolder: file.mimeType === "application/vnd.google-apps.folder",
    isGoogleWorkspaceFile,
    exportFormats,
  };
}
