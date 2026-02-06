#!/usr/bin/env sh
set -eu

PORT="${PORT:-8080}"

exec node dist/index.js gateway \
  --allow-unconfigured \
  --bind lan \
  --port "$PORT"
