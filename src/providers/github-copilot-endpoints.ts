/**
 * Derives all GitHub Copilot-related endpoint URLs from a single host value.
 *
 * Supports:
 * - github.com (default, individual Copilot)
 * - GHE Cloud with data residency (e.g. "myorg.ghe.com")
 *
 * GHE Cloud uses a dedicated `api.{host}` subdomain with identical API paths
 * (no `/api/v3` prefix) and `copilot-api.{host}` for the Copilot model API.
 */

const DEFAULT_CLIENT_ID = "Iv1.b507a08c87ecfe98";

export type GitHubCopilotEndpoints = {
  /** The GitHub host, e.g. "github.com" or "myorg.ghe.com". */
  host: string;
  /** OAuth App Client ID for the device flow. */
  clientId: string;
  /** POST — request a device code. */
  deviceCodeUrl: string;
  /** POST — poll for an access token. */
  accessTokenUrl: string;
  /** GET — exchange GitHub token for Copilot API token. */
  copilotTokenUrl: string;
  /** GET — Copilot user / usage info. */
  copilotUserUrl: string;
  /** Fallback Copilot API base URL (if not derivable from token response). */
  defaultCopilotApiBaseUrl: string;
};

export function isGitHubDotCom(host: string): boolean {
  return !host || host === "github.com";
}

/**
 * Resolve all Copilot endpoint URLs from a host string.
 *
 * @param host - GitHub host, e.g. "github.com" (default) or "myorg.ghe.com".
 * @param clientId - OAuth Client ID override; defaults to the public Copilot App.
 */
export function resolveGitHubCopilotEndpoints(
  host?: string,
  clientId?: string,
): GitHubCopilotEndpoints {
  const effectiveHost = host?.trim() || "github.com";
  const dotCom = isGitHubDotCom(effectiveHost);

  // github.com uses api.github.com; GHE Cloud uses api.{host}
  const apiBase = dotCom
    ? "https://api.github.com"
    : `https://api.${effectiveHost}`;

  return {
    host: effectiveHost,
    clientId: clientId?.trim() || DEFAULT_CLIENT_ID,
    deviceCodeUrl: `https://${effectiveHost}/login/device/code`,
    accessTokenUrl: `https://${effectiveHost}/login/oauth/access_token`,
    copilotTokenUrl: `${apiBase}/copilot_internal/v2/token`,
    copilotUserUrl: `${apiBase}/copilot_internal/user`,
    // github.com → api.individual.githubcopilot.com
    // GHE Cloud → copilot-api.{host}
    defaultCopilotApiBaseUrl: dotCom
      ? "https://api.individual.githubcopilot.com"
      : `https://copilot-api.${effectiveHost}`,
  };
}
