import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { runSecurityAudit } from "../security/audit.js";
import { fixSecurityFootguns } from "../security/fix.js";
import { formatGraspReport } from "../security/grasp/format.js";
import { runGraspAssessment, type GraspProgressEvent } from "../security/grasp/index.js";
import { formatDocsLink } from "../terminal/links.js";
import { isRich, theme } from "../terminal/theme.js";
import { shortenHomeInString, shortenHomePath } from "../utils.js";
import { formatCliCommand } from "./command-format.js";

type SecurityAuditOptions = {
  json?: boolean;
  deep?: boolean;
  fix?: boolean;
};

type SecurityGraspOptions = {
  agent?: string;
  model?: string;
  noCache?: boolean;
  json?: boolean;
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
    .description("Security tools (audit, grasp)")
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
          fixResult.actions.every((a) => !a.ok)
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
              if (action.ok) {
                lines.push(muted(`  chmod ${mode} ${shortenHomePath(action.path)}`));
              } else if (action.skipped) {
                lines.push(
                  muted(`  skip chmod ${mode} ${shortenHomePath(action.path)} (${action.skipped})`),
                );
              } else if (action.error) {
                lines.push(
                  muted(`  chmod ${mode} ${shortenHomePath(action.path)} failed: ${action.error}`),
                );
              }
              continue;
            }
            const command = shortenHomeInString(action.command);
            if (action.ok) {
              lines.push(muted(`  ${command}`));
            } else if (action.skipped) {
              lines.push(muted(`  skip ${command} (${action.skipped})`));
            } else if (action.error) {
              lines.push(muted(`  ${command} failed: ${action.error}`));
            }
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
        if (list.length === 0) {
          return;
        }
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
          if (f.remediation?.trim()) {
            lines.push(`  ${muted(`Fix: ${f.remediation.trim()}`)}`);
          }
        }
      };

      render("critical");
      render("warn");
      render("info");

      defaultRuntime.log(lines.join("\n"));
    });

  security
    .command("grasp")
    .description("AI-driven self-assessment of agent risk profile (GRASP)")
    .option("--agent <id>", "Analyze specific agent only (default: all)")
    .option("--model <model>", "Model to use for analysis")
    .option("--no-cache", "Force fresh analysis (ignore cache)")
    .option("--json", "Output as JSON", false)
    .action(async (opts: SecurityGraspOptions) => {
      const cfg = loadConfig();

      // Progress callback writes directly to stderr to avoid being silenced
      const writeProgress = (msg: string) => {
        process.stderr.write(`\r\x1b[K${msg}`);
      };

      const onProgress = (event: GraspProgressEvent) => {
        switch (event.type) {
          case "start":
            writeProgress(
              `Analyzing ${event.agents.length} agent(s) across ${event.totalDimensions} dimensions...\n`,
            );
            break;
          case "dimension_start":
            writeProgress(`  → ${event.label}...`);
            break;
          case "dimension_done": {
            const pct = Math.round((event.completed / event.total) * 100);
            writeProgress(`  → ${event.dimension} ✓ (${pct}%)\n`);
            break;
          }
          case "agent_done":
            writeProgress(`  Agent ${event.agentId} done\n`);
            break;
          case "done":
            writeProgress("\n");
            break;
        }
      };

      const report = await runGraspAssessment({
        config: cfg,
        agentId: opts.agent,
        model: opts.model,
        noCache: opts.noCache,
        onProgress,
      });

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(report, null, 2));
        return;
      }

      defaultRuntime.log(formatGraspReport(report));

      // Exit code based on overall risk level
      const exitCode =
        report.overallLevel === "critical"
          ? 3
          : report.overallLevel === "high"
            ? 2
            : report.overallLevel === "medium"
              ? 1
              : 0;

      if (exitCode > 0) {
        process.exitCode = exitCode;
      }
    });
}
