#!/usr/bin/env node
/**
 * Portfolio Risk Visualization
 * Computes: beta, concentration risk, drawdown scenarios
 * Outputs: JSON data + HTML dashboard + briefing summary
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const FINNHUB_KEY = process.env.FINNHUB_KEY || "d59m7jhr01qgqlm152p0d59m7jhr01qgqlm152pg";
const DATA_DIR = process.env.DATA_DIR || join(process.env.HOME, ".openclaw/data");
const PORTFOLIO_PATH = join(DATA_DIR, "portfolio.json");

// Default sample portfolio if none exists
const DEFAULT_PORTFOLIO = {
  holdings: [
    { ticker: "NBIS", shares: 500, entryPrice: 12.5 },
    { ticker: "AAPL", shares: 50, entryPrice: 220.0 },
    { ticker: "MSFT", shares: 30, entryPrice: 400.0 },
    { ticker: "NVDA", shares: 20, entryPrice: 130.0 },
    { ticker: "TSLA", shares: 15, entryPrice: 350.0 },
  ],
  updatedAt: new Date().toISOString(),
  riskTolerance: "moderate",
};

// Approximate betas (static; could be computed from historical data)
const APPROX_BETAS = {
  AAPL: 1.2,
  MSFT: 1.1,
  NVDA: 1.8,
  TSLA: 2.0,
  NBIS: 1.5,
  AMZN: 1.3,
  GOOGL: 1.1,
  META: 1.4,
  AMD: 1.7,
  SPY: 1.0,
};

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function getQuotes(tickers) {
  const quotes = {};
  for (const t of tickers) {
    try {
      const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${FINNHUB_KEY}`);
      quotes[t] = { current: q.c, prevClose: q.pc, change: q.dp, high: q.h, low: q.l };
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Quote error ${t}: ${e.message}`);
    }
  }
  return quotes;
}

function computeRisk(portfolio, quotes) {
  const holdings = portfolio.holdings.map((h) => {
    const price = quotes[h.ticker]?.current || h.entryPrice;
    const value = h.shares * price;
    const cost = h.shares * h.entryPrice;
    const pnl = value - cost;
    const pnlPct = ((price - h.entryPrice) / h.entryPrice) * 100;
    return {
      ...h,
      currentPrice: price,
      value,
      cost,
      pnl,
      pnlPct,
      beta: APPROX_BETAS[h.ticker] || 1.0,
    };
  });

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost, 0);

  // Concentration risk
  const allocations = holdings.map((h) => ({
    ticker: h.ticker,
    pct: ((h.value / totalValue) * 100).toFixed(1),
    value: h.value.toFixed(2),
  }));

  // Portfolio beta (weighted)
  const portfolioBeta = holdings.reduce((s, h) => s + (h.value / totalValue) * h.beta, 0);

  // Stress tests
  const stressScenarios = [
    { name: "S&P -5%", impact: -5 * portfolioBeta },
    { name: "S&P -10%", impact: -10 * portfolioBeta },
    { name: "S&P -20%", impact: -20 * portfolioBeta },
    { name: "S&P +10%", impact: 10 * portfolioBeta },
  ].map((s) => ({
    ...s,
    impact: s.impact.toFixed(1),
    dollarImpact: ((totalValue * s.impact) / 100).toFixed(0),
  }));

  // Max single-stock concentration
  const maxConcentration = Math.max(...allocations.map((a) => parseFloat(a.pct)));
  const concentrationRisk =
    maxConcentration > 40 ? "HIGH" : maxConcentration > 25 ? "MODERATE" : "LOW";

  return {
    timestamp: new Date().toISOString(),
    totalValue: totalValue.toFixed(2),
    totalCost: totalCost.toFixed(2),
    totalPnL: (totalValue - totalCost).toFixed(2),
    totalPnLPct: (((totalValue - totalCost) / totalCost) * 100).toFixed(1),
    portfolioBeta: portfolioBeta.toFixed(2),
    concentrationRisk,
    maxConcentration: maxConcentration.toFixed(1),
    allocations,
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      entry: h.entryPrice,
      current: h.currentPrice,
      pnl: h.pnl.toFixed(2),
      pnlPct: h.pnlPct.toFixed(1),
    })),
    stressScenarios,
  };
}

function generateHTML(risk) {
  return `<!DOCTYPE html>
<html><head><title>Portfolio Risk Dashboard</title>
<style>
body{font-family:system-ui;margin:20px;background:#1a1a2e;color:#e0e0e0}
h1{color:#00d4ff}h2{color:#7b68ee;border-bottom:1px solid #333;padding-bottom:5px}
table{border-collapse:collapse;width:100%;margin:10px 0}
th,td{padding:8px 12px;text-align:right;border:1px solid #333}
th{background:#16213e}
.green{color:#00ff88}.red{color:#ff4444}
.card{background:#16213e;border-radius:8px;padding:15px;margin:10px 0;display:inline-block;min-width:200px;margin-right:10px}
.metric{font-size:24px;font-weight:bold}
.label{font-size:12px;color:#888;text-transform:uppercase}
.pie-container{display:flex;justify-content:center;margin:20px}
</style></head><body>
<h1>📊 Portfolio Risk Dashboard</h1>
<p>Updated: ${risk.timestamp}</p>

<div>
<div class="card"><div class="label">Total Value</div><div class="metric">$${Number(risk.totalValue).toLocaleString()}</div></div>
<div class="card"><div class="label">Total P&L</div><div class="metric ${Number(risk.totalPnL) >= 0 ? "green" : "red"}">$${Number(risk.totalPnL).toLocaleString()} (${risk.totalPnLPct}%)</div></div>
<div class="card"><div class="label">Portfolio Beta</div><div class="metric">${risk.portfolioBeta}</div></div>
<div class="card"><div class="label">Concentration Risk</div><div class="metric">${risk.concentrationRisk}</div></div>
</div>

<h2>Holdings</h2>
<table>
<tr><th>Ticker</th><th>Shares</th><th>Entry</th><th>Current</th><th>P&L</th><th>P&L%</th><th>Allocation</th></tr>
${risk.holdings
  .map(
    (h, i) => `<tr>
<td style="text-align:left;font-weight:bold">${h.ticker}</td>
<td>${h.shares}</td><td>$${h.entry}</td><td>$${h.current}</td>
<td class="${Number(h.pnl) >= 0 ? "green" : "red"}">$${Number(h.pnl).toLocaleString()}</td>
<td class="${Number(h.pnlPct) >= 0 ? "green" : "red"}">${h.pnlPct}%</td>
<td>${risk.allocations[i]?.pct}%</td></tr>`,
  )
  .join("\n")}
</table>

<h2>Stress Test Scenarios</h2>
<table>
<tr><th>Scenario</th><th>Portfolio Impact</th><th>Dollar Impact</th></tr>
${risk.stressScenarios
  .map(
    (s) => `<tr><td style="text-align:left">${s.name}</td>
<td class="${Number(s.impact) >= 0 ? "green" : "red"}">${s.impact}%</td>
<td class="${Number(s.dollarImpact) >= 0 ? "green" : "red"}">$${Number(s.dollarImpact).toLocaleString()}</td></tr>`,
  )
  .join("\n")}
</table>

<h2>Allocation Breakdown</h2>
<div>${risk.allocations.map((a) => `<div style="display:inline-block;margin:5px;padding:10px;background:#16213e;border-radius:5px;min-width:100px;text-align:center"><strong>${a.ticker}</strong><br>${a.pct}%<br><small>$${Number(a.value).toLocaleString()}</small></div>`).join("")}</div>
</body></html>`;
}

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  let portfolio;
  if (existsSync(PORTFOLIO_PATH)) {
    portfolio = JSON.parse(readFileSync(PORTFOLIO_PATH, "utf8"));
  } else {
    portfolio = DEFAULT_PORTFOLIO;
    writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
    console.error("Created default portfolio at", PORTFOLIO_PATH);
  }

  const tickers = portfolio.holdings.map((h) => h.ticker);
  const quotes = await getQuotes(tickers);
  const risk = computeRisk(portfolio, quotes);

  // Save results
  writeFileSync(join(DATA_DIR, "portfolio-risk.json"), JSON.stringify(risk, null, 2));
  writeFileSync(join(DATA_DIR, "portfolio-dashboard.html"), generateHTML(risk));

  console.log(JSON.stringify(risk, null, 2));

  // Briefing format
  if (process.env.FORMAT === "briefing") {
    let msg = "💼 **Portfolio Risk Summary**\n";
    msg += `Total: $${Number(risk.totalValue).toLocaleString()} | P&L: $${Number(risk.totalPnL).toLocaleString()} (${risk.totalPnLPct}%)\n`;
    msg += `Beta: ${risk.portfolioBeta} | Concentration: ${risk.concentrationRisk}\n`;
    msg += "\n**Holdings:**\n";
    for (const h of risk.holdings) {
      const emoji = Number(h.pnlPct) >= 0 ? "🟢" : "🔴";
      msg += `${emoji} ${h.ticker}: $${h.current} (${h.pnlPct}%)\n`;
    }
    msg += `\n**If S&P drops 10%:** Portfolio ~${risk.stressScenarios[1].impact}% ($${Number(risk.stressScenarios[1].dollarImpact).toLocaleString()})\n`;
    process.stdout.write("\n---BRIEFING---\n" + msg);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
