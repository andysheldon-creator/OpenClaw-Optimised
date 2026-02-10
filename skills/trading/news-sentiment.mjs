#!/usr/bin/env node
/**
 * News Sentiment Correlation Analysis
 * Fetches news via Finnhub, scores sentiment, correlates with price action
 */

const FINNHUB_KEY = process.env.FINNHUB_KEY || "d59m7jhr01qgqlm152p0d59m7jhr01qgqlm152pg";

// Keyword-based sentiment scoring
const BULLISH = [
  "surge",
  "rally",
  "beat",
  "exceed",
  "upgrade",
  "buy",
  "outperform",
  "strong",
  "growth",
  "record",
  "breakout",
  "bullish",
  "soar",
  "jump",
  "boom",
  "profit",
  "gain",
  "positive",
  "optimistic",
  "expand",
];
const BEARISH = [
  "crash",
  "plunge",
  "miss",
  "downgrade",
  "sell",
  "underperform",
  "weak",
  "decline",
  "loss",
  "bear",
  "bearish",
  "drop",
  "fall",
  "cut",
  "warning",
  "risk",
  "concern",
  "trouble",
  "layoff",
  "default",
  "recession",
];

function scoreSentiment(headline) {
  const lower = headline.toLowerCase();
  let score = 0;
  for (const w of BULLISH) {
    if (lower.includes(w)) score += 1;
  }
  for (const w of BEARISH) {
    if (lower.includes(w)) score -= 1;
  }
  return { score, label: score > 0 ? "BULLISH" : score < 0 ? "BEARISH" : "NEUTRAL" };
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function getNews(symbol) {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  return fetchJSON(
    `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
  );
}

async function getQuote(symbol) {
  return fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
}

async function analyzeTickerSentiment(symbol) {
  const [news, quote] = await Promise.all([getNews(symbol), getQuote(symbol)]);

  if (!news?.length)
    return { symbol, newsCount: 0, avgSentiment: 0, label: "NO_DATA", price: quote?.c };

  const scored = news.slice(0, 20).map((n) => ({
    headline: n.headline,
    source: n.source,
    datetime: new Date(n.datetime * 1000).toISOString(),
    ...scoreSentiment(n.headline),
  }));

  const avgScore = scored.reduce((s, n) => s + n.score, 0) / scored.length;
  const bullishCount = scored.filter((n) => n.label === "BULLISH").length;
  const bearishCount = scored.filter((n) => n.label === "BEARISH").length;
  const neutralCount = scored.filter((n) => n.label === "NEUTRAL").length;

  // Price action
  const priceChange = quote?.dp || 0;
  const weekChange = quote?.c && quote?.pc ? ((quote.c - quote.pc) / quote.pc) * 100 : 0;

  // Sentiment-price correlation
  const sentimentDirection = avgScore > 0.2 ? "BULLISH" : avgScore < -0.2 ? "BEARISH" : "NEUTRAL";
  const priceDirection = priceChange > 1 ? "UP" : priceChange < -1 ? "DOWN" : "FLAT";

  let correlation = "ALIGNED";
  if (
    (sentimentDirection === "BULLISH" && priceDirection === "DOWN") ||
    (sentimentDirection === "BEARISH" && priceDirection === "UP")
  ) {
    correlation = "DIVERGENT"; // Potential contrarian signal
  }

  return {
    symbol,
    price: quote?.c,
    priceChange: priceChange.toFixed(2),
    newsCount: scored.length,
    avgSentiment: avgScore.toFixed(2),
    sentimentLabel: sentimentDirection,
    bullish: bullishCount,
    bearish: bearishCount,
    neutral: neutralCount,
    correlation,
    topHeadlines: scored
      .slice(0, 3)
      .map((n) => ({ headline: n.headline, score: n.score, label: n.label })),
  };
}

async function main() {
  // Get tickers from portfolio or env
  let tickers = (process.env.TICKERS || "NBIS,AAPL,MSFT,NVDA,TSLA").split(",");

  try {
    const { readFileSync, existsSync } = await import("fs");
    const portfolioPath = process.env.HOME + "/.openclaw/data/portfolio.json";
    if (existsSync(portfolioPath)) {
      const p = JSON.parse(readFileSync(portfolioPath, "utf8"));
      tickers = p.holdings.map((h) => h.ticker);
    }
  } catch {}

  const results = [];
  for (const ticker of tickers) {
    try {
      const r = await analyzeTickerSentiment(ticker);
      results.push(r);
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Error ${ticker}: ${e.message}`);
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    tickers: results,
    overallSentiment:
      results.length > 0
        ? (
            results.reduce((s, r) => s + parseFloat(r.avgSentiment || 0), 0) / results.length
          ).toFixed(2)
        : "0",
    divergentSignals: results.filter((r) => r.correlation === "DIVERGENT").map((r) => r.symbol),
  };

  console.log(JSON.stringify(output, null, 2));

  if (process.env.FORMAT === "briefing") {
    let msg = "📰 **News Sentiment Analysis**\n";
    for (const r of results) {
      const emoji =
        r.sentimentLabel === "BULLISH" ? "🟢" : r.sentimentLabel === "BEARISH" ? "🔴" : "⚪";
      const corrEmoji = r.correlation === "DIVERGENT" ? " ⚠️" : "";
      msg += `${emoji} **${r.symbol}**: Sentiment ${r.avgSentiment} (${r.sentimentLabel}) | Price ${r.priceChange}%${corrEmoji}\n`;
      msg += `   ${r.bullish}🟢 ${r.bearish}🔴 ${r.neutral}⚪ from ${r.newsCount} articles\n`;
    }
    if (output.divergentSignals.length > 0) {
      msg += `\n⚠️ **Divergent signals** (sentiment ≠ price): ${output.divergentSignals.join(", ")}\n`;
    }
    process.stdout.write("\n---BRIEFING---\n" + msg);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
