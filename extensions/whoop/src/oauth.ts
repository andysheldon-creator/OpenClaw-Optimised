/**
 * Whoop OAuth 2.0 helper
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const REDIRECT_URI = "http://localhost:8086/oauth2callback";
const SCOPES = [
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:workout",
  "offline", // Required for refresh tokens
];

export interface WhoopOAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
  userId?: string;
}

export interface WhoopOAuthContext {
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  log: (msg: string) => void;
  note: (message: string, title?: string) => Promise<void>;
  prompt: (message: string) => Promise<string>;
  progress: { update: (msg: string) => void; stop: (msg?: string) => void };
  clientId: string;
  clientSecret: string;
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function parseCallbackInput(
  input: string,
  expectedState: string,
): { code: string; state: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "No input provided" };

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? expectedState;
    if (!code) return { error: "Missing 'code' parameter in URL" };
    if (!state) return { error: "Missing 'state' parameter. Paste the full URL." };
    return { code, state };
  } catch {
    if (!expectedState) return { error: "Paste the full redirect URL, not just the code." };
    return { code: trimmed, state: expectedState };
  }
}

async function waitForLocalCallback(params: {
  expectedState: string;
  timeoutMs: number;
  onProgress?: (message: string) => void;
}): Promise<{ code: string; state: string }> {
  const port = 8086;
  const hostname = "localhost";
  const expectedPath = "/oauth2callback";

  return new Promise<{ code: string; state: string }>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://${hostname}:${port}`);
        if (requestUrl.pathname !== expectedPath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();

        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end(`Authentication failed: ${error}`);
          finish(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Missing code or state");
          finish(new Error("Missing OAuth code or state"));
          return;
        }

        if (state !== params.expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Invalid state");
          finish(new Error("OAuth state mismatch"));
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'/></head>" +
            "<body><h2>Whoop OAuth complete</h2>" +
            "<p>You can close this window and return to Clawdbot.</p></body></html>",
        );

        finish(undefined, { code, state });
      } catch (err) {
        finish(err instanceof Error ? err : new Error("OAuth callback failed"));
      }
    });

    const finish = (err?: Error, result?: { code: string; state: string }) => {
      if (timeout) clearTimeout(timeout);
      try {
        server.close();
      } catch {
        // ignore close errors
      }
      if (err) {
        reject(err);
      } else if (result) {
        resolve(result);
      }
    };

    server.once("error", (err) => {
      finish(err instanceof Error ? err : new Error("OAuth callback server error"));
    });

    server.listen(port, hostname, () => {
      params.onProgress?.(`Waiting for OAuth callback on ${REDIRECT_URI}…`);
    });

    timeout = setTimeout(() => {
      finish(new Error("OAuth callback timeout"));
    }, params.timeoutMs);
  });
}

async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<WhoopOAuthCredentials> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id?: string;
  };

  if (!data.refresh_token) {
    throw new Error("No refresh token received. Ensure the 'offline' scope is requested.");
  }

  const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000; // 5min buffer

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: expiresAt,
    userId: data.user_id,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<WhoopOAuthCredentials> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id?: string;
  };

  const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: expiresAt,
    userId: data.user_id,
  };
}

function shouldUseManualOAuthFlow(isRemote: boolean): boolean {
  return isRemote;
}

export async function loginWhoopOAuth(ctx: WhoopOAuthContext): Promise<WhoopOAuthCredentials> {
  const needsManual = shouldUseManualOAuthFlow(ctx.isRemote);

  await ctx.note(
    needsManual
      ? [
          "You are running in a remote/VPS environment.",
          "A URL will be shown for you to open in your LOCAL browser.",
          "After signing in, copy the redirect URL and paste it back here.",
        ].join("\n")
      : [
          "Browser will open for Whoop authentication.",
          "Sign in with your Whoop account.",
          "The callback will be captured automatically on localhost:8086.",
        ].join("\n"),
    "Whoop OAuth",
  );

  const state = generateState();
  const authUrl = buildAuthUrl(ctx.clientId, state);

  if (needsManual) {
    ctx.progress.update("OAuth URL ready");
    ctx.log(`\nOpen this URL in your LOCAL browser:\n\n${authUrl}\n`);
    ctx.progress.update("Waiting for you to paste the callback URL...");
    const callbackInput = await ctx.prompt("Paste the redirect URL here: ");
    const parsed = parseCallbackInput(callbackInput, state);
    if ("error" in parsed) throw new Error(parsed.error);
    if (parsed.state !== state) {
      throw new Error("OAuth state mismatch - please try again");
    }
    ctx.progress.update("Exchanging authorization code for tokens...");
    return exchangeCodeForTokens(parsed.code, ctx.clientId, ctx.clientSecret);
  }

  ctx.progress.update("Complete sign-in in browser...");
  try {
    await ctx.openUrl(authUrl);
  } catch {
    ctx.log(`\nOpen this URL in your browser:\n\n${authUrl}\n`);
  }

  try {
    const { code } = await waitForLocalCallback({
      expectedState: state,
      timeoutMs: 5 * 60 * 1000,
      onProgress: (msg) => ctx.progress.update(msg),
    });
    ctx.progress.update("Exchanging authorization code for tokens...");
    return await exchangeCodeForTokens(code, ctx.clientId, ctx.clientSecret);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("EADDRINUSE") || err.message.includes("port") || err.message.includes("listen"))
    ) {
      ctx.progress.update("Local callback server failed. Switching to manual mode...");
      ctx.log(`\nOpen this URL in your LOCAL browser:\n\n${authUrl}\n`);
      const callbackInput = await ctx.prompt("Paste the redirect URL here: ");
      const parsed = parseCallbackInput(callbackInput, state);
      if ("error" in parsed) throw new Error(parsed.error);
      if (parsed.state !== state) {
        throw new Error("OAuth state mismatch - please try again");
      }
      ctx.progress.update("Exchanging authorization code for tokens...");
      return exchangeCodeForTokens(parsed.code, ctx.clientId, ctx.clientSecret);
    }
    throw err;
  }
}
