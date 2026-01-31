#!/usr/bin/env node
/**
 * Hot reload dev: runs watch-node.mjs (TS + gateway) and a small WebSocket server.
 * When dist/control-ui changes, broadcasts "reload" so the Control UI in the browser refreshes.
 * Usage: node scripts/watch-all.mjs gateway --force
 * Then open the Control UI; when you rebuild the UI (e.g. pnpm ui:build), the page auto-refreshes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { WebSocketServer } from "ws";

const RELOAD_PORT = parseInt(process.env.CLAWDBOT_RELOAD_PORT || "35729", 10);
const cwd = process.cwd();
const args = process.argv.slice(2);

const sockets = new Set();
let reloadDebounce = null;
const DEBOUNCE_MS = 150;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Control UI reload server");
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.on("close", () => sockets.delete(ws));
});

function broadcastReload() {
  for (const ws of sockets) {
    try {
      if (ws.readyState === 1) ws.send("reload");
    } catch (_) {}
  }
}

function scheduleReload() {
  if (reloadDebounce) clearTimeout(reloadDebounce);
  reloadDebounce = setTimeout(() => {
    reloadDebounce = null;
    broadcastReload();
  }, DEBOUNCE_MS);
}

const controlUiDir = path.join(cwd, "dist", "control-ui");
if (fs.existsSync(controlUiDir)) {
  fs.watch(controlUiDir, { recursive: true }, () => scheduleReload());
}

server.listen(RELOAD_PORT, "127.0.0.1", () => {
  process.stderr.write(`[watch-all] Reload server on ws://127.0.0.1:${RELOAD_PORT}\n`);
});

const nodeArgs = ["scripts/watch-node.mjs", ...args];
const child = spawn("node", nodeArgs, { cwd, env: process.env, stdio: "inherit" });

child.on("exit", (code, signal) => {
  server.close();
  process.exit(signal ? 128 + signal : code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
