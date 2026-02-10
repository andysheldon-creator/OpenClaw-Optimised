import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { jsonResult } from "openclaw/plugin-sdk";
import { resolveGoogleDriveCredentials } from "./credentials.js";
import { readGoogleDocs } from "./docs-read.js";
import { downloadGoogleDriveFile } from "./drive-download.js";
import { getGoogleDriveFile } from "./drive-get.js";
import { listGoogleDriveFiles } from "./drive-list.js";
import { GoogleDriveSchema, type GoogleDriveParams } from "./schema.js";
import { readGoogleSheetsRange } from "./sheets-read.js";

function validateParams(p: GoogleDriveParams): string | null {
  switch (p.action) {
    case "list":
      return null;
    case "get":
    case "download":
      return p.fileId ? null : "fileId is required for this action";
    case "read_docs":
      return p.fileId ? null : "fileId is required for read_docs";
    case "read_sheets":
      if (!p.spreadsheetId) return "spreadsheetId is required for read_sheets";
      if (!p.range?.trim()) return "range is required for read_sheets (e.g. 'Sheet1!A1:D10')";
      return null;
    default:
      return `Unknown action: ${(p as { action: string }).action}`;
  }
}

export function registerGoogleDriveTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("google_drive: No config available, skipping drive tools");
    return;
  }

  // Use a factory function to capture context values
  api.registerTool(
    (ctx: OpenClawPluginToolContext) => ({
      name: "google_drive",
      label: "Google Drive",
      description:
        "Browse Google Drive, get file metadata, download files, read Google Docs, and read Google Sheets. Actions: list, get, download, read_docs, read_sheets",
      parameters: GoogleDriveSchema,
      async execute(_toolCallId, params) {
        const p = params as GoogleDriveParams;

        const validationError = validateParams(p);
        if (validationError) {
          return jsonResult({ error: validationError });
        }

        const credentials = await resolveGoogleDriveCredentials({
          config: ctx.config,
          agentDir: ctx.agentDir,
        });

        if (!credentials) {
          return jsonResult({
            error:
              "No Google Drive credentials found. Please authenticate using 'openclaw models auth login --provider google-drive'",
          });
        }

        try {
          switch (p.action) {
            case "list": {
              const result = await listGoogleDriveFiles({
                credentials,
                folderId: p.folderId,
                driveId: p.driveId,
                query: p.query,
                maxResults: p.maxResults,
                pageToken: p.pageToken,
                debug: p.debug === true,
              });
              return jsonResult(result);
            }

            case "get": {
              const result = await getGoogleDriveFile({
                credentials,
                fileId: p.fileId!,
              });
              return jsonResult(result);
            }

            case "download": {
              const workspaceDir = ctx.workspaceDir || process.cwd();
              const result = await downloadGoogleDriveFile({
                credentials,
                fileId: p.fileId!,
                exportFormat: p.exportFormat,
                outputPath: p.outputPath,
                workspaceDir,
              });
              return jsonResult({
                success: true,
                ...result,
                message: `Downloaded to ${result.path}`,
              });
            }

            case "read_docs": {
              const result = await readGoogleDocs({
                credentials,
                fileId: p.fileId!,
                format: p.format === "text" ? "text" : "markdown",
              });
              return jsonResult({
                title: result.title,
                content: result.content,
                format: p.format || "markdown",
              });
            }

            case "read_sheets": {
              const result = await readGoogleSheetsRange({
                credentials,
                spreadsheetId: p.spreadsheetId!,
                range: p.range!.trim(),
              });
              return jsonResult(result);
            }

            default: {
              return jsonResult({ error: `Unknown action: ${(p as { action: string }).action}` });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          api.logger.error?.(`google_drive tool error: ${message}`);
          return jsonResult({ error: message });
        }
      },
    }),
    { optional: true },
  );

  api.logger.info?.("google_drive: Registered google_drive tool");
}
