#!/usr/bin/env bash
set -euo pipefail

cd /repo

export CLAWDBRAIN_STATE_DIR="/tmp/clawdbrain-test"
export CLAWDBRAIN_CONFIG_PATH="${CLAWDBRAIN_STATE_DIR}/clawdbrain.json"

echo "==> Seed state"
mkdir -p "${CLAWDBRAIN_STATE_DIR}/credentials"
mkdir -p "${CLAWDBRAIN_STATE_DIR}/agents/main/sessions"
echo '{}' >"${CLAWDBRAIN_CONFIG_PATH}"
echo 'creds' >"${CLAWDBRAIN_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${CLAWDBRAIN_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm clawdbrain reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${CLAWDBRAIN_CONFIG_PATH}"
test ! -d "${CLAWDBRAIN_STATE_DIR}/credentials"
test ! -d "${CLAWDBRAIN_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${CLAWDBRAIN_STATE_DIR}/credentials"
echo '{}' >"${CLAWDBRAIN_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm clawdbrain uninstall --state --yes --non-interactive

test ! -d "${CLAWDBRAIN_STATE_DIR}"

echo "OK"
