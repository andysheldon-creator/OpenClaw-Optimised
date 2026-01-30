import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";

import { loadConfig, writeConfigFile } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { runSecurityAudit } from "../security/audit.js";
import { fixSecurityFootguns } from "../security/fix.js";
import { ipManager } from "../security/ip-manager.js";
import { DEFAULT_LOG_DIR } from "../logging/logger.js";
import { formatDocsLink } from "../terminal/links.js";
import { isRich, theme } from "../terminal/theme.js";
import { shortenHomeInString, shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";
import { parseDuration } from "./parse-duration.js";

type SecurityAuditOptions = {
  json?: boolean;
  deep?: boolean;
  fix?: boolean;
};

function formatSummary(summary: { critical: number; warn: number; info: number }): string {
  const rich = isRich();
  const c = summary.critical;
  const w = summary.warn;
  const i = summary.info;
  const parts: string[] = [];
  parts.push(rich ? theme.error(`${c} critical`) : `${c} critical`);
  parts.push(rich ? theme.warn(`${w} warn`) : `${w} warn`);
  parts.push(rich ? theme.muted(`${i} info`) : `${i} info`);
  return parts.join(" · ");
}

export function registerSecurityCli(program: Command) {
  const security = program
    .command("security")
    .description("Security tools (audit)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/security", "docs.openclaw.ai/cli/security")}\n`,
    );

  security
    .command("audit")
    .description("Audit config + local state for common security foot-guns")
    .option("--deep", "Attempt live Gateway probe (best-effort)", false)
    .option("--fix", "Apply safe fixes (tighten defaults + chmod state/config)", false)
    .option("--json", "Print JSON", false)
    .action(async (opts: SecurityAuditOptions) => {
      const fixResult = opts.fix ? await fixSecurityFootguns().catch((_err) => null) : null;

      const cfg = loadConfig();
      const report = await runSecurityAudit({
        config: cfg,
        deep: Boolean(opts.deep),
        includeFilesystem: true,
        includeChannelSecurity: true,
      });

      if (opts.json) {
        defaultRuntime.log(
          JSON.stringify(fixResult ? { fix: fixResult, report } : report, null, 2),
        );
        return;
      }

      const rich = isRich();
      const heading = (text: string) => (rich ? theme.heading(text) : text);
      const muted = (text: string) => (rich ? theme.muted(text) : text);

      const lines: string[] = [];
      lines.push(heading("OpenClaw security audit"));
      lines.push(muted(`Summary: ${formatSummary(report.summary)}`));
      lines.push(muted(`Run deeper: ${formatCliCommand("openclaw security audit --deep")}`));

      if (opts.fix) {
        lines.push(muted(`Fix: ${formatCliCommand("openclaw security audit --fix")}`));
        if (!fixResult) {
          lines.push(muted("Fixes: failed to apply (unexpected error)"));
        } else if (
          fixResult.errors.length === 0 &&
          fixResult.changes.length === 0 &&
          fixResult.actions.every((a) => a.ok === false)
        ) {
          lines.push(muted("Fixes: no changes applied"));
        } else {
          lines.push("");
          lines.push(heading("FIX"));
          for (const change of fixResult.changes) {
            lines.push(muted(`  ${shortenHomeInString(change)}`));
          }
          for (const action of fixResult.actions) {
            if (action.kind === "chmod") {
              const mode = action.mode.toString(8).padStart(3, "0");
              if (action.ok) lines.push(muted(`  chmod ${mode} ${shortenHomePath(action.path)}`));
              else if (action.skipped)
                lines.push(
                  muted(`  skip chmod ${mode} ${shortenHomePath(action.path)} (${action.skipped})`),
                );
              else if (action.error)
                lines.push(
                  muted(`  chmod ${mode} ${shortenHomePath(action.path)} failed: ${action.error}`),
                );
              continue;
            }
            const command = shortenHomeInString(action.command);
            if (action.ok) lines.push(muted(`  ${command}`));
            else if (action.skipped) lines.push(muted(`  skip ${command} (${action.skipped})`));
            else if (action.error) lines.push(muted(`  ${command} failed: ${action.error}`));
          }
          if (fixResult.errors.length > 0) {
            for (const err of fixResult.errors) {
              lines.push(muted(`  error: ${shortenHomeInString(err)}`));
            }
          }
        }
      }

      const bySeverity = (sev: "critical" | "warn" | "info") =>
        report.findings.filter((f) => f.severity === sev);

      const render = (sev: "critical" | "warn" | "info") => {
        const list = bySeverity(sev);
        if (list.length === 0) return;
        const label =
          sev === "critical"
            ? rich
              ? theme.error("CRITICAL")
              : "CRITICAL"
            : sev === "warn"
              ? rich
                ? theme.warn("WARN")
                : "WARN"
              : rich
                ? theme.muted("INFO")
                : "INFO";
        lines.push("");
        lines.push(heading(label));
        for (const f of list) {
          lines.push(`${theme.muted(f.checkId)} ${f.title}`);
          lines.push(`  ${f.detail}`);
          if (f.remediation?.trim()) lines.push(`  ${muted(`Fix: ${f.remediation.trim()}`)}`);
        }
      };

      render("critical");
      render("warn");
      render("info");

      defaultRuntime.log(lines.join("\n"));
    });

  // openclaw security status
  security
    .command("status")
    .description("Show security shield status")
    .action(async () => {
      const cfg = loadConfig();
      const enabled = cfg.security?.shield?.enabled ?? false;
      const rateLimitingEnabled = cfg.security?.shield?.rateLimiting?.enabled ?? false;
      const intrusionDetectionEnabled = cfg.security?.shield?.intrusionDetection?.enabled ?? false;
      const firewallEnabled = cfg.security?.shield?.ipManagement?.firewall?.enabled ?? false;
      const alertingEnabled = cfg.security?.alerting?.enabled ?? false;

      const lines: string[] = [];
      lines.push(theme.heading("Security Shield Status"));
      lines.push("");
      lines.push(`Shield:               ${enabled ? theme.success("ENABLED") : theme.error("DISABLED")}`);
      lines.push(`Rate Limiting:        ${rateLimitingEnabled ? theme.success("ENABLED") : theme.muted("disabled")}`);
      lines.push(`Intrusion Detection:  ${intrusionDetectionEnabled ? theme.success("ENABLED") : theme.muted("disabled")}`);
      lines.push(`Firewall Integration: ${firewallEnabled ? theme.success("ENABLED") : theme.muted("disabled")}`);
      lines.push(`Alerting:             ${alertingEnabled ? theme.success("ENABLED") : theme.muted("disabled")}`);

      if (alertingEnabled && cfg.security?.alerting?.channels?.telegram?.enabled) {
        lines.push(`  Telegram:           ${theme.success("ENABLED")}`);
      }

      lines.push("");
      lines.push(theme.muted(`Docs: ${formatDocsLink("/security/shield", "docs.openclaw.ai/security/shield")}`));
      defaultRuntime.log(lines.join("\n"));
    });

  // openclaw security enable
  security
    .command("enable")
    .description("Enable security shield")
    .action(async () => {
      const cfg = loadConfig();
      cfg.security = cfg.security || {};
      cfg.security.shield = cfg.security.shield || {};
      cfg.security.shield.enabled = true;

      await writeConfigFile(cfg);
      defaultRuntime.log(theme.success("✓ Security shield enabled"));
      defaultRuntime.log(theme.muted(`  Restart gateway for changes to take effect: ${formatCliCommand("openclaw gateway restart")}`));
    });

  // openclaw security disable
  security
    .command("disable")
    .description("Disable security shield")
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg.security?.shield) {
        defaultRuntime.log(theme.muted("Security shield already disabled"));
        return;
      }

      cfg.security.shield.enabled = false;
      await writeConfigFile(cfg);
      defaultRuntime.log(theme.warn("⚠ Security shield disabled"));
      defaultRuntime.log(theme.muted(`  Restart gateway for changes to take effect: ${formatCliCommand("openclaw gateway restart")}`));
    });

  // openclaw security logs
  security
    .command("logs")
    .description("View security event logs")
    .option("-f, --follow", "Follow log output (tail -f)")
    .option("-n, --lines <number>", "Number of lines to show", "50")
    .option("--severity <level>", "Filter by severity (critical, warn, info)")
    .action(async (opts: { follow?: boolean; lines?: string; severity?: string }) => {
      const today = new Date().toISOString().split("T")[0];
      const logFile = path.join(DEFAULT_LOG_DIR, `security-${today}.jsonl`);

      if (!fs.existsSync(logFile)) {
        defaultRuntime.log(theme.warn(`No security logs found for today: ${logFile}`));
        defaultRuntime.log(theme.muted(`Logs are created when security events occur`));
        return;
      }

      const lines = parseInt(opts.lines || "50", 10);
      const severity = opts.severity?.toLowerCase();

      if (opts.follow) {
        // Tail follow mode
        const { spawn } = await import("node:child_process");
        const tail = spawn("tail", ["-f", "-n", String(lines), logFile], {
          stdio: "inherit",
        });

        tail.on("error", (err) => {
          defaultRuntime.log(theme.error(`Failed to tail logs: ${String(err)}`));
          process.exit(1);
        });
      } else {
        // Read last N lines
        const content = fs.readFileSync(logFile, "utf-8");
        const allLines = content.trim().split("\n").filter(Boolean);
        const lastLines = allLines.slice(-lines);

        for (const line of lastLines) {
          try {
            const event = JSON.parse(line);
            if (severity && event.severity !== severity) {
              continue;
            }

            const severityLabel =
              event.severity === "critical"
                ? theme.error("CRITICAL")
                : event.severity === "warn"
                  ? theme.warn("WARN")
                  : theme.muted("INFO");

            const timestamp = new Date(event.timestamp).toLocaleString();
            defaultRuntime.log(`[${timestamp}] ${severityLabel} ${event.action} (${event.ip})`);

            if (event.details && Object.keys(event.details).length > 0) {
              defaultRuntime.log(theme.muted(`  ${JSON.stringify(event.details)}`));
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
    });

  // openclaw blocklist
  const blocklist = program
    .command("blocklist")
    .description("Manage IP blocklist");

  blocklist
    .command("list")
    .description("List all blocked IPs")
    .option("--json", "Print JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const entries = ipManager.getBlocklist();

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(entries, null, 2));
        return;
      }

      if (entries.length === 0) {
        defaultRuntime.log(theme.muted("No blocked IPs"));
        return;
      }

      defaultRuntime.log(theme.heading(`Blocked IPs (${entries.length})`));
      defaultRuntime.log("");

      for (const entry of entries) {
        const expiresAt = new Date(entry.expiresAt);
        const now = new Date();
        const remaining = expiresAt.getTime() - now.getTime();
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        defaultRuntime.log(`${theme.bold(entry.ip)}`);
        defaultRuntime.log(`  Reason:  ${entry.reason}`);
        defaultRuntime.log(`  Source:  ${entry.source}`);
        defaultRuntime.log(`  Blocked: ${new Date(entry.blockedAt).toLocaleString()}`);
        defaultRuntime.log(`  Expires: ${expiresAt.toLocaleString()} (${hours}h ${minutes}m remaining)`);
        defaultRuntime.log("");
      }
    });

  blocklist
    .command("add <ip>")
    .description("Block an IP address")
    .option("-r, --reason <reason>", "Block reason", "manual")
    .option("-d, --duration <duration>", "Block duration (e.g., 24h, 7d, 30d)", "24h")
    .action(async (ip: string, opts: { reason?: string; duration?: string }) => {
      const reason = opts.reason || "manual";
      const durationMs = parseDuration(opts.duration || "24h");

      ipManager.blockIp({
        ip,
        reason,
        durationMs,
        source: "manual",
      });

      defaultRuntime.log(theme.success(`✓ Blocked ${ip}`));
      defaultRuntime.log(theme.muted(`  Reason: ${reason}`));
      defaultRuntime.log(theme.muted(`  Duration: ${opts.duration}`));
    });

  blocklist
    .command("remove <ip>")
    .description("Unblock an IP address")
    .action(async (ip: string) => {
      const removed = ipManager.unblockIp(ip);

      if (removed) {
        defaultRuntime.log(theme.success(`✓ Unblocked ${ip}`));
      } else {
        defaultRuntime.log(theme.muted(`IP ${ip} was not blocked`));
      }
    });

  // openclaw allowlist
  const allowlist = program
    .command("allowlist")
    .description("Manage IP allowlist");

  allowlist
    .command("list")
    .description("List all allowed IPs")
    .option("--json", "Print JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const entries = ipManager.getAllowlist();

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(entries, null, 2));
        return;
      }

      if (entries.length === 0) {
        defaultRuntime.log(theme.muted("No allowed IPs"));
        return;
      }

      defaultRuntime.log(theme.heading(`Allowed IPs (${entries.length})`));
      defaultRuntime.log("");

      for (const entry of entries) {
        defaultRuntime.log(`${theme.bold(entry.ip)}`);
        defaultRuntime.log(`  Reason: ${entry.reason}`);
        defaultRuntime.log(`  Source: ${entry.source}`);
        defaultRuntime.log(`  Added:  ${new Date(entry.addedAt).toLocaleString()}`);
        defaultRuntime.log("");
      }
    });

  allowlist
    .command("add <ip>")
    .description("Add IP to allowlist (supports CIDR notation)")
    .option("-r, --reason <reason>", "Allow reason", "manual")
    .action(async (ip: string, opts: { reason?: string }) => {
      const reason = opts.reason || "manual";

      ipManager.allowIp({
        ip,
        reason,
        source: "manual",
      });

      defaultRuntime.log(theme.success(`✓ Added ${ip} to allowlist`));
      defaultRuntime.log(theme.muted(`  Reason: ${reason}`));
    });

  allowlist
    .command("remove <ip>")
    .description("Remove IP from allowlist")
    .action(async (ip: string) => {
      ipManager.removeFromAllowlist(ip);
      defaultRuntime.log(theme.success(`✓ Removed ${ip} from allowlist`));
    });
}
