import type { A2ARemoteAgent } from "./config.js";

/**
 * Match a target URL against configured remote agents by origin + pathname prefix.
 * Returns the matching headers if found, undefined otherwise.
 *
 * This ensures key isolation: credentials for URL A are never sent to URL B.
 */
export function resolveOutboundHeaders(
  agentUrl: string,
  remoteAgents: A2ARemoteAgent[] | undefined,
): Record<string, string> | undefined {
  if (!remoteAgents || remoteAgents.length === 0) {
    return undefined;
  }

  let target: URL;
  try {
    target = new URL(agentUrl);
  } catch {
    return undefined;
  }

  for (const remote of remoteAgents) {
    let configured: URL;
    try {
      configured = new URL(remote.url);
    } catch {
      continue;
    }

    // Match origin (protocol + host + port)
    if (target.origin !== configured.origin) {
      continue;
    }

    // Match pathname prefix (configured path must be a prefix of the target path)
    const configuredPath = configured.pathname.replace(/\/$/, "");
    const targetPath = target.pathname.replace(/\/$/, "");

    // Root path matches everything under the same origin
    if (!configuredPath) {
      return remote.headers;
    }

    if (targetPath === configuredPath || targetPath.startsWith(configuredPath + "/")) {
      return remote.headers;
    }
  }

  return undefined;
}
