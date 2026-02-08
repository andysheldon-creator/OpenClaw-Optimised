import { getControlPlaneService } from "../src/clawdbot/control-plane/index.ts";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function formatRow(label: string, value: string): string {
  return `${label.padEnd(28)} ${value}`;
}

async function main(): Promise<void> {
  const json = hasFlag("--json");
  const strict = hasFlag("--strict");

  const service = getControlPlaneService();
  const report = await service.getReadinessReport();

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Control Plane Readiness Report");
    console.log("-");
    console.log(formatRow("Checked at", report.checkedAt));
    console.log(formatRow("Skills (total)", String(report.skillSummary.total)));
    console.log(formatRow("Skills (live-ready)", String(report.skillSummary.liveReady)));
    console.log(formatRow("Skills (blocked)", String(report.skillSummary.blocked)));
    console.log(formatRow("Skills (partial)", String(report.skillSummary.partial)));
    console.log(formatRow("Skills (stub)", String(report.skillSummary.stub)));
    console.log(formatRow("Browser adapter", report.adapters.browser.ok ? "ok" : "failed"));
    console.log(formatRow("CLI adapter", report.adapters.cli.ok ? "ok" : "failed"));
    console.log(formatRow("Unresolved drift", String(report.syncHealth.unresolvedDriftCount)));
    console.log(formatRow("Sync stale", report.syncHealth.stale ? "yes" : "no"));
    if (report.drift.length > 0) {
      console.log("-");
      console.log("Drift items:");
      for (const item of report.drift.slice(0, 20)) {
        console.log(`- [${item.severity}] ${item.summary}`);
      }
      if (report.drift.length > 20) {
        console.log(`- ... ${report.drift.length - 20} more`);
      }
    }
  }

  if (strict) {
    const failed =
      report.skillSummary.blocked > 0 ||
      !report.adapters.browser.ok ||
      !report.adapters.cli.ok ||
      report.syncHealth.unresolvedDriftCount > 0;
    if (failed) {
      process.exitCode = 1;
    }
  }
}

await main();
