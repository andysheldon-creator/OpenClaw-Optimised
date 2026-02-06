#!/usr/bin/env bash
# caffeinate-gateway.sh - Keep macOS awake while the OpenClaw gateway runs
#
# This script wraps the gateway process with `caffeinate` to prevent system
# sleep during long-running agent operations, builds, or when running 24/7.
#
# Usage:
#   ./scripts/caffeinate-gateway.sh [gateway-args...]
#
# Options (passed through to gateway):
#   All arguments are forwarded to `pnpm openclaw gateway`
#
# Caffeinate flags used:
#   -i  Prevent idle sleep (system won't sleep due to inactivity)
#   -s  Prevent system sleep on AC power (won't sleep even when lid closed on AC)
#   -m  Prevent disk from idle sleeping
#
# The -d flag (prevent display sleep) is NOT used because the gateway doesn't
# need the display to stay on.
#
# Examples:
#   # Run gateway with default settings, caffeinated
#   ./scripts/caffeinate-gateway.sh
#
#   # Run gateway on a specific port
#   ./scripts/caffeinate-gateway.sh --port 18790
#
#   # Run with verbose logging
#   ./scripts/caffeinate-gateway.sh --verbose
#
# To stop:
#   Ctrl+C (or kill the process) - caffeinate exits when the child process ends
#
# See also:
#   - docs/development/caffeinate.md for detailed documentation
#   - man caffeinate for all available options

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "☕ Starting gateway with caffeinate (preventing system sleep)..."
echo "   Press Ctrl+C to stop"
echo ""

# Use caffeinate with:
#   -i: prevent idle sleep
#   -s: prevent system sleep on AC power (useful when lid is closed)
#   -m: prevent disk from idle sleeping
#
# The gateway process becomes a child of caffeinate. When it exits,
# caffeinate automatically releases its power assertions.
exec caffeinate -ism pnpm openclaw gateway "$@"
