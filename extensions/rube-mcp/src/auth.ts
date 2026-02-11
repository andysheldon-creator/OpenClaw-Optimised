import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

// Rube OAuth endpoints (from .well-known/oauth-authorization-server)
export const RUBE_ISSUER = "https://login.composio.dev";
export const RUBE_REGISTRATION_ENDPOINT = "https://rube.app/api/auth/mcp/register";
export const RUBE_AUTHORIZE_ENDPOINT = "https://rube.app/api/auth/mcp/authorize";
export const RUBE_TOKEN_ENDPOINT = "https://rube.app/api/auth/mcp/token";

const REDIRECT_PORT = 19876;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = ["email", "offline_access", "openid", "profile"];
const EXPIRES_BUFFER_MS = 5 * 60 * 1000;

export type RubePkce = { verifier: string; challenge: string };

export type RubeOAuthCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
};

export type RubeDcrResponse = {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
};

/**
 * Generate PKCE code verifier and challenge (S256)
 */
export function generatePkce(): RubePkce {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Dynamic Client Registration with Rube
 */
export async function registerClient(fetchFn = fetch): Promise<string> {
  const response = await fetchFn(RUBE_REGISTRATION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Clawdbot",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Rube DCR failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as RubeDcrResponse;
  if (!data.client_id) {
    throw new Error("Rube DCR returned no client_id");
  }

  return data.client_id;
}

/**
 * Build the authorization URL for the OAuth flow
 */
export function buildAuthorizationUrl(params: {
  clientId: string;
  pkce: RubePkce;
  state: string;
}): string {
  const url = new URL(RUBE_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  fetchFn?: typeof fetch;
  now?: number;
}): Promise<RubeOAuthCredentials> {
  const fetchFn = params.fetchFn ?? fetch;
  const now = params.now ?? Date.now();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: params.codeVerifier,
  });

  const response = await fetchFn(RUBE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Rube token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const accessToken = data.access_token?.trim();
  const refreshToken = data.refresh_token?.trim() ?? "";
  const expiresIn = data.expires_in ?? 3600;

  if (!accessToken) throw new Error("Rube token exchange returned no access_token");

  return {
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000 - EXPIRES_BUFFER_MS,
    clientId: params.clientId,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshTokens(params: {
  credentials: RubeOAuthCredentials;
  fetchFn?: typeof fetch;
  now?: number;
}): Promise<RubeOAuthCredentials> {
  const fetchFn = params.fetchFn ?? fetch;
  const now = params.now ?? Date.now();

  if (!params.credentials.refreshToken) {
    throw new Error(
      "No refresh token available - please re-authenticate with 'clawdbot rube login'",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.credentials.clientId,
    refresh_token: params.credentials.refreshToken,
  });

  const response = await fetchFn(RUBE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Rube token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const accessToken = data.access_token?.trim();
  const newRefreshToken = data.refresh_token?.trim();
  const expiresIn = data.expires_in ?? 3600;

  if (!accessToken) throw new Error("Rube token refresh returned no access_token");

  return {
    accessToken,
    refreshToken: newRefreshToken || params.credentials.refreshToken,
    expiresAt: now + expiresIn * 1000 - EXPIRES_BUFFER_MS,
    clientId: params.credentials.clientId,
  };
}

/**
 * Start local server to receive OAuth callback
 */
export function startCallbackServer(params: {
  state: string;
  timeoutMs?: number;
}): Promise<{ code: string; cleanup: () => void }> {
  const timeoutMs = params.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    let resolved = false;

    const server = http.createServer((req, res) => {
      if (resolved) {
        res.writeHead(400);
        res.end("Already processed");
        return;
      }

      const url = new URL(req.url ?? "/", `http://127.0.0.1:${REDIRECT_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        // Escape error description to prevent HTML injection
        const safeDesc = (errorDescription || error).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
        );
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Authentication failed</h1><p>${safeDesc}</p></body></html>`);
        resolved = true;
        cleanup();
        reject(new Error(`OAuth error: ${errorDescription || error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Missing authorization code</h1></body></html>");
        resolved = true;
        cleanup();
        reject(new Error("OAuth callback missing authorization code"));
        return;
      }

      if (state !== params.state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Invalid state parameter</h1></body></html>");
        resolved = true;
        cleanup();
        reject(new Error("OAuth callback received invalid state parameter"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h1>Rube Connected!</h1>
              <p>You can close this window and return to Clawdbot.</p>
            </div>
          </body>
        </html>
      `);

      resolved = true;
      cleanup();
      resolve({ code, cleanup: () => {} });
    });

    const cleanup = () => {
      clearTimeout(timeout);
      server.close();
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error("OAuth callback timed out"));
      }
    }, timeoutMs);

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      // Server ready
    });

    server.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Failed to start callback server: ${err.message}`));
      }
    });
  });
}

/**
 * Check if credentials are expired or about to expire
 */
export function isRubeTokenExpired(credentials: RubeOAuthCredentials, now = Date.now()): boolean {
  return now >= credentials.expiresAt;
}
