/**
 * Command Favorites — localStorage-backed favorites for the command palette.
 *
 * Allows users to pin frequently-used commands so they appear in a
 * dedicated "Favorites" section at the top of the command palette.
 */

const STORAGE_KEY = "clawdbrain:command-favorites";

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function readStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeStorage(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a command is favorited.
 */
export function isFavorite(commandId: string): boolean {
  return readStorage().includes(commandId);
}

/**
 * Add a command to favorites.  No-op if already present.
 */
export function addFavorite(commandId: string): void {
  const ids = readStorage();
  if (!ids.includes(commandId)) {
    writeStorage([...ids, commandId]);
  }
}

/**
 * Remove a command from favorites.  No-op if not present.
 */
export function removeFavorite(commandId: string): void {
  const ids = readStorage();
  writeStorage(ids.filter((id) => id !== commandId));
}

/**
 * Toggle a command's favorite status.
 * @returns `true` if the command is now a favorite, `false` if removed.
 */
export function toggleFavorite(commandId: string): boolean {
  if (isFavorite(commandId)) {
    removeFavorite(commandId);
    return false;
  }
  addFavorite(commandId);
  return true;
}

/**
 * Return all favorited command IDs (in insertion order).
 */
export function getFavoriteIds(): string[] {
  return readStorage();
}

/**
 * Clear all favorites.
 */
export function clearFavorites(): void {
  writeStorage([]);
}
