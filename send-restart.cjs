#!/usr/bin/env node

/**
 * Send a gateway.restart RPC to the local gateway.
 *
 * Usage:
 *   ./send-restart.sh [password]
 *   ./send-restart.sh              # reads from ~/.openclaw/openclaw.json
 *   ./send-restart.sh mypassword   # uses provided password
 */

const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const GATEWAY_URL = "ws://127.0.0.1:18789";

function loadAuthFromConfig() {
  const configPath = path.join(process.env.HOME, ".openclaw", "openclaw.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      token: config.gateway?.auth?.token ?? null,
      password: config.gateway?.auth?.password ?? null,
    };
  } catch {
    return { token: null, password: null };
  }
}

function main() {
  const { token, password } = loadAuthFromConfig();
  const authArg = process.argv[2];

  // Prefer token (allows skipping device identity), fall back to password
  const useToken = token || (authArg && authArg.startsWith("tok_"));
  const usePassword = !useToken && (password || authArg);

  if (!useToken && !usePassword) {
    console.error("Error: No token or password found in ~/.openclaw/openclaw.json");
    console.error("Usage: ./send-restart.cjs [token|password]");
    console.error("Note: Token auth is preferred (allows skipping device identity)");
    process.exit(1);
  }

  const auth = useToken ? { token: token || authArg } : { password: password || authArg };

  console.log(`Connecting to ${GATEWAY_URL}...`);

  const ws = new WebSocket(GATEWAY_URL);
  let _challenged = false;
  let connected = false;

  ws.on("open", () => {
    console.log("WebSocket connected, waiting for challenge...");
  });

  ws.on("message", (data) => {
    const text = Buffer.isBuffer(data)
      ? data.toString("utf8")
      : typeof data === "string"
        ? data
        : JSON.stringify(data);
    const msg = JSON.parse(text);

    // Handle connect.challenge event
    if (msg.type === "event" && msg.event === "connect.challenge") {
      console.log("Received challenge, sending connect...");
      _challenged = true;
      ws.send(
        JSON.stringify({
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "cli",
              version: "1.0",
              mode: "cli",
              platform: process.platform,
            },
            role: "operator",
            scopes: ["operator.admin"],
            auth,
          },
        }),
      );
      return;
    }

    // Handle connect response
    if (msg.type === "res" && msg.id === "connect-1") {
      if (msg.ok) {
        console.log("Connected! Sending gateway.restart...");
        connected = true;
        ws.send(
          JSON.stringify({
            type: "req",
            id: "restart-1",
            method: "gateway.restart",
            params: {},
          }),
        );
      } else {
        console.error("Connect failed:", msg.error?.message || "unknown error");
        ws.close();
        process.exit(1);
      }
      return;
    }

    // Handle restart response
    if (msg.type === "res" && msg.id === "restart-1") {
      if (msg.ok) {
        console.log("Restart command sent successfully!");
      } else {
        console.error("Restart failed:", msg.error?.message || "unknown error");
      }
      ws.close();
      process.exit(msg.ok ? 0 : 1);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    process.exit(1);
  });

  ws.on("close", (code, reason) => {
    if (!connected) {
      console.log(`Connection closed (code=${code}, reason=${reason ? String(reason) : "none"})`);
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.error("Timeout: No response from gateway");
    ws.close();
    process.exit(1);
  }, 10000);
}

main();
