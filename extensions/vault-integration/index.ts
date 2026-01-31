import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { createVaultIntegrationService } from "./src/service.js";

export { createVaultIntegrationService };
export { VaultClient, VaultError, createVaultClientFromEnv } from "./src/vault-client.js";
export type { VaultConfig, VaultSecretMetadata, VaultReadResponse } from "./src/vault-client.js";

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      description: "Enable Vault integration",
      default: true,
    },
    addr: {
      type: "string",
      description: "Vault server address (e.g., http://localhost:8200)",
      default: "http://localhost:8200",
    },
    token: {
      type: "string",
      description: "Vault authentication token",
    },
    namespace: {
      type: "string",
      description: "Optional Vault namespace for multi-tenancy",
    },
  },
} as const;

const plugin = {
  id: "vault-integration",
  name: "Vault Integration",
  description: "Store OpenClaw credentials in HashiCorp Vault for centralized secret management",
  configSchema,
  register(api: OpenClawPluginApi) {
    api.registerService(createVaultIntegrationService());
  },
};

export default plugin;
