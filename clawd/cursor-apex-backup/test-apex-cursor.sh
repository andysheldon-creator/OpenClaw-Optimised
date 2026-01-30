#!/bin/bash
# APEX Cursor Optimization Test Script
# Run this to validate the APEX rules file

APEX_FILE="${1:-$HOME/.cursor/rules/apex-v6.mdc}"

echo "=== APEX Cursor Optimization Test ==="
echo "File: $APEX_FILE"
echo ""

if [ ! -f "$APEX_FILE" ]; then
    echo "ERROR: APEX file not found at $APEX_FILE"
    exit 1
fi

# Check file size
LINES=$(wc -l < "$APEX_FILE")
echo "Lines: $LINES"
if [ "$LINES" -gt 500 ]; then
    echo "WARNING: File exceeds 500 lines (may be too large)"
else
    echo "OK: Line count acceptable"
fi
echo ""

# Check required sections
echo "=== Required Sections ==="
SECTIONS=(
    "## Model Selection"
    "## Model Capabilities"
    "## Flash Maximizer"
    "## Iterative Refinement"
    "## Extended Thinking"
    "## Core Laws"
    "## Instincts"
    "## Quality Gates"
)

MISSING=0
for section in "${SECTIONS[@]}"; do
    if grep -q "$section" "$APEX_FILE"; then
        echo "✓ $section"
    else
        echo "✗ $section MISSING"
        MISSING=$((MISSING + 1))
    fi
done
echo ""

# Check model references
echo "=== Model References ==="
MODELS=(
    "Gemini 3 Flash"
    "Haiku 4.5"
    "Sonnet 4.5"
    "Opus 4.5"
    "Gemini 3 Pro"
)

for model in "${MODELS[@]}"; do
    COUNT=$(grep -c "$model" "$APEX_FILE" || echo 0)
    echo "$model: $COUNT references"
done
echo ""

# Check escalation alerts
echo "=== Escalation Alerts ==="
ALERT_COUNT=$(grep -c "⚡" "$APEX_FILE" || echo 0)
echo "⚡ alerts found: $ALERT_COUNT"
if [ "$ALERT_COUNT" -lt 5 ]; then
    echo "WARNING: Expected at least 5 escalation alerts"
else
    echo "OK: Sufficient escalation alerts"
fi
echo ""

# Check confidence signals
echo "=== Confidence Signals ==="
for signal in "HIGH" "MEDIUM" "LOW"; do
    if grep -q "$signal" "$APEX_FILE"; then
        echo "✓ $signal confidence signal"
    else
        echo "✗ $signal confidence signal MISSING"
    fi
done
echo ""

# Version check
echo "=== Version ==="
VERSION=$(grep -oP "APEX v\d+\.\d+\.\d+" "$APEX_FILE" | head -1)
echo "Detected version: $VERSION"
echo ""

# Summary
echo "=== Summary ==="
if [ "$MISSING" -eq 0 ]; then
    echo "All required sections present"
    echo "APEX Cursor Optimization: PASSED"
else
    echo "Missing $MISSING required sections"
    echo "APEX Cursor Optimization: FAILED"
    exit 1
fi
