import type { Command } from "commander";
import { setTimeout as delay } from "node:timers/promises";
import { formatDocsLink } from "../terminal/links.js";
import { colorize, isRich, theme } from "../terminal/theme.js";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

type LogsTailPayload = {
  file?: string;
  cursor?: number;
  size?: number;
  lines?: string[];
  truncated?: boolean;
  reset?: boolean;
};

type LogsCliOptions = {
  limit?: string;
  maxBytes?: string;
  follow?: boolean;
  interval?: string;
  json?: boolean;
  plain?: boolean;
  color?: boolean;
  url?: string;
  token?: string;
  timeout?: string;
  expectFinal?: boolean;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchLogs(
  opts: LogsCliOptions,
  cursor: number | undefined,
  showProgress: boolean,
): Promise<LogsTailPayload> {
  const limit = parsePositiveInt(opts.limit, 200);
  const maxBytes = parsePositiveInt(opts.maxBytes, 250_000);
  const payload = await callGatewayFromCli(
    "logs.tail",
    opts,
    { cursor, limit, maxBytes },
    { progress: showProgress },
  );
  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected logs.tail response");
  }
  return payload as LogsTailPayload;
}

function formatLogTimestamp(value?: string, mode: "pretty" | "plain" = "plain") {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  if (mode === "pretty") {
    return parsed.toISOString().slice(11, 19);
  }
  return parsed.toISOString();
}

export function registerLogsCli(program: Command) {
  const logs = program
    .command("logs")
    .description("Tail gateway file logs via RPC")
    .option("--limit <n>", "Max lines to return", "200")
    .option("--max-bytes <n>", "Max bytes to read", "250000")
    .option("--follow", "Follow log output", false)
    .option("--interval <ms>", "Polling interval in ms", "1000")
    .option("--json", "Emit JSON log lines", false)
    .option("--plain", "Plain text output (no ANSI styling)", false)
    .option("--no-color", "Disable ANSI colors")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/logs", "docs.openclaw.ai/cli/logs")}\n`,
    );

  addGatewayClientOptions(logs);

  logs.action(async (opts: LogsCliOptions) => {
    const { parseLogLine } = await import("../logging/parse-log-line.js");
    const { buildGatewayConnectionDetails } = await import("../gateway/call.js");
    const { clearActiveProgressLine } = await import("../terminal/progress-line.js");
    const { createSafeStreamWriter } = await import("../terminal/stream-writer.js");
    const { formatCliCommand } = await import("./command-format.js");

    function formatLogLine(
      raw: string,
      fmtOpts: {
        pretty: boolean;
        rich: boolean;
      },
    ): string {
      const parsed = parseLogLine(raw);
      if (!parsed) {
        return raw;
      }
      const label = parsed.subsystem ?? parsed.module ?? "";
      const time = formatLogTimestamp(parsed.time, fmtOpts.pretty ? "pretty" : "plain");
      const level = parsed.level ?? "";
      const levelLabel = level.padEnd(5).trim();
      const message = parsed.message || parsed.raw;

      if (!fmtOpts.pretty) {
        return [time, level, label, message].filter(Boolean).join(" ").trim();
      }

      const timeLabel = colorize(fmtOpts.rich, theme.muted, time);
      const labelValue = colorize(fmtOpts.rich, theme.accent, label);
      const levelValue =
        level === "error" || level === "fatal"
          ? colorize(fmtOpts.rich, theme.error, levelLabel)
          : level === "warn"
            ? colorize(fmtOpts.rich, theme.warn, levelLabel)
            : level === "debug" || level === "trace"
              ? colorize(fmtOpts.rich, theme.muted, levelLabel)
              : colorize(fmtOpts.rich, theme.info, levelLabel);
      const messageValue =
        level === "error" || level === "fatal"
          ? colorize(fmtOpts.rich, theme.error, message)
          : level === "warn"
            ? colorize(fmtOpts.rich, theme.warn, message)
            : level === "debug" || level === "trace"
              ? colorize(fmtOpts.rich, theme.muted, message)
              : colorize(fmtOpts.rich, theme.info, message);

      const head = [timeLabel, levelValue, labelValue].filter(Boolean).join(" ");
      return [head, messageValue].filter(Boolean).join(" ").trim();
    }

    function createLogWriters() {
      const writer = createSafeStreamWriter({
        beforeWrite: () => clearActiveProgressLine(),
        onBrokenPipe: (err, stream) => {
          const code = err.code ?? "EPIPE";
          const target = stream === process.stdout ? "stdout" : "stderr";
          const message = `openclaw logs: output ${target} closed (${code}). Stopping tail.`;
          try {
            clearActiveProgressLine();
            process.stderr.write(`${message}\n`);
          } catch {
            // ignore secondary failures while reporting the broken pipe
          }
        },
      });

      return {
        logLine: (text: string) => writer.writeLine(process.stdout, text),
        errorLine: (text: string) => writer.writeLine(process.stderr, text),
        emitJsonLine: (payload: Record<string, unknown>, toStdErr = false) =>
          writer.write(toStdErr ? process.stderr : process.stdout, `${JSON.stringify(payload)}\n`),
      };
    }

    function emitGatewayError(
      err: unknown,
      errOpts: LogsCliOptions,
      mode: "json" | "text",
      rich: boolean,
      emitJsonLine: (payload: Record<string, unknown>, toStdErr?: boolean) => boolean,
      errorLine: (text: string) => boolean,
    ) {
      const details = buildGatewayConnectionDetails({ url: errOpts.url });
      const message = "Gateway not reachable. Is it running and accessible?";
      const hint = `Hint: run \`${formatCliCommand("openclaw doctor")}\`.`;
      const errorText = err instanceof Error ? err.message : String(err);

      if (mode === "json") {
        if (
          !emitJsonLine(
            {
              type: "error",
              message,
              error: errorText,
              details,
              hint,
            },
            true,
          )
        ) {
          return;
        }
        return;
      }

      if (!errorLine(colorize(rich, theme.error, message))) {
        return;
      }
      if (!errorLine(details.message)) {
        return;
      }
      errorLine(colorize(rich, theme.muted, hint));
    }

    const { logLine, errorLine, emitJsonLine } = createLogWriters();
    const interval = parsePositiveInt(opts.interval, 1000);
    let cursor: number | undefined;
    let first = true;
    const jsonMode = Boolean(opts.json);
    const pretty = !jsonMode && Boolean(process.stdout.isTTY) && !opts.plain;
    const rich = isRich() && opts.color !== false;

    while (true) {
      let payload: LogsTailPayload;
      // Show progress spinner only on first fetch, not during follow polling
      const showProgress = first && !opts.follow;
      try {
        payload = await fetchLogs(opts, cursor, showProgress);
      } catch (err) {
        emitGatewayError(err, opts, jsonMode ? "json" : "text", rich, emitJsonLine, errorLine);
        process.exit(1);
        return;
      }
      const lines = Array.isArray(payload.lines) ? payload.lines : [];
      if (jsonMode) {
        if (first) {
          if (
            !emitJsonLine({
              type: "meta",
              file: payload.file,
              cursor: payload.cursor,
              size: payload.size,
            })
          ) {
            return;
          }
        }
        for (const line of lines) {
          const parsed = parseLogLine(line);
          if (parsed) {
            if (!emitJsonLine({ type: "log", ...parsed })) {
              return;
            }
          } else {
            if (!emitJsonLine({ type: "raw", raw: line })) {
              return;
            }
          }
        }
        if (payload.truncated) {
          if (
            !emitJsonLine({
              type: "notice",
              message: "Log tail truncated (increase --max-bytes).",
            })
          ) {
            return;
          }
        }
        if (payload.reset) {
          if (
            !emitJsonLine({
              type: "notice",
              message: "Log cursor reset (file rotated).",
            })
          ) {
            return;
          }
        }
      } else {
        if (first && payload.file) {
          const prefix = pretty ? colorize(rich, theme.muted, "Log file:") : "Log file:";
          if (!logLine(`${prefix} ${payload.file}`)) {
            return;
          }
        }
        for (const line of lines) {
          if (
            !logLine(
              formatLogLine(line, {
                pretty,
                rich,
              }),
            )
          ) {
            return;
          }
        }
        if (payload.truncated) {
          if (!errorLine("Log tail truncated (increase --max-bytes).")) {
            return;
          }
        }
        if (payload.reset) {
          if (!errorLine("Log cursor reset (file rotated).")) {
            return;
          }
        }
      }
      cursor =
        typeof payload.cursor === "number" && Number.isFinite(payload.cursor)
          ? payload.cursor
          : cursor;
      first = false;

      if (!opts.follow) {
        return;
      }
      await delay(interval);
    }
  });
}
