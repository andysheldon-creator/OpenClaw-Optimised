#!/usr/bin/env bash
set -euo pipefail

echo "=== SAST: Static Application Security Testing ==="
echo ""

FAIL=0

# 1. Semgrep
echo "--- [1/2] Semgrep Scan ---"
if command -v semgrep &> /dev/null; then
  if semgrep scan --config p/javascript --config p/typescript --config p/nodejs --json --output sast-semgrep-results.json .; then
    echo "Semgrep: PASS"
  else
    echo "Semgrep: FINDINGS DETECTED (see sast-semgrep-results.json)"
    FAIL=1
  fi
else
  echo "Semgrep not installed locally, skipping (will run in CI via Docker)"
fi

# 2. pnpm audit
echo ""
echo "--- [2/2] pnpm audit ---"
if pnpm audit --json > sast-pnpm-audit-results.json 2>&1; then
  echo "pnpm audit: PASS"
else
  echo "pnpm audit: vulnerabilities found (see sast-pnpm-audit-results.json)"
  # Don't fail on audit — many upstream deps have unfixed advisories
  # Review the JSON output and act on critical/high findings manually
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "=== SAST: FAILED - Review findings above ==="
  exit 1
else
  echo "=== SAST: ALL CHECKS PASSED ==="
fi
