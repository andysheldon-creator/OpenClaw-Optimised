/**
 * Databricks authentication utilities.
 *
 * Supports two authentication modes:
 * 1. **PAT (Personal Access Token)**: Set `DATABRICKS_TOKEN` or `DATABRICKS_API_KEY`.
 * 2. **Service Principal (OAuth client_credentials)**: Set `DATABRICKS_CLIENT_ID`,
 *    `DATABRICKS_CLIENT_SECRET`, and `DATABRICKS_HOST`. The module exchanges the
 *    credentials for a short-lived access token via the workspace OIDC endpoint.
 */

// In-memory token cache to avoid re-exchanging on every call.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/** Clear the cached token (useful for tests). */
export function clearDatabricksTokenCache(): void {
  cachedToken = null;
}

export interface DatabricksServicePrincipalConfig {
  workspaceUrl: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Resolve Databricks service principal credentials from environment variables.
 * Returns `null` if the required env vars are not all set.
 */
export function resolveDatabricksServicePrincipalEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabricksServicePrincipalConfig | null {
  const clientId = env.DATABRICKS_CLIENT_ID?.trim();
  const clientSecret = env.DATABRICKS_CLIENT_SECRET?.trim();
  const host = env.DATABRICKS_HOST?.trim();
  if (!clientId || !clientSecret || !host) {
    return null;
  }
  // Normalize: strip trailing slashes from the host URL.
  const workspaceUrl = host.replace(/\/+$/, "");
  return { workspaceUrl, clientId, clientSecret };
}

/**
 * Exchange Databricks service principal client credentials for an OAuth access token.
 *
 * Uses the standard OAuth 2.0 client_credentials grant against the workspace OIDC endpoint:
 *   POST {workspaceUrl}/oidc/v1/token
 *   Authorization: Basic base64(client_id:client_secret)
 *   Body: grant_type=client_credentials&scope=all-apis
 *
 * Returns the access_token string. Caches the token in memory and reuses it until
 * 60 seconds before expiry.
 */
export async function exchangeDatabricksServicePrincipalToken(
  config: DatabricksServicePrincipalConfig,
): Promise<string> {
  // Return cached token if still valid (with 60-second safety margin).
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `${config.workspaceUrl}/oidc/v1/token`;
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=all-apis",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`Databricks OAuth token exchange failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Databricks OAuth response missing access_token");
  }

  // Cache the token. Default TTL: 1 hour if expires_in is not provided.
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return data.access_token;
}

/**
 * Check whether Databricks service principal env vars are configured.
 * This is a fast synchronous check (no network calls).
 */
export function hasDatabricksServicePrincipalEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDatabricksServicePrincipalEnv(env) !== null;
}
