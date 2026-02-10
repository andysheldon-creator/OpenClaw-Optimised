import type { docs_v1 } from "googleapis";
import { createGoogleDocsClient } from "./client.js";
// Dynamic type import for OAuthCredentials (not in plugin SDK)
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;

export async function readGoogleDocs(params: {
  credentials: OAuthCredentials;
  fileId: string;
  format?: "markdown" | "text";
}): Promise<{
  content: string;
  title: string;
}> {
  const docs = createGoogleDocsClient(params.credentials);

  const response = await docs.documents.get({
    documentId: params.fileId,
  });

  const document = response.data;
  if (!document.body?.content) {
    throw new Error("Empty document or invalid response from Google Docs API");
  }

  const title = document.title || "Untitled Document";
  const content = convertDocumentToText(document, params.format || "markdown");

  return {
    content,
    title,
  };
}

/** Convert Docs API document to markdown or text. Exported for unit tests. */
export function convertDocumentToText(
  document: docs_v1.Schema$Document,
  format: "markdown" | "text",
): string {
  if (!document.body?.content) {
    return "";
  }

  const parts: string[] = [];

  for (const element of document.body.content) {
    if (element.paragraph) {
      const text = extractParagraphText(element.paragraph, format);
      if (text) {
        parts.push(text);
      }
    } else if (element.table) {
      const text = extractTableText(element.table, format);
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join(format === "markdown" ? "\n\n" : "\n");
}

function extractParagraphText(
  paragraph: docs_v1.Schema$Paragraph,
  format: "markdown" | "text",
): string {
  if (!paragraph.elements) {
    return "";
  }

  const parts: string[] = [];

  for (const element of paragraph.elements) {
    if (element.textRun) {
      const text = element.textRun.content || "";
      const style = element.textRun.textStyle;

      if (format === "markdown") {
        let formatted = text;
        if (style?.bold) {
          formatted = `**${formatted}**`;
        }
        if (style?.italic) {
          formatted = `*${formatted}*`;
        }
        if (style?.underline) {
          formatted = `<u>${formatted}</u>`;
        }
        if (style?.link?.url) {
          formatted = `[${formatted}](${style.link.url})`;
        }
        parts.push(formatted);
      } else {
        parts.push(text);
      }
    } else if (element.inlineObjectElement) {
      // Skip inline objects for now
      continue;
    }
  }

  const text = parts.join("").trim();

  // Add heading prefix if this is a heading
  if (paragraph.paragraphStyle?.namedStyleType) {
    const style = paragraph.paragraphStyle.namedStyleType;
    if (format === "markdown" && text) {
      const level = getHeadingLevel(style);
      if (level > 0) {
        return `${"#".repeat(level)} ${text}`;
      }
    }
  }

  return text;
}

function extractTableText(table: docs_v1.Schema$Table, format: "markdown" | "text"): string {
  if (!table.tableRows) {
    return "";
  }

  const rows: string[][] = [];

  for (const row of table.tableRows) {
    if (!row.tableCells) {
      continue;
    }
    const cells: string[] = [];
    for (const cell of row.tableCells) {
      if (cell.content) {
        const cellText = cell.content
          .map((element) => {
            if (element.paragraph) {
              return extractParagraphText(element.paragraph, "text");
            }
            return "";
          })
          .join(" ")
          .trim();
        cells.push(cellText);
      } else {
        cells.push("");
      }
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return "";
  }

  if (format === "markdown") {
    // Build markdown table
    const header = rows[0];
    const body = rows.slice(1);

    const headerRow = `| ${header.join(" | ")} |`;
    const separatorRow = `| ${header.map(() => "---").join(" | ")} |`;
    const bodyRows = body.map((row) => `| ${row.join(" | ")} |`).join("\n");

    return `${headerRow}\n${separatorRow}\n${bodyRows}`;
  } else {
    // Plain text table
    return rows.map((row) => row.join("\t")).join("\n");
  }
}

function getHeadingLevel(style: string): number {
  const match = style.match(/^HEADING_(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}
