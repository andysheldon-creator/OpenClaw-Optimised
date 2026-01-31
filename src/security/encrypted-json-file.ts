import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { CredentialVault } from "./credential-vault.js";
import { createKeyProvider } from "./key-management.js";

let _vault: CredentialVault | null = null;

async function getVault(): Promise<CredentialVault | null> {
  if (_vault) return _vault;

  try {
    const keyProvider = await createKeyProvider();
    _vault = new CredentialVault(keyProvider);
    return _vault;
  } catch {
    // If encryption setup fails, continue without encryption
    return null;
  }
}

/**
 * Load a JSON file, automatically decrypting if it's encrypted
 */
export async function loadEncryptedJsonFile(pathname: string): Promise<unknown> {
  const data = loadJsonFile(pathname);
  if (!data) return data;

  try {
    const vault = await getVault();
    if (vault && (await vault.isEncrypted(data))) {
      return await vault.decrypt(data as any);
    }
    return data;
  } catch {
    // If decryption fails, return raw data (fallback)
    return data;
  }
}

/**
 * Save data to a JSON file, automatically encrypting if encryption is enabled
 */
export async function saveEncryptedJsonFile(pathname: string, data: unknown): Promise<void> {
  try {
    const vault = await getVault();
    if (vault) {
      const encrypted = await vault.encrypt(data);
      saveJsonFile(pathname, encrypted);
      return;
    }
  } catch {
    // Fall back to plaintext if encryption fails
  }

  saveJsonFile(pathname, data);
}

/**
 * Check if a file contains encrypted data
 */
export async function isFileEncrypted(pathname: string): Promise<boolean> {
  try {
    const data = loadJsonFile(pathname);
    const vault = await getVault();
    return data && vault && (await vault.isEncrypted(data));
  } catch {
    return false;
  }
}

/**
 * Enable or disable encryption by setting the vault instance
 * Mainly used for testing or manual configuration
 */
export function setEncryptionVault(vault: CredentialVault | null): void {
  _vault = vault;
}

/**
 * Check if encryption is currently enabled
 */
export function isEncryptionEnabled(): boolean {
  return _vault !== null;
}
