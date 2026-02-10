import csvToMarkdown from "csv-to-markdown-table";

export function csvToMarkdownTable(csv: string): string {
  if (!csv.trim()) {
    return "";
  }

  // Use csv-to-markdown-table library
  // Parameters: csvString, delimiter (default ','), hasHeaders (default true)
  const result = csvToMarkdown(csv, ",", true);
  // Trim trailing whitespace and newlines
  return result.trimEnd();
}

export function jsonToMarkdown(json: string): string {
  // Try to format JSON if valid, otherwise use as-is
  let formatted = json;
  try {
    const parsed = JSON.parse(json);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    // Invalid JSON, use as-is
    formatted = json;
  }
  return `\`\`\`json\n${formatted}\n\`\`\``;
}
