/**
 * Real-Time Metrics Dashboard
 * Serves HTML at /metrics with token spend, model distribution, anomaly detection.
 */

import * as fs from "node:fs";
import * as http from "node:http";

export type CostEntry = {
  date: string;
  totalCost?: number;
  totalTokens?: number;
  breakdown?: Record<string, { sessions?: number; tokens?: number; cost?: number }>;
  timestamp?: string;
  note?: string;
};

export function parseCostLog(filePath: string): CostEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const entries: CostEntry[] = [];
  for (const line of fs.readFileSync(filePath, "utf-8").trim().split("\n")) {
    try {
      const e = JSON.parse(line);
      if (e.totalCost !== undefined) {
        entries.push(e);
      }
    } catch {
      /* skip */
    }
  }
  return entries;
}

export function computeMetrics(entries: CostEntry[]) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const daily = entries.filter((e) => e.date === today);
  const weekly = entries.filter((e) => e.date >= weekAgo);
  const monthly = entries.filter((e) => e.date >= monthAgo);
  const sum = (a: CostEntry[]) => a.reduce((s, e) => s + (e.totalCost ?? 0), 0);
  const tokenSum = (a: CostEntry[]) => a.reduce((s, e) => s + (e.totalTokens ?? 0), 0);
  const modelCosts: Record<string, number> = {};
  const modelTokens: Record<string, number> = {};
  for (const entry of monthly) {
    if (entry.breakdown) {
      for (const [m, d] of Object.entries(entry.breakdown)) {
        modelCosts[m] = (modelCosts[m] ?? 0) + (d.cost ?? 0);
        modelTokens[m] = (modelTokens[m] ?? 0) + (d.tokens ?? 0);
      }
    }
  }
  const dailyCosts: Record<string, number> = {};
  for (const e of monthly) {
    dailyCosts[e.date] = (dailyCosts[e.date] ?? 0) + (e.totalCost ?? 0);
  }
  const vals = Object.values(dailyCosts);
  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const std =
    vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length) : 0;
  const anomalies = Object.entries(dailyCosts)
    .filter(([, c]) => c > avg + 2 * std)
    .map(([d, c]) => ({ date: d, cost: c, deviation: std > 0 ? (c - avg) / std : 0 }));
  return {
    daily: { cost: sum(daily), tokens: tokenSum(daily) },
    weekly: { cost: sum(weekly), tokens: tokenSum(weekly) },
    monthly: { cost: sum(monthly), tokens: tokenSum(monthly) },
    modelDistribution: modelCosts,
    modelTokens,
    dailyTrend: dailyCosts,
    anomalies,
    avgDailyCost: avg,
    totalEntries: entries.length,
  };
}

export function generateDashboardHTML(costLogPath: string): string {
  const entries = parseCostLog(costLogPath);
  const m = computeMetrics(entries);
  const modelRows = Object.entries(m.modelDistribution)
    .toSorted(([, a], [, b]) => b - a)
    .map(
      ([model, cost]) =>
        `<tr><td>${model}</td><td>$${cost.toFixed(2)}</td><td>${((m.modelTokens[model] ?? 0) / 1000).toFixed(0)}k</td></tr>`,
    )
    .join("");
  const trendData = Object.entries(m.dailyTrend)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([d, c]) => `{x:"${d}",y:${c.toFixed(4)}}`)
    .join(",");
  const anomalyList = m.anomalies
    .map((a) => `<li>${a.date}: $${a.cost.toFixed(2)} (${a.deviation.toFixed(1)}σ)</li>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="300"><title>OpenClaw Metrics</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px}.card h3{color:#58a6ff;font-size:14px;text-transform:uppercase;margin-bottom:8px}.value{font-size:32px;font-weight:700;color:#f0f6fc}.sub{font-size:13px;color:#8b949e;margin-top:4px}h1{font-size:24px;margin-bottom:20px;color:#f0f6fc}h2{font-size:18px;margin:20px 0 12px;color:#f0f6fc}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #21262d}th{color:#8b949e;font-size:12px;text-transform:uppercase}.anomaly{background:#3d1f00;border:1px solid #d29922;border-radius:8px;padding:12px;margin-top:12px}.anomaly h3{color:#d29922}.chart{height:200px;display:flex;align-items:flex-end;gap:2px;padding:12px 0}.bar{background:#238636;border-radius:2px 2px 0 0;min-width:8px;flex:1}.footer{margin-top:24px;font-size:12px;color:#484f58;text-align:center}
@media(max-width:767px){.grid{grid-template-columns:1fr}.value{font-size:24px}}</style></head><body>
<h1>📊 OpenClaw Metrics</h1>
<div class="grid"><div class="card"><h3>Today</h3><div class="value">$${m.daily.cost.toFixed(2)}</div><div class="sub">${(m.daily.tokens / 1000).toFixed(0)}k tokens</div></div>
<div class="card"><h3>This Week</h3><div class="value">$${m.weekly.cost.toFixed(2)}</div><div class="sub">${(m.weekly.tokens / 1000).toFixed(0)}k tokens</div></div>
<div class="card"><h3>This Month</h3><div class="value">$${m.monthly.cost.toFixed(2)}</div><div class="sub">${(m.monthly.tokens / 1000).toFixed(0)}k tokens</div></div>
<div class="card"><h3>Avg Daily</h3><div class="value">$${m.avgDailyCost.toFixed(2)}</div><div class="sub">${m.totalEntries} entries</div></div></div>
<h2>Model Distribution</h2><div class="card"><table><thead><tr><th>Model</th><th>Cost</th><th>Tokens</th></tr></thead><tbody>${modelRows || '<tr><td colspan="3">No data</td></tr>'}</tbody></table></div>
<h2>Daily Trend</h2><div class="card"><div class="chart" id="chart"></div></div>
${anomalyList ? `<div class="anomaly"><h3>⚠️ Anomalies</h3><ul>${anomalyList}</ul></div>` : ""}
<div class="footer">Auto-refreshes every 5 min</div>
<script>const d=[${trendData}],c=document.getElementById("chart");if(d.length){const mx=Math.max(...d.map(x=>x.y));d.forEach(x=>{const b=document.createElement("div");b.className="bar";b.style.height=mx>0?(x.y/mx*180)+"px":"2px";b.title=x.x+": $"+x.y.toFixed(2);c.appendChild(b)})}else c.innerHTML="No data";</script></body></html>`;
}

export function startMetricsServer(
  costLogPath: string,
  port = 19000,
  host = "127.0.0.1",
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/metrics" || req.url === "/" || req.url === "/metrics/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generateDashboardHTML(costLogPath));
    } else if (req.url === "/metrics/api") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(computeMetrics(parseCostLog(costLogPath)), null, 2));
    } else {
      res.writeHead(302, { Location: "/metrics" });
      res.end();
    }
  });
  server.listen(port, host);
  return server;
}
