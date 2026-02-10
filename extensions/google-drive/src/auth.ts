import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
// Dynamic type import for OAuthCredentials (not in plugin SDK)
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;

const CLIENT_ID_KEY = "GOOGLE_CLIENT_ID";
const CLIENT_SECRET_KEY = "GOOGLE_CLIENT_SECRET";
const REDIRECT_URI_KEY = "GOOGLE_OAUTH_REDIRECT_URL";
const DEFAULT_REDIRECT_URI = "http://localhost:8086/oauth2callback";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export type GoogleDriveOAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
  email?: string;
};

export type GoogleDriveOAuthContext = {
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  log: (msg: string) => void;
  note: (message: string, title?: string) => Promise<void>;
  prompt: (message: string) => Promise<string>;
  progress: { update: (msg: string) => void; stop: (msg?: string) => void };
};

function resolveEnv(key: string): string | undefined {
  return process.env[key]?.trim();
}

function resolveOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = resolveEnv(CLIENT_ID_KEY);
  const clientSecret = resolveEnv(CLIENT_SECRET_KEY);
  const redirectUri = resolveEnv(REDIRECT_URI_KEY) || DEFAULT_REDIRECT_URI;

  if (!clientId) {
    throw new Error(
      `Missing ${CLIENT_ID_KEY} environment variable. Please set it to your Google OAuth client ID.`,
    );
  }
  if (!clientSecret) {
    throw new Error(
      `Missing ${CLIENT_SECRET_KEY} environment variable. Please set it to your Google OAuth client secret.`,
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function isWSL(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    const release = readFileSync("/proc/version", "utf8").toLowerCase();
    return release.includes("microsoft") || release.includes("wsl");
  } catch {
    return false;
  }
}

function isWSL2(): boolean {
  if (!isWSL()) {
    return false;
  }
  try {
    const version = readFileSync("/proc/version", "utf8").toLowerCase();
    return version.includes("wsl2") || version.includes("microsoft-standard");
  } catch {
    return false;
  }
}

function shouldUseManualOAuthFlow(isRemote: boolean): boolean {
  // Also check for Fly.io environment
  const isFlyIo = Boolean(process.env.FLY_APP_NAME || process.env.FLY_MACHINE_ID);
  return isRemote || isWSL2() || isFlyIo;
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  challenge: string,
  verifier: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function parseCallbackInput(
  input: string,
  expectedState: string,
): { code: string; state: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "No input provided" };
  }

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? expectedState;
    if (!code) {
      return { error: "Missing 'code' parameter in URL" };
    }
    if (!state) {
      return { error: "Missing 'state' parameter. Paste the full URL." };
    }
    return { code, state };
  } catch {
    if (!expectedState) {
      return { error: "Paste the full redirect URL, not just the code." };
    }
    return { code: trimmed, state: expectedState };
  }
}

async function waitForLocalCallback(params: {
  redirectUri: string;
  expectedState: string;
  timeoutMs: number;
  onProgress?: (message: string) => void;
}): Promise<{ code: string; state: string }> {
  const url = new URL(params.redirectUri);
  const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
  const hostname = url.hostname || "localhost";
  const expectedPath = url.pathname || "/oauth2callback";

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
            "<body><h2>Google Drive OAuth complete</h2>" +
            "<p>You can close this window and return to OpenClaw.</p></body></html>",
        );

        finish(undefined, { code, state });
      } catch (err) {
        finish(err instanceof Error ? err : new Error("OAuth callback failed"));
      }
    });

    const finish = (err?: Error, result?: { code: string; state: string }) => {
      if (timeout) {
        clearTimeout(timeout);
      }
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
      params.onProgress?.(`Waiting for OAuth callback on ${params.redirectUri}…`);
    });

    timeout = setTimeout(() => {
      finish(new Error("OAuth callback timeout"));
    }, params.timeoutMs);
  });
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<GoogleDriveOAuthCredentials> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: verifier,
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
  };

  if (!data.refresh_token) {
    throw new Error("No refresh token received. Please try again.");
  }

  const email = await getUserEmail(data.access_token);
  const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;

  return {
    refresh: data.refresh_token,
    access: data.access_token,
    expires: expiresAt,
    email,
  };
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = (await response.json()) as { email?: string };
      return data.email;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function loginGoogleDriveOAuth(
  ctx: GoogleDriveOAuthContext,
): Promise<GoogleDriveOAuthCredentials> {
  const { clientId, clientSecret, redirectUri } = resolveOAuthClientConfig();
  const needsManual = shouldUseManualOAuthFlow(ctx.isRemote);

  await ctx.note(
    needsManual
      ? [
          "You are running in a remote/VPS environment.",
          "A URL will be shown for you to open in your LOCAL browser.",
          "After signing in, copy the redirect URL and paste it back here.",
        ].join("\n")
      : [
          "Browser will open for Google authentication.",
          "Sign in with your Google account for Google Drive access.",
          `The callback will be captured automatically on ${redirectUri}.`,
        ].join("\n"),
    "Google Drive OAuth",
  );

  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthUrl(clientId, redirectUri, challenge, verifier);

  if (needsManual) {
    ctx.progress.update("OAuth URL ready");
    ctx.log(`\nOpen this URL in your LOCAL browser:\n\n${authUrl}\n`);
    ctx.progress.update("Waiting for you to paste the callback URL...");
    const callbackInput = await ctx.prompt("Paste the redirect URL here: ");
    const parsed = parseCallbackInput(callbackInput, verifier);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    if (parsed.state !== verifier) {
      throw new Error("OAuth state mismatch - please try again");
    }
    ctx.progress.update("Exchanging authorization code for tokens...");
    return exchangeCodeForTokens(clientId, clientSecret, redirectUri, parsed.code, verifier);
  }

  ctx.progress.update("Complete sign-in in browser...");
  try {
    await ctx.openUrl(authUrl);
  } catch {
    ctx.log(`\nOpen this URL in your browser:\n\n${authUrl}\n`);
  }

  try {
    const { code } = await waitForLocalCallback({
      redirectUri,
      expectedState: verifier,
      timeoutMs: 5 * 60 * 1000,
      onProgress: (msg) => ctx.progress.update(msg),
    });
    ctx.progress.update("Exchanging authorization code for tokens...");
    return await exchangeCodeForTokens(clientId, clientSecret, redirectUri, code, verifier);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("EADDRINUSE") ||
        err.message.includes("port") ||
        err.message.includes("listen"))
    ) {
      ctx.progress.update("Local callback server failed. Switching to manual mode...");
      ctx.log(`\nOpen this URL in your LOCAL browser:\n\n${authUrl}\n`);
      const callbackInput = await ctx.prompt("Paste the redirect URL here: ");
      const parsed = parseCallbackInput(callbackInput, verifier);
      if ("error" in parsed) {
        throw new Error(parsed.error, { cause: err });
      }
      if (parsed.state !== verifier) {
        throw new Error("OAuth state mismatch - please try again", { cause: err });
      }
      ctx.progress.update("Exchanging authorization code for tokens...");
      return exchangeCodeForTokens(clientId, clientSecret, redirectUri, parsed.code, verifier);
    }
    throw err;
  }
}

export function createOAuth2ClientFromCredentials(credentials: OAuthCredentials): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = resolveOAuthClientConfig();
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });

  client.setCredentials({
    access_token: credentials.access,
    refresh_token: credentials.refresh,
    expiry_date: credentials.expires,
  });

  return client;
}
