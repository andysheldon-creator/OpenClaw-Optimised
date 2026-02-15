#!/usr/bin/env bash
set -euo pipefail

echo "=== DAST: Dynamic Application Security Testing ==="

TARGET_URL="${STAGING_URL:-http://localhost:18789}"
REPORT_DIR="${REPORT_DIR:-./dast-reports}"

mkdir -p "$REPORT_DIR"

echo "Target: $TARGET_URL"
echo "Reports: $REPORT_DIR"
echo ""

# Check if target is reachable
echo "--- Checking target availability ---"
MAX_RETRIES=12
RETRY_INTERVAL=10
for i in $(seq 1 $MAX_RETRIES); do
  if curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL" | grep -q "^[23]"; then
    echo "Target is reachable."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: Target $TARGET_URL not reachable after $((MAX_RETRIES * RETRY_INTERVAL))s"
    exit 1
  fi
  echo "Waiting for target... (attempt $i/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

# Run ZAP scan via Docker
echo ""
echo "--- Running OWASP ZAP Full Scan ---"
docker run --rm \
  -v "$(pwd)/config/zap-config.yml:/zap/wrk/zap-config.yml:ro" \
  -v "$(pwd)/$REPORT_DIR:/zap/reports" \
  --network host \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py \
  -t "$TARGET_URL" \
  -c zap-config.yml \
  -J zap-report.json \
  -r zap-report.html \
  -w zap-report.md \
  || true  # Don't fail immediately; check results below

# Evaluate results
echo ""
echo "--- Evaluating DAST Results ---"
if [ -f "$REPORT_DIR/zap-report.json" ]; then
  HIGH_COUNT=$(python3 -c "
import json, sys
with open('$REPORT_DIR/zap-report.json') as f:
    data = json.load(f)
alerts = data.get('site', [{}])[0].get('alerts', [])
high_critical = [a for a in alerts if a.get('riskcode', '0') in ('3', '4')]
print(len(high_critical))
" 2>/dev/null || echo "0")

  echo "High/Critical findings: $HIGH_COUNT"
  if [ "$HIGH_COUNT" -gt 0 ]; then
    echo "=== DAST: FAILED - High/Critical findings detected ==="
    exit 1
  fi
fi

echo "=== DAST: PASSED ==="
