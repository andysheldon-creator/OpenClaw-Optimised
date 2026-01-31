/**
 * HashiCorp Vault HTTP API Client
 * Supports KV v2 secrets engine
 */

export type VaultConfig = {
  /** Vault server address (e.g., http://localhost:8200) */
  addr: string;
  /** Authentication token */
  token: string;
  /** Optional namespace for multi-tenancy */
  namespace?: string;
};

export type VaultSecretMetadata = {
  created_time: string;
  deletion_time: string;
  destroyed: boolean;
  version: number;
};

export type VaultReadResponse<T = Record<string, unknown>> = {
  data: T;
  metadata: VaultSecretMetadata;
};

export class VaultError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export class VaultClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private config: VaultConfig) {
    this.baseUrl = `${config.addr}/v1`;
    this.headers = {
      "X-Vault-Token": config.token,
      ...(config.namespace ? { "X-Vault-Namespace": config.namespace } : {}),
    };
  }

  /**
   * Read secret from KV v2 engine
   *
   * @param path - Secret path (e.g., "openclaw/data/credentials/anthropic")
   * @returns Secret data or null if not found
   *
   * @example
   * ```ts
   * const secret = await vault.read<{ access_token: string }>(
   *   "openclaw/data/credentials/anthropic"
   * );
   * console.log(secret?.access_token);
   * ```
   */
  async read<T = Record<string, unknown>>(path: string): Promise<VaultReadResponse<T> | null> {
    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new VaultError(`Failed to read secret: ${path}`, response.status, text);
      }

      const json = await response.json();

      // KV v2 format: { data: { data: {...}, metadata: {...} } }
      return {
        data: json.data?.data as T,
        metadata: json.data?.metadata,
      };
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Network error reading secret: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Write secret to KV v2 engine
   *
   * @param path - Secret path (e.g., "openclaw/data/credentials/telegram")
   * @param data - Secret data to store
   *
   * @example
   * ```ts
   * await vault.write("openclaw/data/credentials/telegram", {
   *   bot_token: "123456:ABC-DEF...",
   *   chat_id: "12345678"
   * });
   * ```
   */
  async write(path: string, data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new VaultError(`Failed to write secret: ${path}`, response.status, text);
      }
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Network error writing secret: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List secrets at path
   *
   * @param path - Metadata path (e.g., "openclaw/metadata/credentials")
   * @returns Array of secret names
   *
   * @example
   * ```ts
   * const secrets = await vault.list("openclaw/metadata/credentials");
   * console.log(secrets); // ["anthropic", "telegram", "discord"]
   * ```
   */
  async list(path: string): Promise<string[]> {
    const url = `${this.baseUrl}/${path}?list=true`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        const text = await response.text();
        throw new VaultError(`Failed to list secrets: ${path}`, response.status, text);
      }

      const json = await response.json();
      return json.data?.keys || [];
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Network error listing secrets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete secret (soft delete - can be recovered)
   *
   * @param path - Secret path
   *
   * @example
   * ```ts
   * await vault.delete("openclaw/data/credentials/old-bot");
   * ```
   */
  async delete(path: string): Promise<void> {
    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: this.headers,
      });

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new VaultError(`Failed to delete secret: ${path}`, response.status, text);
      }
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Network error deleting secret: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if Vault is healthy and accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.addr}/v1/sys/health`, {
        method: "GET",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get Vault seal status
   */
  async getSealStatus(): Promise<{ sealed: boolean; initialized: boolean }> {
    try {
      const response = await fetch(`${this.config.addr}/v1/sys/seal-status`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new VaultError("Failed to get seal status", response.status);
      }

      const json = await response.json();
      return {
        sealed: json.sealed === true,
        initialized: json.initialized === true,
      };
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      throw new VaultError(
        `Network error checking seal status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Create VaultClient from environment variables
 *
 * Required env vars:
 * - VAULT_ADDR (or defaults to http://localhost:8200)
 * - VAULT_TOKEN
 *
 * Optional:
 * - VAULT_NAMESPACE
 */
export function createVaultClientFromEnv(): VaultClient | null {
  const addr = process.env.VAULT_ADDR || "http://localhost:8200";
  const token = process.env.VAULT_TOKEN;

  if (!token) {
    return null;
  }

  return new VaultClient({
    addr,
    token,
    namespace: process.env.VAULT_NAMESPACE,
  });
}
