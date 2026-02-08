/**
 * TOOLS-003 (#39) -- CLI output parsers
 *
 * Utility functions for transforming raw stdout from CLI commands into
 * structured data. Supports JSON, whitespace-aligned tables, and CSV.
 *
 * @see ./cli-runner.ts
 * @module
 */

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

/**
 * Parse JSON from CLI stdout.
 *
 * Handles two common edge cases:
 * - Leading/trailing whitespace or ANSI escape codes
 * - NDJSON (newline-delimited JSON) -- returns an array of parsed values
 *
 * @throws {SyntaxError} When the input is not valid JSON or NDJSON.
 */
export function parseJsonOutput(stdout: string): unknown {
  const trimmed = stripAnsi(stdout).trim();

  if (trimmed.length === 0) {
    return null;
  }

  // Try standard JSON first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to NDJSON attempt.
  }

  // Try newline-delimited JSON (one JSON value per line).
  const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return null;
  }

  // If every non-empty line is valid JSON, treat as NDJSON.
  const parsed: unknown[] = [];
  for (const line of lines) {
    parsed.push(JSON.parse(line.trim()));
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Table parser
// ---------------------------------------------------------------------------

/**
 * Parse whitespace-aligned table output into an array of records.
 *
 * Expects the first non-empty line to be the header row, with subsequent
 * lines as data rows. Column boundaries are detected by splitting on two
 * or more consecutive whitespace characters.
 *
 * Example input:
 * ```
 * NAME     STATUS   AGE
 * nginx    Running  3d
 * redis    Running  7d
 * ```
 *
 * Returns:
 * ```json
 * [
 *   { "NAME": "nginx", "STATUS": "Running", "AGE": "3d" },
 *   { "NAME": "redis", "STATUS": "Running", "AGE": "7d" }
 * ]
 * ```
 */
export function parseTableOutput(stdout: string): Record<string, string>[] {
  const lines = stripAnsi(stdout)
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headerLine = lines[0];
  const headers = splitColumns(headerLine);

  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitColumns(lines[i]);
    const row: Record<string, string> = {};

    for (let col = 0; col < headers.length; col++) {
      row[headers[col]] = values[col] ?? "";
    }

    results.push(row);
  }

  return results;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse simple CSV output into a two-dimensional string array.
 *
 * Handles:
 * - Quoted fields containing commas or newlines
 * - Escaped double-quotes (`""` inside a quoted field)
 *
 * Does **not** handle all RFC 4180 edge cases -- for production-grade CSV
 * parsing, consider a dedicated library.
 */
export function parseCsvOutput(stdout: string): string[][] {
  const trimmed = stripAnsi(stdout).trim();
  if (trimmed.length === 0) {
    return [];
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead for escaped quote.
        if (i + 1 < trimmed.length && trimmed[i + 1] === '"') {
          currentField += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      currentRow.push(currentField);
      currentField = "";
    } else if (ch === "\n") {
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
    } else if (ch === "\r") {
      // Skip carriage returns; the following \n (if any) handles the newline.
      continue;
    } else {
      currentField += ch;
    }
  }

  // Flush remaining field / row.
  currentRow.push(currentField);
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split a line into columns using 2+ whitespace characters as delimiters.
 * Single spaces within a value are preserved.
 */
function splitColumns(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}/)
    .map((col) => col.trim());
}

/**
 * Strip common ANSI escape sequences from a string.
 * Covers CSI sequences (color, cursor, erase) produced by most CLI tools.
 */
function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
