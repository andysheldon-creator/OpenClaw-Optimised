/**
 * Improve Sources - File scanning and blocklist filtering
 *
 * Handles discovering improvement opportunities while enforcing
 * security blocklist to protect sensitive files.
 */

import { randomBytes } from "node:crypto";
import type {
  BlocklistCheckResult,
  ImproveOpportunityId,
  ImprovementOpportunity,
  OpportunityConfidence,
} from "./improve-types.js";
import { DEFAULT_BLOCKLIST } from "./improve-types.js";

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique opportunity ID.
 * Format: opp-{8 random hex chars}
 */
export function generateOpportunityId(): ImproveOpportunityId {
  const suffix = randomBytes(4).toString("hex");
  return `opp-${suffix}`;
}

/**
 * Validate an opportunity ID format.
 */
export function isValidOpportunityId(id: string): id is ImproveOpportunityId {
  return /^opp-[a-f0-9]{8}$/.test(id);
}

// =============================================================================
// Blocklist Management
// =============================================================================

/**
 * Merge default blocklist with custom patterns.
 */
export function buildFullBlocklist(customPatterns: string[] = []): string[] {
  const combined = [...DEFAULT_BLOCKLIST, ...customPatterns];
  // Deduplicate
  return [...new Set(combined)];
}

/**
 * Simple glob pattern matching (supports * and **).
 *
 * Pattern rules:
 * - Single star matches any characters except /
 * - Double star matches any characters including /
 * - Leading double star slash matches the root or any subdirectory
 * - Middle double star slash matches zero or more path segments
 * - Trailing slash double star matches any files in that directory tree
 */
function matchGlobPattern(filePath: string, pattern: string): boolean {
  // Normalize the path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Handle special case: pattern starts with **/
  // This should also match files at the root level
  let modifiedPattern = pattern;
  let leadingDoubleStarSlash = false;
  if (modifiedPattern.startsWith("**/")) {
    leadingDoubleStarSlash = true;
    modifiedPattern = modifiedPattern.slice(3);
  }

  // Handle special case: pattern ends with /**
  // This should match any files in that directory tree
  let trailingSlashDoubleStar = false;
  if (modifiedPattern.endsWith("/**")) {
    trailingSlashDoubleStar = true;
    modifiedPattern = modifiedPattern.slice(0, -3);
  }

  // Convert glob pattern to regex
  let regex = modifiedPattern
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Handle /**/ in the middle - matches zero or more path segments
    .replace(/\/\*\*\//g, "(?:/|/.*/)")
    // Convert remaining ** to match any path segments
    .replace(/\*\*/g, ".*")
    // Convert * to match any single path segment
    .replace(/\*/g, "[^/]*");

  // Build the final regex based on special cases
  if (leadingDoubleStarSlash) {
    // Match at root or after any path prefix
    regex = `(?:^|.*/)${regex}`;
  } else {
    regex = `^${regex}`;
  }

  if (trailingSlashDoubleStar) {
    // Match any files in the directory tree
    regex = `${regex}(?:/.*)?$`;
  } else {
    regex = `${regex}$`;
  }

  return new RegExp(regex).test(normalizedPath);
}

/**
 * Check if a file path matches the blocklist.
 */
export function checkBlocklist(filePath: string, blocklist: string[]): BlocklistCheckResult {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, "/");

  for (const pattern of blocklist) {
    if (matchGlobPattern(normalizedPath, pattern)) {
      return {
        blocked: true,
        matchedPattern: pattern,
        reason: getBlockReason(pattern),
      };
    }
  }

  return { blocked: false };
}

/**
 * Get a human-readable reason for why a pattern blocks files.
 */
function getBlockReason(pattern: string): string {
  if (pattern.includes("web-policy") || pattern.includes("web-operator")) {
    return "Security policy file (protected from modification)";
  }
  if (pattern.includes("allowlist")) {
    return "Allowlist configuration (security-sensitive)";
  }
  if (pattern.includes(".env") || pattern.includes("env.")) {
    return "Environment configuration (may contain secrets)";
  }
  if (pattern.includes("credentials") || pattern.includes("secrets")) {
    return "Credentials/secrets directory (security-sensitive)";
  }
  return "Protected file (matches blocklist pattern)";
}

/**
 * Filter a list of files against the blocklist.
 * Returns both allowed and blocked files.
 */
export function filterByBlocklist(
  files: string[],
  blocklist: string[],
): { allowed: string[]; blocked: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];

  for (const file of files) {
    const check = checkBlocklist(file, blocklist);
    if (check.blocked) {
      blocked.push(file);
    } else {
      allowed.push(file);
    }
  }

  return { allowed, blocked };
}

// =============================================================================
// Scope Matching
// =============================================================================

/**
 * Check if a file path matches any of the scope patterns.
 */
export function matchesScope(filePath: string, scope: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");

  for (const pattern of scope) {
    if (matchGlobPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter files to only those matching scope.
 */
export function filterByScope(files: string[], scope: string[]): string[] {
  return files.filter((file) => matchesScope(file, scope));
}

// =============================================================================
// Opportunity Analysis
// =============================================================================

/**
 * Analyze a file and identify improvement opportunities.
 * This is a simplified version - in practice would use LLM analysis.
 */
export function analyzeFileForOpportunities(
  filePath: string,
  content: string,
): ImprovementOpportunity[] {
  const opportunities: ImprovementOpportunity[] = [];
  const lines = content.split("\n");

  // Check for common improvement patterns
  // This is a simplified heuristic - real implementation would use LLM

  // 1. TODO comments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("TODO:") || line.includes("FIXME:")) {
      opportunities.push({
        id: generateOpportunityId(),
        type: "bugfix",
        file: filePath,
        line: i + 1,
        description: `Address ${line.includes("TODO:") ? "TODO" : "FIXME"} comment`,
        confidence: "high",
        estimatedLines: 10,
        rationale: "Unresolved TODO/FIXME comments indicate incomplete work",
      });
    }
  }

  // 2. Long functions (over 50 lines)
  const functionMatches = content.matchAll(
    /(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?(?:\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{)/g,
  );
  for (const match of functionMatches) {
    const startIndex = match.index ?? 0;
    const startLine = content.slice(0, startIndex).split("\n").length;

    // Simplified: count lines until next function or end
    const remaining = content.slice(startIndex);
    const functionLines = remaining.split("\n").slice(0, 100); // Cap at 100 lines
    let braceCount = 0;
    let lineCount = 0;

    for (const line of functionLines) {
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      lineCount++;
      if (braceCount <= 0 && lineCount > 1) {
        break;
      }
    }

    if (lineCount > 50) {
      opportunities.push({
        id: generateOpportunityId(),
        type: "refactor",
        file: filePath,
        line: startLine,
        description: `Consider breaking down long function (~${lineCount} lines)`,
        confidence: "medium",
        estimatedLines: lineCount,
        rationale: "Long functions are harder to understand and maintain",
      });
    }
  }

  // 3. Missing error handling (catch blocks that just log)
  const catchMatches = content.matchAll(/catch\s*\([^)]*\)\s*\{\s*console\.(log|error)/g);
  for (const match of catchMatches) {
    const startIndex = match.index ?? 0;
    const startLine = content.slice(0, startIndex).split("\n").length;

    opportunities.push({
      id: generateOpportunityId(),
      type: "bugfix",
      file: filePath,
      line: startLine,
      description: "Improve error handling (currently just logs)",
      confidence: "medium",
      estimatedLines: 5,
      rationale: "Error handling should recover or re-throw, not just log",
    });
  }

  // 4. Duplicate code patterns (simplified - just check for very similar lines)
  const lineFrequency = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 20 && !trimmed.startsWith("//") && !trimmed.startsWith("*")) {
      lineFrequency.set(trimmed, (lineFrequency.get(trimmed) ?? 0) + 1);
    }
  }

  for (const [line, count] of lineFrequency) {
    if (count >= 3) {
      opportunities.push({
        id: generateOpportunityId(),
        type: "refactor",
        file: filePath,
        description: `Potential duplication: "${line.slice(0, 40)}..." appears ${count} times`,
        confidence: "low",
        estimatedLines: count * 2,
        rationale: "Duplicate code should be extracted into a reusable function",
      });
      break; // Only report one duplication issue per file
    }
  }

  // 5. Missing tests (if in src/ but no corresponding test file)
  if (filePath.includes("/src/") && !filePath.includes(".test.")) {
    const testPath = filePath.replace(".ts", ".test.ts");
    opportunities.push({
      id: generateOpportunityId(),
      type: "test",
      file: filePath,
      description: `Consider adding tests (expected: ${testPath.split("/").pop()})`,
      confidence: "low",
      estimatedLines: 50,
      rationale: "Untested code is more likely to contain bugs",
    });
  }

  return opportunities;
}

/**
 * Estimate the number of lines that would change for an opportunity.
 */
export function estimateChangeLines(opportunity: ImprovementOpportunity): number {
  // Use the pre-computed estimate
  return opportunity.estimatedLines;
}

/**
 * Calculate total estimated lines for a list of opportunities.
 */
export function calculateTotalLines(opportunities: ImprovementOpportunity[]): number {
  return opportunities.reduce((sum, opp) => sum + opp.estimatedLines, 0);
}

/**
 * Sort opportunities by confidence (high first) then by estimated lines (smallest first).
 */
export function sortOpportunities(
  opportunities: ImprovementOpportunity[],
): ImprovementOpportunity[] {
  const confidenceOrder: Record<OpportunityConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return opportunities.toSorted((a, b) => {
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) {
      return confDiff;
    }
    return a.estimatedLines - b.estimatedLines;
  });
}

/**
 * Filter opportunities to fit within line budget.
 */
export function filterToLineBudget(
  opportunities: ImprovementOpportunity[],
  maxLines: number,
): ImprovementOpportunity[] {
  const sorted = sortOpportunities(opportunities);
  const selected: ImprovementOpportunity[] = [];
  let totalLines = 0;

  for (const opp of sorted) {
    if (totalLines + opp.estimatedLines <= maxLines) {
      selected.push(opp);
      totalLines += opp.estimatedLines;
    }
  }

  return selected;
}
