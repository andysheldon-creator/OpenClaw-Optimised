---
name: usage-analytics
description: Analyze Clawdbot token usage and costs from session logs. Use when asked about API costs, token consumption, usage reports, or spending analysis.
homepage: https://github.com/ryoppippi/ccusage
metadata: {"clawdbot":{"emoji":"📊","requires":{"bins":["python3"]},"install":[{"id":"python-brew","kind":"brew","formula":"python","bins":["python3"],"label":"Install Python (brew)"}]}}
---

# Usage analytics

## Overview

Analyze token usage and costs from Clawdbot session logs. Outputs daily totals with
cache details, model lists, and optional JSON for scripting.

## Quick start

```bash
# Today's usage
python3 {baseDir}/scripts/usage.py today

# Last 7 days
python3 {baseDir}/scripts/usage.py week

# Last 30 days
python3 {baseDir}/scripts/usage.py month

# Specific date
python3 {baseDir}/scripts/usage.py 2026-01-18

# Date range
python3 {baseDir}/scripts/usage.py 2026-01-15..2026-01-18

# All time
python3 {baseDir}/scripts/usage.py all
```

## Options

```text
--days N          last N days (overrides period)
--agent NAME      default, main, or all (default: all)
--format FORMAT   text (default) or json
--pretty          pretty-print JSON
--cost-mode MODE  auto (default), calculate, or display
--pricing-source  builtin (default) or ccusage (requires --cost-mode calculate)
--ccusage-offline use ccusage offline pricing data
--dir PATH        Clawdbot directory (default: ~/.clawdbot)
```

## Output
- Logged cost reflects cache discounts in the session logs.
- API-equivalent cost reverses the cache read discount for comparison.
- JSON output includes daily breakdowns, totals, and model lists.
- Dates are grouped by local timezone based on session timestamps.
- Cost mode `auto` uses logged costs when present; `calculate` uses built-in Claude rates.
- Built-in rates are fixed; use `--pricing-source ccusage` for up-to-date pricing.
- Pricing source `ccusage` uses the ccusage CLI to calculate costs from tokens.
- When using ccusage pricing, `apiEquivalentCostUSD` matches `loggedCostUSD`.

## Examples

```bash
# JSON output for scripting
python3 {baseDir}/scripts/usage.py week --format json --pretty

# Specific agent only
python3 {baseDir}/scripts/usage.py today --agent default

# Last 14 days
python3 {baseDir}/scripts/usage.py --days 14

# Force calculated costs
python3 {baseDir}/scripts/usage.py week --cost-mode calculate

# Use ccusage pricing
python3 {baseDir}/scripts/usage.py week --cost-mode calculate --pricing-source ccusage
```

## ccusage pricing (optional feature)

Install the ccusage CLI if you want calculated costs from its pricing dataset:

```bash
npm install -g ccusage
```

Ensure the `ccusage` binary is on your `PATH`.

## Session log location

Logs are stored at `~/.clawdbot/agents/{agent}/sessions/*.jsonl`. Read `references/session-log-format.md` when you need the JSONL structure details.

## References
- `references/session-log-format.md`
