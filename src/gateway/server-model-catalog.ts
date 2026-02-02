import type { AuthProfileStore } from "../agents/auth-profiles/types.js";
import { listProfilesForProvider } from "../agents/auth-profiles.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import {
  getCustomProviderApiKey,
  resolveAwsSdkEnvVarName,
  resolveEnvApiKey,
} from "../agents/model-auth.js";
import {
  loadModelCatalog,
  type ModelCatalogEntry,
  resetModelCatalogCacheForTest,
} from "../agents/model-catalog.js";
import { type OpenClawConfig, loadConfig } from "../config/config.js";

export type GatewayModelChoice = ModelCatalogEntry;

// Test-only escape hatch: model catalog is cached at module scope for the
// process lifetime, which is fine for the real gateway daemon, but makes
// isolated unit tests harder. Keep this intentionally obscure.
export function __resetModelCatalogCacheForTest() {
  resetModelCatalogCacheForTest();
}

function hasAuthForProvider(
  provider: string,
  cfg: OpenClawConfig,
  authStore: AuthProfileStore,
): boolean {
  if (listProfilesForProvider(authStore, provider).length > 0) {
    return true;
  }
  if (provider === "amazon-bedrock" && resolveAwsSdkEnvVarName()) {
    return true;
  }
  if (resolveEnvApiKey(provider)) {
    return true;
  }
  if (getCustomProviderApiKey(cfg, provider)) {
    return true;
  }
  return false;
}

export async function loadGatewayModelCatalog(): Promise<GatewayModelChoice[]> {
  const cfg = loadConfig();
  const entries: ModelCatalogEntry[] = await loadModelCatalog({ config: cfg });

  // Resolve auth store for provider availability checks
  let authStore: AuthProfileStore | null = null;
  try {
    authStore = ensureAuthProfileStore();
  } catch {
    // If we can't load the auth store, all providers will show as unavailable
  }

  // Check provider auth once per provider (cached per batch)
  const providerAuthCache = new Map<string, boolean>();
  const resolveAuth = (provider: string): boolean => {
    const cached = providerAuthCache.get(provider);
    if (cached !== undefined) {
      return cached;
    }
    if (!authStore) {
      providerAuthCache.set(provider, false);
      return false;
    }
    const available = hasAuthForProvider(provider, cfg, authStore);
    providerAuthCache.set(provider, available);
    return available;
  };

  return entries.map((entry) => ({
    ...entry,
    providerAvailable: resolveAuth(entry.provider),
  }));
}
