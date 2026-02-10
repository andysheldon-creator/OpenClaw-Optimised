#!/usr/bin/env node
/**
 * Patches ~/.openclaw/openclaw.json to add gateway.controlUi.allowInsecureAuth: true
 * so the dashboard can connect with just the token (no device pairing).
 * Run from repo root: node scripts/patch-control-ui-auth.js
 * Then restart the gateway: docker compose restart openclaw-gateway
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const configDir = process.env.OPENCLAW_CONFIG_DIR || path.join(os.homedir(), ".openclaw");
const configPath = path.join(configDir, "openclaw.json");

if (!fs.existsSync(configPath)) {
  console.error("Config not found:", configPath);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.error("Failed to read config:", e.message);
  process.exit(1);
}

const gateway = parsed.gateway ?? {};
const controlUi = gateway.controlUi ?? {};
if (controlUi.allowInsecureAuth === true) {
  console.log("Config already has gateway.controlUi.allowInsecureAuth: true");
  process.exit(0);
}

controlUi.allowInsecureAuth = true;
gateway.controlUi = controlUi;
parsed.gateway = gateway;

fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf8");
console.log("Patched", configPath, "with gateway.controlUi.allowInsecureAuth: true");
console.log("Restart the gateway: docker compose restart openclaw-gateway");
