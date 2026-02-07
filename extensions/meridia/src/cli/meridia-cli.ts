import type { Command } from "commander";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { probeModelRefAuth } from "openclaw/plugin-sdk";
import { createSqliteBackend } from "../meridia/db/backends/sqlite.js";
import { createBackend } from "../meridia/db/index.js";
import { wipeDir } from "../meridia/fs.js";
import { resolveMeridiaDir } from "../meridia/paths.js";

type MeridiaStatusOptions = { json?: boolean; since?: string };
type MeridiaDoctorOptions = { json?: boolean };
type MeridiaResetOptions = { json?: boolean; dir?: string; force?: boolean };
type MeridiaExportFormatOptions = { json?: boolean; jsonl?: boolean; out?: string };
type MeridiaExportRecordsOptions = MeridiaExportFormatOptions & { since?: string; limit?: number };
type MeridiaExportTraceOptions = MeridiaExportFormatOptions & {
  since?: string;
  limit?: number;
  kind?: string;
};

function parseDurationMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = (match[2] ?? "h").toLowerCase();
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return value * mult;
}

function readHookEntry(cfg: OpenClawConfig, hookKey: string): Record<string, unknown> | undefined {
  const entry = cfg.hooks?.internal?.entries?.[hookKey] as Record<string, unknown> | undefined;
  return entry && typeof entry === "object" ? entry : undefined;
}

function readConfiguredModelRef(cfg: OpenClawConfig): string | null {
  const entry = readHookEntry(cfg, "experiential-capture");
  const raw =
    (entry?.evaluation_model as unknown) ??
    (entry?.evaluationModel as unknown) ??
    (entry?.model as unknown);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

function resolveFormat(opts: MeridiaExportFormatOptions): {
  mode: "json" | "jsonl";
  outPath?: string;
} {
  const json = opts.json === true;
  const jsonl = opts.jsonl === true;
  if (json && jsonl) {
    throw new Error("Choose at most one: --json or --jsonl");
  }
  const mode: "json" | "jsonl" = jsonl ? "jsonl" : "json";
  const outPath = opts.out?.trim() ? path.resolve(opts.out.trim()) : undefined;
  return { mode, ...(outPath ? { outPath } : {}) };
}

function writeOutput(params: { outPath?: string; content: string }): void {
  if (params.outPath) {
    fs.mkdirSync(path.dirname(params.outPath), { recursive: true });
    fs.writeFileSync(params.outPath, params.content, "utf-8");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(params.content);
}

export function registerMeridiaCli(program: Command, config: OpenClawConfig): void {
  const meridia = program.command("meridia").description("Meridia experiential continuity tools");

  meridia
    .command("status")
    .description("Show capture stats")
    .option("--since <duration>", "Lookback window (e.g. 30m, 6h, 7d)", "24h")
    .option("--json", "Machine-readable output", false)
    .action(async (opts: MeridiaStatusOptions) => {
      const sinceMs = parseDurationMs(opts.since ?? "24h");
      if (!sinceMs) {
        console.error("--since must be a duration like 30m, 6h, 7d");
        process.exitCode = 1;
        return;
      }

      const nowMs = Date.now();
      const startMs = nowMs - sinceMs;
      const fromIso = new Date(startMs).toISOString();
      const toIso = new Date(nowMs).toISOString();

      try {
        const backend = createBackend({ cfg: config });
        const stats = await backend.getStats();
        const events = await backend.getTraceEventsByDateRange(fromIso, toIso);

        const toolEvals = events.filter((e) => e.kind === "tool_result_eval");
        const captured = toolEvals.filter((e) => e.decision?.decision === "capture");
        const skipped = toolEvals.filter((e) => e.decision?.decision === "skip");
        const errors = toolEvals.filter((e) => e.decision?.decision === "error");
        const precompacts = events.filter((e) => e.kind === "precompact_snapshot").length;
        const compactionEnds = events.filter((e) => e.kind === "compaction_end").length;
        const sessionEnds = events.filter((e) => e.kind === "session_end_snapshot").length;
        const bootstraps = events.filter((e) => e.kind === "bootstrap_inject").length;

        const byTool = new Map<string, { seen: number; captured: number; errors: number }>();
        for (const evt of toolEvals) {
          const key = evt.tool?.name ?? "unknown";
          const entry = byTool.get(key) ?? { seen: 0, captured: 0, errors: 0 };
          entry.seen += 1;
          if (evt.decision?.decision === "capture") {
            entry.captured += 1;
          }
          if (evt.decision?.decision === "error") {
            entry.errors += 1;
          }
          byTool.set(key, entry);
        }

        const lastCapture = captured
          .map((e) => ({ ts: e.ts, tsMs: Date.parse(e.ts) }))
          .filter((e) => Number.isFinite(e.tsMs))
          .sort((a, b) => b.tsMs - a.tsMs)[0]?.ts;

        const summary = {
          since: fromIso,
          now: toIso,
          meridiaDir: resolveMeridiaDir(config),
          db: {
            schemaVersion: stats.schemaVersion,
            recordCount: stats.recordCount,
            traceCount: stats.traceCount,
            sessionCount: stats.sessionCount,
            oldestRecord: stats.oldestRecord,
            newestRecord: stats.newestRecord,
          },
          toolResults: toolEvals.length,
          captured: captured.length,
          skipped: skipped.length,
          errors: errors.length,
          captureRate: toolEvals.length > 0 ? captured.length / toolEvals.length : 0,
          precompacts,
          compactionEnds,
          sessionEnds,
          bootstraps,
          lastCaptureAt: lastCapture ?? null,
          topTools: Array.from(byTool.entries())
            .map(([tool, s]) => ({ tool, ...s }))
            .sort((a, b) => b.captured - a.captured || b.seen - a.seen)
            .slice(0, 8),
        };

        if (opts.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }

        console.log("Meridia Status");
        console.log(`Dir: ${summary.meridiaDir}`);
        console.log(
          `Since: ${summary.since} · tool=${summary.toolResults} captured=${summary.captured} skipped=${summary.skipped} err=${summary.errors}`,
        );
        console.log(
          `Compaction: pre=${precompacts} end=${compactionEnds} · Sessions: end=${sessionEnds} · Bootstrap: ${bootstraps}`,
        );
        if (summary.lastCaptureAt) {
          console.log(`Last capture: ${summary.lastCaptureAt}`);
        }
        if (summary.topTools.length > 0) {
          console.log("Top tools:");
          for (const t of summary.topTools) {
            console.log(
              `- ${t.tool}: captured=${t.captured} seen=${t.seen}${t.errors ? ` err=${t.errors}` : ""}`,
            );
          }
        }
      } catch (err) {
        console.error(`Meridia status failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  meridia
    .command("doctor")
    .description("Check hook + auth configuration")
    .option("--json", "Machine-readable output", false)
    .action(async (opts: MeridiaDoctorOptions) => {
      const meridiaDir = resolveMeridiaDir(config);
      const internalEnabled = config.hooks?.internal?.enabled === true;
      const experiential = readHookEntry(config, "experiential-capture");
      const compaction = readHookEntry(config, "compaction");
      const sessionEnd = readHookEntry(config, "session-end");
      const recon = readHookEntry(config, "meridia-reconstitution");

      const modelRef = readConfiguredModelRef(config);
      const probe = modelRef ? await probeModelRefAuth({ cfg: config, modelRef }) : null;

      const report = {
        meridiaDir,
        hooks: {
          internalEnabled,
          experientialCapture: {
            enabled: experiential?.enabled === true,
            evaluationModel: modelRef,
          },
          compaction: { enabled: compaction?.enabled === true },
          sessionEnd: { enabled: sessionEnd?.enabled === true },
          reconstitution: { enabled: recon?.enabled !== false },
        },
        evaluationModel: modelRef
          ? {
              modelRef,
              ok: probe?.ok ?? false,
              provider: probe?.provider ?? "",
              hasKey: probe?.hasKey ?? false,
              source: probe?.source ?? null,
              error: probe?.error ?? null,
            }
          : null,
        fix: {
          enableInternalHooks: "openclaw config set hooks.internal.enabled true --json",
          enableExperientialCapture:
            'openclaw config set hooks.internal.entries[\"experiential-capture\"].enabled true --json',
          enableCompaction:
            "openclaw config set hooks.internal.entries.compaction.enabled true --json",
          enableSessionEnd:
            'openclaw config set hooks.internal.entries[\"session-end\"].enabled true --json',
          enableReconstitution:
            'openclaw config set hooks.internal.entries[\"meridia-reconstitution\"].enabled true --json',
        },
      };

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log("Meridia Doctor");
      console.log(`Dir: ${meridiaDir}`);
      console.log(`Hooks internal: ${internalEnabled ? "enabled" : "disabled"}`);
      console.log(
        `experiential-capture: ${experiential?.enabled === true ? "enabled" : "disabled"}${modelRef ? ` model=${modelRef}` : ""}`,
      );
      console.log(`compaction: ${compaction?.enabled === true ? "enabled" : "disabled"}`);
      console.log(`session-end: ${sessionEnd?.enabled === true ? "enabled" : "disabled"}`);
      console.log(`meridia-reconstitution: ${recon?.enabled === false ? "disabled" : "enabled"}`);
      if (modelRef) {
        const ok = probe?.hasKey ? "ok" : "missing";
        console.log(
          `evaluation_model auth: ${ok}${probe?.source ? ` (${probe.source})` : ""}${probe?.error ? ` (${probe.error})` : ""}`,
        );
      }

      const fixes: string[] = [];
      if (!internalEnabled) fixes.push(`- ${report.fix.enableInternalHooks}`);
      if (experiential?.enabled !== true) fixes.push(`- ${report.fix.enableExperientialCapture}`);
      if (compaction?.enabled !== true) fixes.push(`- ${report.fix.enableCompaction}`);
      if (sessionEnd?.enabled !== true) fixes.push(`- ${report.fix.enableSessionEnd}`);
      if (recon?.enabled === false) fixes.push(`- ${report.fix.enableReconstitution}`);

      if (fixes.length > 0) {
        console.log("\nFix commands:");
        console.log(fixes.join("\n"));
        console.log("\nRestart the gateway after config changes.");
      }
    });

  meridia
    .command("reset")
    .description("Wipe Meridia directory and recreate the database schema")
    .option("--dir <path>", "Meridia dir to reset (defaults to resolved Meridia dir)")
    .option("--force", "Required: confirm destructive wipe", false)
    .option("--json", "Machine-readable output", false)
    .action(async (opts: MeridiaResetOptions) => {
      const targetDir = opts.dir?.trim()
        ? path.resolve(opts.dir.trim())
        : resolveMeridiaDir(config);

      try {
        if (opts.force !== true) {
          throw new Error("Reset is destructive. Re-run with --force.");
        }

        const existed = fs.existsSync(targetDir);
        wipeDir(targetDir);
        const backend = createSqliteBackend({
          dbPath: path.join(targetDir, "meridia.sqlite"),
        });
        const stats = await backend.getStats();
        backend.close();

        const out = {
          ok: true,
          meridiaDir: targetDir,
          existed,
          schemaVersion: stats.schemaVersion,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }
        console.log(`Reset Meridia dir: ${targetDir}`);
        console.log(`Schema: ${stats.schemaVersion ?? "unknown"}`);
      } catch (err) {
        console.error(`Meridia reset failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  const exportCmd = meridia.command("export").description("Export Meridia data from SQLite");

  exportCmd
    .command("records")
    .description("Export experiential records")
    .option("--since <duration>", "Lookback window (e.g. 30m, 6h, 7d)", "24h")
    .option("--limit <n>", "Max records to export (default 200)", "200")
    .option("--json", "Output JSON array", false)
    .option("--jsonl", "Output JSONL (one record per line)", false)
    .option("--out <path>", "Write to a file instead of stdout")
    .action(async (opts: MeridiaExportRecordsOptions) => {
      try {
        const { mode, outPath } = resolveFormat(opts);
        const sinceMs = parseDurationMs(opts.since ?? "24h");
        if (!sinceMs) {
          throw new Error("--since must be a duration like 30m, 6h, 7d");
        }
        const limitRaw =
          typeof opts.limit === "number"
            ? opts.limit
            : Number.parseInt(String(opts.limit ?? "200"), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 5000) : 200;

        const nowMs = Date.now();
        const startMs = nowMs - sinceMs;
        const fromIso = new Date(startMs).toISOString();
        const toIso = new Date(nowMs).toISOString();

        const backend = createBackend({ cfg: config });
        const records = (await backend.getRecordsByDateRange(fromIso, toIso, { limit })).map(
          (r) => r.record,
        );

        if (mode === "jsonl") {
          writeOutput({
            outPath,
            content: `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
          });
          return;
        }

        writeOutput({
          outPath,
          content: `${JSON.stringify({ from: fromIso, to: toIso, records }, null, 2)}\n`,
        });
      } catch (err) {
        console.error(
          `Meridia export records failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  exportCmd
    .command("trace")
    .description("Export trace events")
    .option("--since <duration>", "Lookback window (e.g. 30m, 6h, 7d)", "24h")
    .option("--kind <kind>", "Filter by trace kind (optional)")
    .option("--limit <n>", "Max trace events to export (default 5000)", "5000")
    .option("--json", "Output JSON array", false)
    .option("--jsonl", "Output JSONL (one event per line)", false)
    .option("--out <path>", "Write to a file instead of stdout")
    .action(async (opts: MeridiaExportTraceOptions) => {
      try {
        const { mode, outPath } = resolveFormat(opts);
        const sinceMs = parseDurationMs(opts.since ?? "24h");
        if (!sinceMs) {
          throw new Error("--since must be a duration like 30m, 6h, 7d");
        }
        const limitRaw =
          typeof opts.limit === "number"
            ? opts.limit
            : Number.parseInt(String(opts.limit ?? "5000"), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50_000) : 5000;

        const nowMs = Date.now();
        const startMs = nowMs - sinceMs;
        const fromIso = new Date(startMs).toISOString();
        const toIso = new Date(nowMs).toISOString();

        const backend = createBackend({ cfg: config });
        const events = await backend.getTraceEventsByDateRange(fromIso, toIso, {
          kind: opts.kind,
          limit,
        });

        if (mode === "jsonl") {
          writeOutput({ outPath, content: `${events.map((e) => JSON.stringify(e)).join("\n")}\n` });
          return;
        }

        writeOutput({
          outPath,
          content: `${JSON.stringify({ from: fromIso, to: toIso, events }, null, 2)}\n`,
        });
      } catch (err) {
        console.error(
          `Meridia export trace failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
