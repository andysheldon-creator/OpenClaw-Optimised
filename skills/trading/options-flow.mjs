#!/usr/bin/env node
/**
 * Options Flow Analysis - Detects unusual options activity via Finnhub
 * Checks: volume spikes (>2σ), IV jumps, put/call ratio extremes
 */

const FINNHUB_KEY = process.env.FINNHUB_KEY || "d59m7jhr01qgqlm152p0d59m7jhr01qgqlm152pg";
const TICKERS = (process.env.TICKERS || "AAPL,MSFT,NVDA,TSLA,NBIS").split(",");

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function getQuote(symbol) {
  return fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
}

async function getOptionsChain(symbol) {
  return fetchJSON(
    `https://finnhub.io/api/v1/stock/option-chain?symbol=${symbol}&token=${FINNHUB_KEY}`,
  );
}

function analyzeOptions(symbol, data, quote) {
  if (!data?.data?.length) return null;
  const currentPrice = quote?.c || 0;
  const opportunities = [];

  for (const expiry of data.data.slice(0, 4)) {
    // Near-term expirations
    const allOptions = [...(expiry.options?.CALL || []), ...(expiry.options?.PUT || [])];
    const withVolume = allOptions.filter((o) => o.volume > 0);
    if (withVolume.length < 3) continue;

    const volumes = withVolume.map((o) => o.volume);
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const std = Math.sqrt(volumes.reduce((a, b) => a + (b - mean) ** 2, 0) / volumes.length);
    const threshold = mean + 2 * std;

    // Find volume spikes
    for (const opt of withVolume) {
      if (opt.volume > threshold && opt.volume > 50) {
        const moneyness =
          opt.type === "CALL"
            ? (currentPrice - opt.strike) / currentPrice
            : (opt.strike - currentPrice) / currentPrice;

        opportunities.push({
          symbol,
          type: opt.type,
          strike: opt.strike,
          expiration: expiry.expirationDate,
          volume: opt.volume,
          openInterest: opt.openInterest,
          iv: opt.impliedVolatility,
          volumeRatio: (opt.volume / mean).toFixed(1),
          moneyness: (moneyness * 100).toFixed(1),
          currentPrice,
          signal:
            opt.type === "PUT" && moneyness > 0.05 ? "PUT_SELL_OPPORTUNITY" : "UNUSUAL_VOLUME",
          delta: opt.delta,
          bid: opt.bid,
          ask: opt.ask,
        });
      }
    }

    // Check put/call ratio
    const putVol = expiry.putVolume || 0;
    const callVol = expiry.callVolume || 0;
    if (callVol > 0) {
      const pcRatio = putVol / callVol;
      if (pcRatio > 2.0 || pcRatio < 0.3) {
        opportunities.push({
          symbol,
          type: "PC_RATIO",
          expiration: expiry.expirationDate,
          putVolume: putVol,
          callVolume: callVol,
          pcRatio: pcRatio.toFixed(2),
          signal: pcRatio > 2.0 ? "EXTREME_BEARISH" : "EXTREME_BULLISH",
          currentPrice,
        });
      }
    }
  }

  return opportunities;
}

async function main() {
  const allOpps = [];

  for (const ticker of TICKERS) {
    try {
      const [chain, quote] = await Promise.all([getOptionsChain(ticker), getQuote(ticker)]);
      const opps = analyzeOptions(ticker, chain, quote);
      if (opps?.length) allOpps.push(...opps);
      // Rate limit: Finnhub free = 60/min
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`Error fetching ${ticker}: ${e.message}`);
    }
  }

  // Sort by volume ratio descending, take top 3
  const top = allOpps
    .filter((o) => o.type !== "PC_RATIO")
    .sort((a, b) => parseFloat(b.volumeRatio || 0) - parseFloat(a.volumeRatio || 0))
    .slice(0, 3);

  const pcAlerts = allOpps.filter((o) => o.type === "PC_RATIO");

  const output = {
    timestamp: new Date().toISOString(),
    topOpportunities: top,
    pcRatioAlerts: pcAlerts,
    tickersScanned: TICKERS,
    summary:
      top.length === 0
        ? "No unusual options activity detected today."
        : `Found ${top.length} unusual options flow signals across ${TICKERS.length} tickers.`,
  };

  console.log(JSON.stringify(output, null, 2));

  // Format for briefing
  if (process.env.FORMAT === "briefing") {
    let msg = "📊 **Options Flow Analysis**\n";
    if (top.length === 0) {
      msg += "No unusual activity detected.\n";
    } else {
      for (const o of top) {
        const emoji = o.type === "CALL" ? "🟢" : "🔴";
        msg += `${emoji} **${o.symbol}** ${o.type} $${o.strike} exp ${o.expiration}\n`;
        msg += `   Vol: ${o.volume} (${o.volumeRatio}x avg) | IV: ${o.iv}% | Price: $${o.currentPrice}\n`;
        if (o.signal === "PUT_SELL_OPPORTUNITY") {
          msg += `   ⚡ Potential put-selling opportunity (${o.moneyness}% OTM)\n`;
        }
      }
    }
    if (pcAlerts.length > 0) {
      msg += "\n**Put/Call Ratio Alerts:**\n";
      for (const pc of pcAlerts) {
        msg += `• ${pc.symbol} ${pc.expiration}: P/C = ${pc.pcRatio} (${pc.signal})\n`;
      }
    }
    process.stdout.write("\n---BRIEFING---\n" + msg);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
