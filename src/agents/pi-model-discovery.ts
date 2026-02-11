import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import type { AuthProfileCredential, AuthProfileStore } from "./auth-profiles/types.js";
import { resolveAuthProfileOrder } from "./auth-profiles/order.js";
import { ensureAuthProfileStore } from "./auth-profiles/store.js";

export { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

/**
 * Convert auth-profiles store into the flat SDK format (auth.json) that
 * `AuthStorage` reads. This bridges the newer auth-profiles.json (which
 * survives migration) with the legacy auth.json the SDK expects.
 *
 * For each provider, the best profile is selected using
 * `resolveAuthProfileOrder` which respects `store.order`, cooldown state,
 * and type preference (oauth > token > api_key).
 */
function syncAuthJsonFromProfiles(agentDir: string): void {
  const store: AuthProfileStore = ensureAuthProfileStore(agentDir);
  const flat: Record<string, unknown> = {};

  // Collect unique providers from all profiles.
  const providers = new Set<string>();
  for (const profile of Object.values(store.profiles)) {
    if (profile.provider) {
      providers.add(profile.provider);
    }
  }

  for (const provider of providers) {
    const orderedIds = resolveAuthProfileOrder({ store, provider });
    if (orderedIds.length === 0) {
      continue;
    }

    const bestProfile = store.profiles[orderedIds[0]];
    if (!bestProfile) {
      continue;
    }

    const converted = convertProfileToSdkCredential(bestProfile);
    if (converted) {
      flat[provider] = converted;
    }
  }

  if (Object.keys(flat).length === 0) {
    return;
  }

  const authJsonPath = path.join(agentDir, "auth.json");
  fs.writeFileSync(authJsonPath, JSON.stringify(flat, null, 2), "utf-8");
  fs.chmodSync(authJsonPath, 0o600);
}

function convertProfileToSdkCredential(
  profile: AuthProfileCredential,
): Record<string, unknown> | null {
  switch (profile.type) {
    case "api_key": {
      if (!profile.key) {
        return null;
      }
      return { type: "api_key", key: profile.key };
    }
    case "token": {
      if (!profile.token) {
        return null;
      }
      // SDK has no "token" type; map to api_key
      return { type: "api_key", key: profile.token };
    }
    case "oauth": {
      if (!profile.access && !profile.refresh) {
        return null;
      }
      const cred: Record<string, unknown> = {
        type: "oauth",
        access: profile.access,
        refresh: profile.refresh,
        expires: profile.expires,
      };
      if (profile.enterpriseUrl) {
        cred.enterpriseUrl = profile.enterpriseUrl;
      }
      if (profile.projectId) {
        cred.projectId = profile.projectId;
      }
      if (profile.accountId) {
        cred.accountId = profile.accountId;
      }
      return cred;
    }
    default:
      return null;
  }
}

// Compatibility helpers for pi-coding-agent 0.50+ (discover* helpers removed).
export function discoverAuthStorage(agentDir: string): AuthStorage {
  syncAuthJsonFromProfiles(agentDir);
  return new AuthStorage(path.join(agentDir, "auth.json"));
}

export function discoverModels(authStorage: AuthStorage, agentDir: string): ModelRegistry {
  return new ModelRegistry(authStorage, path.join(agentDir, "models.json"));
}
