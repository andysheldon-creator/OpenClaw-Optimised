/**
 * Detects shebang-prefixed multiline scripts and wraps the body in a heredoc
 * so the shell delegates execution to the interpreter specified in the shebang.
 *
 * Without this, `sh -c` interprets each line of the script as a separate shell
 * command, causing e.g. Python's `import os` to invoke ImageMagick's `import`.
 */
export function wrapScriptCommand(command: string): string {
  const trimmed = command.trimStart();
  if (!trimmed.startsWith("#!")) {
    return command;
  }

  const newlineIdx = trimmed.indexOf("\n");
  if (newlineIdx === -1) {
    // Shebang-only, no script body to wrap.
    return command;
  }

  const interpreter = trimmed
    .slice(2, newlineIdx)
    .replace(/\r$/, "")
    .trim();
  if (!interpreter) {
    return command;
  }

  const scriptBody = trimmed.slice(newlineIdx + 1);
  if (!scriptBody.trim()) {
    return command;
  }

  // Use a heredoc with a single-quoted marker to prevent shell variable
  // expansion inside the script body.
  const marker = "OPENCLAW_SCRIPT_EOF";
  return `${interpreter} <<'${marker}'\n${scriptBody}\n${marker}`;
}

export function buildNodeShellCommand(command: string, platform?: string | null) {
  const normalized = String(platform ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("win")) {
    return ["cmd.exe", "/d", "/s", "/c", command];
  }
  return ["/bin/sh", "-lc", wrapScriptCommand(command)];
}
