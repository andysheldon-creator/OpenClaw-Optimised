import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RipgrepToolSchema = Type.Object({
  pattern: Type.String({
    description: "Search pattern (regex by default). Use fixed_strings=true for literal matching.",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "File or directory to search. Defaults to the current working directory. " +
        "Supports absolute paths or paths relative to cwd.",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description:
        'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}", "!*.test.*"). ' +
        "Can be specified multiple times separated by commas.",
    }),
  ),
  ignore_case: Type.Optional(
    Type.Boolean({
      description: "Case-insensitive search. Default: false (case-sensitive).",
    }),
  ),
  fixed_strings: Type.Optional(
    Type.Boolean({
      description:
        "Treat the pattern as a literal string instead of a regex. " +
        "Useful for searching for special characters like dots, brackets, etc.",
    }),
  ),
  word_regexp: Type.Optional(
    Type.Boolean({
      description: "Only match whole words (surrounded by word boundaries).",
    }),
  ),
  context_lines: Type.Optional(
    Type.Number({
      description: "Number of lines of context to show before and after each match. Default: 0.",
    }),
  ),
  max_results: Type.Optional(
    Type.Number({
      description:
        "Maximum number of matching lines to return. Default: 200. " +
        "Use a lower number for broad patterns to avoid overwhelming output.",
    }),
  ),
  max_filesize: Type.Optional(
    Type.String({
      description: 'Skip files larger than this size (e.g. "1M", "500K"). Default: 1M.',
    }),
  ),
  include_hidden: Type.Optional(
    Type.Boolean({
      description:
        "Search hidden files and directories (those starting with a dot). " +
        "Default: false (respects .gitignore and skips hidden files).",
    }),
  ),
  no_ignore: Type.Optional(
    Type.Boolean({
      description: "Don't respect .gitignore, .ignore, and other ignore files. Default: false.",
    }),
  ),
  file_type: Type.Optional(
    Type.String({
      description:
        'Restrict search to files matching a type (e.g. "ts", "py", "json", "md"). ' +
        "Uses ripgrep's built-in type definitions. Separate multiple types with commas.",
    }),
  ),
  multiline: Type.Optional(
    Type.Boolean({
      description: "Enable multiline matching. Allows patterns to match across line boundaries.",
    }),
  ),
  invert_match: Type.Optional(
    Type.Boolean({
      description: "Show lines that do NOT match the pattern.",
    }),
  ),
  count_only: Type.Optional(
    Type.Boolean({
      description: "Only show the count of matching lines per file, not the matches themselves.",
    }),
  ),
  files_with_matches: Type.Optional(
    Type.Boolean({
      description: "Only show filenames that contain matches, not the matching lines.",
    }),
  ),
  pcre2: Type.Optional(
    Type.Boolean({
      description:
        "Use PCRE2 regex engine for advanced features like lookahead, lookbehind, and backreferences.",
    }),
  ),
  replace: Type.Optional(
    Type.String({
      description:
        "Replace matches with the given text in the output (does NOT modify files). " +
        "Useful for previewing substitutions. Supports capture group references ($1, $2, etc.).",
    }),
  ),
});

// ---------------------------------------------------------------------------
// Defaults & limits
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RESULTS = 200;
const HARD_MAX_RESULTS = 1000;
const DEFAULT_MAX_FILESIZE = "1M";
const MAX_OUTPUT_BYTES = 128 * 1024; // 128 KB — protect against huge outputs

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findRipgrep(): Promise<string> {
  // Check common locations
  const candidates = ["/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg"];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  // Fall back to PATH resolution
  return "rg";
}

function buildArgs(
  params: Record<string, unknown>,
  cwd: string,
): { args: string[]; searchPath: string } {
  const pattern = readStringParam(params, "pattern", { required: true });
  const rawPath = readStringParam(params, "path");
  const glob = readStringParam(params, "glob");
  const ignoreCase = params.ignore_case === true;
  const fixedStrings = params.fixed_strings === true;
  const wordRegexp = params.word_regexp === true;
  const contextLines = readNumberParam(params, "context_lines", { integer: true });
  const maxFilesize = readStringParam(params, "max_filesize");
  const includeHidden = params.include_hidden === true;
  const noIgnore = params.no_ignore === true;
  const fileType = readStringParam(params, "file_type");
  const multiline = params.multiline === true;
  const invertMatch = params.invert_match === true;
  const countOnly = params.count_only === true;
  const filesWithMatches = params.files_with_matches === true;
  const pcre2 = params.pcre2 === true;
  const replace = readStringParam(params, "replace");

  // Resolve search path relative to cwd
  const searchPath = rawPath ? resolve(cwd, rawPath) : cwd;

  const args: string[] = [
    "--color",
    "never",
    "--line-number",
    "--no-heading",
    "--with-filename",
    "--max-filesize",
    maxFilesize ?? DEFAULT_MAX_FILESIZE,
  ];

  // --max-count is per-file in rg, so we can't use it for a global limit.
  // Instead, we'll limit output in post-processing.

  // Boolean flags
  if (ignoreCase) args.push("--ignore-case");
  if (fixedStrings) args.push("--fixed-strings");
  if (wordRegexp) args.push("--word-regexp");
  if (includeHidden) args.push("--hidden");
  if (noIgnore) args.push("--no-ignore");
  if (multiline) args.push("--multiline");
  if (invertMatch) args.push("--invert-match");
  if (countOnly) args.push("--count");
  if (filesWithMatches) args.push("--files-with-matches");
  if (pcre2) args.push("--pcre2");

  // Context lines
  if (contextLines !== undefined && contextLines > 0) {
    args.push("--context", String(Math.min(contextLines, 20)));
  }

  // Replace
  if (replace !== undefined) {
    args.push("--replace", replace);
  }

  // Glob filters (split by comma for multiple globs)
  if (glob) {
    for (const g of glob
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      args.push("--glob", g);
    }
  }

  // File type filters (split by comma for multiple types)
  if (fileType) {
    for (const ft of fileType
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      args.push("--type", ft);
    }
  }

  // Pattern and path (pattern before path for rg)
  args.push("--", pattern, searchPath);

  return { args, searchPath };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRipgrepTool(opts?: {
  /** Override the working directory for relative path resolution. */
  workspaceDir?: string;
}): AnyAgentTool {
  return {
    label: "Ripgrep",
    name: "ripgrep",
    description:
      "Search file contents using ripgrep (rg) — a fast, recursive, regex-based search tool. " +
      "Returns matching lines with file paths and line numbers. Respects .gitignore by default. " +
      "Use for: finding code patterns, searching across a codebase, locating string occurrences, " +
      "grepping logs, or any text search across files. " +
      "Prefer this over exec+grep for all file content searches.",
    parameters: RipgrepToolSchema,
    execute: async (_toolCallId, args, signal) => {
      const params = args as Record<string, unknown>;

      const cwd = opts?.workspaceDir ?? process.cwd();
      const rgPath = await findRipgrep();

      let builtArgs: { args: string[]; searchPath: string };
      try {
        builtArgs = buildArgs(params, cwd);
      } catch (err) {
        return jsonResult({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const { args: rgArgs, searchPath } = builtArgs;

      try {
        const maxResults = readNumberParam(params, "max_results", { integer: true });
        const effectiveMaxResults = Math.min(maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS);

        const { stdout, stderr } = await execFileAsync(rgPath, rgArgs, {
          cwd,
          maxBuffer: MAX_OUTPUT_BYTES,
          timeout: 30_000, // 30 second timeout
          signal: signal instanceof AbortSignal ? signal : undefined,
          env: {
            ...process.env,
            // Ensure rg doesn't try to use a config file that might override our flags
            RIPGREP_CONFIG_PATH: "",
          },
        });

        const rawOutput = stdout.trimEnd();
        const allLines = rawOutput ? rawOutput.split("\n") : [];
        const totalMatchCount = allLines.length;

        // Truncate to max_results
        let truncated = stdout.length >= MAX_OUTPUT_BYTES - 1;
        let lines = allLines;
        if (totalMatchCount > effectiveMaxResults) {
          lines = allLines.slice(0, effectiveMaxResults);
          truncated = true;
        }

        const output = lines.join("\n");
        const matchCount = lines.length;

        // Build result
        const result: Record<string, unknown> = {
          match_count: matchCount,
          total_matches: totalMatchCount > matchCount ? totalMatchCount : undefined,
          search_path: searchPath,
        };

        if (truncated) {
          result.truncated = true;
          result.note =
            "Output was truncated. Use more specific patterns, globs, or lower max_results.";
        }

        if (stderr?.trim()) {
          result.warnings = stderr.trim();
        }

        if (output) {
          result.matches = output;
        } else {
          result.matches = "";
          result.note = "No matches found.";
        }

        return jsonResult(result);
      } catch (err: unknown) {
        // ripgrep exits with code 1 when no matches are found — this is normal
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: number }).code === 1
        ) {
          return jsonResult({
            match_count: 0,
            search_path: searchPath,
            matches: "",
            note: "No matches found.",
          });
        }

        // ripgrep exits with code 2 for usage errors
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: number }).code === 2
        ) {
          const stderr = (err as { stderr?: string }).stderr?.trim() ?? "Unknown ripgrep error";
          return jsonResult({
            error: `ripgrep error: ${stderr}`,
            search_path: searchPath,
          });
        }

        // Buffer overflow
        if (err instanceof Error && err.message.includes("maxBuffer")) {
          // Try to salvage partial output
          const partialStdout = (err as { stdout?: string }).stdout ?? "";
          const lines = partialStdout.trimEnd().split("\n");
          return jsonResult({
            match_count: lines.length,
            search_path: searchPath,
            truncated: true,
            note:
              "Output exceeded maximum buffer size. Showing partial results. " +
              "Use more specific patterns, globs, file_type, or lower max_results.",
            matches: partialStdout.trimEnd(),
          });
        }

        // Abort
        if (err instanceof Error && err.name === "AbortError") {
          throw err; // Let the tool bridge handle AbortError
        }

        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({
          error: `ripgrep execution failed: ${message}`,
          search_path: searchPath,
        });
      }
    },
  };
}
