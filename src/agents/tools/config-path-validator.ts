/**
 * Config path validator for agent governance.
 * Prevents agents from accidentally modifying config paths outside their authority.
 */

/**
 * Check if a config path matches a glob-like pattern.
 *
 * Patterns support:
 * - Exact match: "agents.list.0.model"
 * - Wildcard segments: "agents.*.model" (matches any single segment)
 * - Deep wildcard: "agents.**" (matches any nested path)
 * - Array indices: "agents.list.0.*" or "agents.list.*.model"
 *
 * @param path - The config path to test (dot-separated)
 * @param pattern - The pattern to match against
 * @returns true if the path matches the pattern
 */
export function matchesConfigPath(path: string, pattern: string): boolean {
  const pathParts = path.split(".");
  const patternParts = pattern.split(".");

  let pathIndex = 0;
  let patternIndex = 0;

  while (pathIndex < pathParts.length && patternIndex < patternParts.length) {
    const patternPart = patternParts[patternIndex];

    // Handle deep wildcard: "**" matches zero or more segments
    if (patternPart === "**") {
      // If ** is the last pattern part, it matches everything remaining
      if (patternIndex === patternParts.length - 1) {
        return true;
      }

      // Try to match the rest of the pattern against remaining path
      const nextPatternPart = patternParts[patternIndex + 1];
      while (pathIndex < pathParts.length) {
        if (
          matchesConfigPath(
            pathParts.slice(pathIndex).join("."),
            patternParts.slice(patternIndex + 1).join("."),
          )
        ) {
          return true;
        }
        pathIndex++;
      }
      return false;
    }

    // Handle single-segment wildcard: "*" matches exactly one segment
    if (patternPart === "*") {
      pathIndex++;
      patternIndex++;
      continue;
    }

    // Exact match required
    if (pathParts[pathIndex] !== patternPart) {
      return false;
    }

    pathIndex++;
    patternIndex++;
  }

  // Both must be fully consumed for a match
  return pathIndex === pathParts.length && patternIndex === patternParts.length;
}

/**
 * Validate that all paths in a config patch are allowed by the agent's path restrictions.
 *
 * @param patchPaths - Array of config paths being modified
 * @param allowedPatterns - Array of allowed path patterns (undefined = allow all)
 * @returns { allowed: true } or { allowed: false, blockedPaths: [...] }
 */
export function validateConfigPaths(
  patchPaths: string[],
  allowedPatterns?: string[],
): { allowed: true } | { allowed: false; blockedPaths: string[] } {
  // If no restrictions configured, allow everything (backward compatible)
  if (!allowedPatterns || allowedPatterns.length === 0) {
    return { allowed: true };
  }

  const blockedPaths: string[] = [];

  for (const path of patchPaths) {
    const isAllowed = allowedPatterns.some((pattern) => matchesConfigPath(path, pattern));
    if (!isAllowed) {
      blockedPaths.push(path);
    }
  }

  if (blockedPaths.length > 0) {
    return { allowed: false, blockedPaths };
  }

  return { allowed: true };
}

/**
 * Extract all leaf paths from a nested config object.
 *
 * Example:
 *   { agents: { list: [{ model: "gpt-4" }] } }
 *   => ["agents.list.0.model"]
 *
 * @param obj - The config patch object
 * @param prefix - Current path prefix (used internally for recursion)
 * @returns Array of dot-separated paths
 */
export function extractConfigPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || obj === undefined) {
    return prefix ? [prefix] : [];
  }

  if (typeof obj !== "object") {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(obj)) {
    const paths: string[] = [];
    for (let i = 0; i < obj.length; i++) {
      const itemPaths = extractConfigPaths(obj[i], prefix ? `${prefix}.${i}` : `${i}`);
      paths.push(...itemPaths);
    }
    return paths.length > 0 ? paths : prefix ? [prefix] : [];
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return prefix ? [prefix] : [];
  }

  const paths: string[] = [];
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    const childPaths = extractConfigPaths(value, childPrefix);
    paths.push(...childPaths);
  }

  return paths;
}
