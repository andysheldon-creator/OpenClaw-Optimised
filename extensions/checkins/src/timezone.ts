/**
 * Timezone normalization and natural language date parsing for the check-ins extension.
 */

import { searchTimezone } from "timezone-search";
import * as chrono from "chrono-node";

/**
 * Normalize flexible timezone input to an IANA identifier.
 *
 * Accepts:
 * - IANA identifiers: "America/New_York" -> "America/New_York"
 * - Abbreviations: "EST" -> "America/New_York"
 * - City names: "New York" -> "America/New_York"
 *
 * @param input - Flexible timezone input
 * @returns IANA timezone identifier or null if not found
 */
export function normalizeTimezone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try exact IANA match first
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed; // Valid IANA identifier
  } catch {
    // Not a valid IANA identifier, try fuzzy search
  }

  // Fuzzy search for abbreviations and city names
  const results = searchTimezone(trimmed);
  if (results.length === 0) {
    return null;
  }

  // Return best match IANA identifier
  return results[0].iana;
}

/**
 * Parse natural language date for vacation end time.
 *
 * Accepts:
 * - Relative: "until Friday", "next Monday"
 * - Absolute: "Jan 30", "2026-02-15"
 * - Natural: "end of month", "in 2 weeks"
 *
 * @param input - Natural language date string
 * @param referenceDate - Reference date for relative parsing (defaults to now)
 * @returns Unix timestamp (ms) or null if parsing failed
 */
export function parseVacationEnd(input: string, referenceDate?: Date): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const ref = referenceDate ?? new Date();

  // Parse natural language date
  const result = chrono.parseDate(trimmed, ref);
  if (!result) {
    return null;
  }

  // Return Unix timestamp (ms)
  return result.getTime();
}
