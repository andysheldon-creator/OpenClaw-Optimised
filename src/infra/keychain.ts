/**
 * Keychain Integration
 *
 * Provides basic read access to the system's secure credential store
 * (macOS Keychain or Windows Credential Manager) via system CLI tools.
 */

import { execSync } from "node:child_process";
import * as os from "node:os";

/**
 * Get a secret from the system keychain.
 * @param service The service name (account) to look up.
 * @returns The secret string, or null if not found.
 */
export function getSecretFromKeychain(service: string): string | null {
  const platform = os.platform();

  try {
    if (platform === "darwin") {
      // macOS: security find-generic-password -s <service> -w
      const cmd = `security find-generic-password -s ${escapeShellArg(service)} -w`;
      return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } else if (platform === "win32") {
      // Windows: powershell to get credential
      // Note: This is a bit more involved, using a common powershell pattern
      const cmd = `powershell -NoProfile -Command "(Get-Credential -UserName ${escapeShellArg(service)} -Message 'OpenClaw').GetNetworkCredential().Password"`;
      return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
  } catch {
    // If not found or error, return null
    return null;
  }

  return null;
}

/**
 * Simple shell argument escaping.
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Check if a string is a keychain reference.
 */
export function isKeychainReference(value: string | undefined): boolean {
  return Boolean(value?.startsWith("@keychain:"));
}

/**
 * Resolve a potential keychain reference.
 */
export function resolveSecret(value: string | undefined): string | undefined {
  if (!value || !isKeychainReference(value)) {
    return value;
  }

  const service = value.substring("@keychain:".length);
  return getSecretFromKeychain(service) || value; // Fallback to reference if not found
}
