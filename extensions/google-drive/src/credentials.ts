import type { OpenClawConfig } from "openclaw/plugin-sdk";
import path from "node:path";
import { createOAuth2ClientFromCredentials } from "./auth.js";
// Dynamic imports for auth-profiles (not in plugin SDK). Paths are relative to repo root (three levels up from src/).
let resolveApiKeyForProfile: typeof import("../../../src/agents/auth-profiles/oauth.js").resolveApiKeyForProfile;
let ensureAuthProfileStore: typeof import("../../../src/agents/auth-profiles/store.js").ensureAuthProfileStore;
let saveAuthProfileStore: typeof import("../../../src/agents/auth-profiles/store.js").saveAuthProfileStore;
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;

/** When gateway doesn't pass agentDir (e.g. /tools/invoke), use state dir + default agent so we find credentials. */
function resolveEffectiveAgentDir(agentDir?: string): string | undefined {
  if (agentDir?.trim()) {
    return agentDir.trim();
  }
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateDir) {
    return path.join(stateDir, "agents", "main", "agent");
  }
  return undefined;
}

// Load auth-profiles modules with src/dist fallback
async function loadAuthProfileModules() {
  if (resolveApiKeyForProfile && ensureAuthProfileStore) {
    return;
  }
  // Try dist first (production/Docker); then src (dev/test)
  try {
    const oauthMod = await import("../../../dist/agents/auth-profiles/oauth.js");
    const storeMod = await import("../../../dist/agents/auth-profiles/store.js");
    resolveApiKeyForProfile = oauthMod.resolveApiKeyForProfile;
    ensureAuthProfileStore = storeMod.ensureAuthProfileStore;
    saveAuthProfileStore = storeMod.saveAuthProfileStore;
    return;
  } catch {
    const oauthMod = await import("../../../src/agents/auth-profiles/oauth.js");
    const storeMod = await import("../../../src/agents/auth-profiles/store.js");
    resolveApiKeyForProfile = oauthMod.resolveApiKeyForProfile;
    ensureAuthProfileStore = storeMod.ensureAuthProfileStore;
    saveAuthProfileStore = storeMod.saveAuthProfileStore;
  }
}

const PROVIDER_ID = "google-drive";

export async function resolveGoogleDriveCredentials(params: {
  config?: OpenClawConfig;
  agentDir?: string;
  profileId?: string;
}): Promise<OAuthCredentials | null> {
  await loadAuthProfileModules();
  const effectiveAgentDir = resolveEffectiveAgentDir(params.agentDir);

  const store = ensureAuthProfileStore(effectiveAgentDir);

  const candidateIds = params.profileId
    ? [params.profileId]
    : [
        `google-drive:default`,
        ...listGoogleDriveProfileIdsSync(store).filter((id) => id !== "google-drive:default"),
      ];

  for (const profileId of candidateIds) {
    const cred = store.profiles[profileId];
    const resolved = await resolveApiKeyForProfile({
      cfg: params.config,
      store,
      profileId,
      agentDir: effectiveAgentDir,
    });
    const credMatch = !!(cred?.type === "oauth" && cred.provider === PROVIDER_ID);
    if (!resolved && cred?.type === "oauth") {
      const now = Date.now();
      const expires = typeof cred.expires === "number" ? cred.expires : 0;
      const tokenExpired = expires > 0 && now >= expires;
      // Core only refreshes providers from pi-ai (e.g. "google"); "google-drive" is not included, so refresh in extension.
      if (
        credMatch &&
        tokenExpired &&
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ) {
        try {
          const client = createOAuth2ClientFromCredentials(cred);
          const { credentials: newCreds } = await client.refreshAccessToken();
          const newAccess = newCreds.access_token ?? cred.access;
          const newExpires = typeof newCreds.expiry_date === "number" ? newCreds.expiry_date : 0;
          const updated = { ...cred, access: newAccess, expires: newExpires };
          store.profiles[profileId] = updated;
          saveAuthProfileStore(store, effectiveAgentDir);
          return updated;
        } catch {
          // Refresh failed (e.g. revoked token); caller will get no credential.
        }
      }
    }
    if (!resolved) {
      continue;
    }
    if (credMatch) {
      return cred;
    }
  }
  return null;
}

function listGoogleDriveProfileIdsSync(store: ReturnType<typeof ensureAuthProfileStore>): string[] {
  return Object.keys(store.profiles).filter(
    (profileId) => store.profiles[profileId]?.provider === PROVIDER_ID,
  );
}

export async function listGoogleDriveProfileIds(agentDir?: string): Promise<string[]> {
  await loadAuthProfileModules();
  const store = ensureAuthProfileStore(agentDir);
  return Object.keys(store.profiles).filter(
    (profileId) => store.profiles[profileId]?.provider === PROVIDER_ID,
  );
}
