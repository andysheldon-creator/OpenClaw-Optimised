import { Type, type Static } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";

const GOOGLE_DRIVE_ACTIONS = ["list", "get", "download", "read_docs", "read_sheets"] as const;

// Flattened object schema (no Type.Union) so providers that reject anyOf accept the tool.
// Action determines which optional fields are required; runtime validates.
export const GoogleDriveSchema = Type.Object({
  action: stringEnum(GOOGLE_DRIVE_ACTIONS, {
    description: "Action: list (browse), get (metadata), download, read_docs, read_sheets",
  }),
  // list
  folderId: Type.Optional(
    Type.String({
      description: "Folder ID to list (omit for root). Use 'root' for root folder.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Search query to filter files (e.g., 'name contains \"report\"').",
    }),
  ),
  maxResults: Type.Optional(
    Type.Number({
      description: "Max results to return (default: 100, max: 1000).",
      minimum: 1,
      maximum: 1000,
      default: 100,
    }),
  ),
  pageToken: Type.Optional(
    Type.String({
      description: "Page token for pagination (from previous list response).",
    }),
  ),
  driveId: Type.Optional(
    Type.String({
      description:
        "Shared Drive ID when listing a Shared Drive (or use with folderId for a folder inside that drive).",
    }),
  ),
  debug: Type.Optional(
    Type.Boolean({
      description:
        "If true, include _debug in the list result (request params, hint when 0 files).",
    }),
  ),
  // get, download, read_docs
  fileId: Type.Optional(
    Type.String({
      description: "Drive/Docs file ID (for get, download, read_docs).",
    }),
  ),
  // download
  exportFormat: Type.Optional(
    Type.String({
      description:
        "Export format for Google Workspace files: pdf, docx, txt, html, rtf, odt, xlsx, csv, tsv, pptx, png, jpg, svg. Omit for original format.",
    }),
  ),
  outputPath: Type.Optional(
    Type.String({
      description: "Output path (relative to workspace). Omit to use original name.",
    }),
  ),
  // read_docs
  format: Type.Optional(
    Type.String({
      description: "Output format for read_docs: 'markdown' (default) or 'text'.",
      default: "markdown",
    }),
  ),
  // read_sheets
  spreadsheetId: Type.Optional(
    Type.String({
      description: "Google Sheets spreadsheet ID (for read_sheets).",
    }),
  ),
  range: Type.Optional(
    Type.String({
      description:
        "A1 notation range for read_sheets (e.g. 'Sheet1!A1:D10' or 'A1:Z'). Required for read_sheets.",
    }),
  ),
});

export type GoogleDriveParams = Static<typeof GoogleDriveSchema>;
