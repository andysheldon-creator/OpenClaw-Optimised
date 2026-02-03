import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";

import { getObaKeysDir } from "./keys.js";

export interface ObaLoginResult {
  ok: boolean;
  token?: string;
  error?: string;
}

/**
 * Start a localhost callback server, open the browser to OBA's CLI auth endpoint,
 * and wait for the redirect with the PAT.
 */
export async function loginOba(params: {
  apiUrl: string;
  timeoutMs?: number;
  openBrowser: (url: string) => Promise<void>;
  onProgress?: (message: string) => void;
}): Promise<ObaLoginResult> {
  const state = randomBytes(16).toString("hex");
  const timeoutMs = params.timeoutMs ?? 3 * 60 * 1000;

  const { port, server } = await startCallbackServer();
  const authUrl = `${params.apiUrl}/auth/cli?port=${port}&state=${state}`;

  try {
    // Set up the callback listener BEFORE opening browser so we
    // don't miss fast redirects back to localhost.
    const callbackPromise = waitForCallback(server, state, timeoutMs);
    params.onProgress?.("Opening browser for login...");
    await params.openBrowser(authUrl);
    params.onProgress?.("Waiting for authentication...");
    return await callbackPromise;
  } finally {
    try {
      server.close();
    } catch {
      // ignore close errors
    }
  }
}

function startCallbackServer(): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to start callback server"));
        return;
      }
      resolve({ port: addr.port, server });
    });
    server.once("error", (err) => {
      reject(err);
    });
  });
}

function waitForCallback(
  server: Server,
  expectedState: string,
  timeoutMs: number,
): Promise<ObaLoginResult> {
  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout | null = null;
    let resolved = false;

    const finish = (result: ObaLoginResult) => {
      if (resolved) return;
      resolved = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };

    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (url.pathname !== "/callback") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain");
        res.end("Not found");
        return;
      }

      const token = url.searchParams.get("token");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(errorPage(error));
        finish({ ok: false, error });
        return;
      }

      if (!state || state !== expectedState) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain");
        res.end("Invalid state");
        return;
      }

      if (!token) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain");
        res.end("Missing token");
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(successPage());
      finish({ ok: true, token });
    });

    timeout = setTimeout(() => {
      finish({ ok: false, error: "Login timed out" });
    }, timeoutMs);
  });
}

function successPage(): string {
  return [
    "<!DOCTYPE html><html><head><meta charset='utf-8'>",
    "<title>OpenBotAuth Login</title>",
    "<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333}",
    "h2{color:#16a34a}</style></head>",
    "<body><h2>Login successful</h2>",
    "<p>You can close this window and return to the terminal.</p>",
    "</body></html>",
  ].join("");
}

function errorPage(error: string): string {
  return [
    "<!DOCTYPE html><html><head><meta charset='utf-8'>",
    "<title>OpenBotAuth Login</title>",
    "<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333}",
    ".error{color:#dc2626}</style></head>",
    `<body><h2 class="error">Login failed</h2>`,
    `<p>${escapeHtml(error)}</p>`,
    "</body></html>",
  ].join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Save PAT to ~/.openclaw/oba/token with owner-only permissions. */
export function saveObaToken(token: string): string {
  const obaDir = path.dirname(getObaKeysDir());
  fs.mkdirSync(obaDir, { recursive: true });
  const tokenFile = path.join(obaDir, "token");
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  return tokenFile;
}
