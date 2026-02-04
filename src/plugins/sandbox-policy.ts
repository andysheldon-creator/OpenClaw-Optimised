/**
 * Sandbox policy for plugin security.
 * Restricts access to dangerous APIs for untrusted plugins.
 */

import type { PluginRuntime } from "./runtime/types.js";
import type { PluginLogger } from "./types.js";

export type PluginPermissions = {
  runCommandWithTimeout?: boolean;
  writeConfigFile?: boolean;
};

export type SandboxPolicy = {
  pluginId: string;
  permissions: {
    runCommandWithTimeout: boolean;
    writeConfigFile: boolean;
  };
};

export type RestrictedApiName = "runCommandWithTimeout" | "writeConfigFile";

/**
 * Create a sandbox policy for a plugin.
 * Logs a warning for each restricted API that is not explicitly permitted.
 */
export function createSandboxPolicy(
  pluginId: string,
  permissions: PluginPermissions | undefined,
  logger: PluginLogger,
): SandboxPolicy {
  const resolved = {
    runCommandWithTimeout: permissions?.runCommandWithTimeout ?? false,
    writeConfigFile: permissions?.writeConfigFile ?? false,
  };

  const restricted: string[] = [];
  if (!resolved.runCommandWithTimeout) {
    restricted.push("system.runCommandWithTimeout");
  }
  if (!resolved.writeConfigFile) {
    restricted.push("config.writeConfigFile");
  }

  if (restricted.length > 0) {
    logger.warn(`plugin has restricted access to: ${restricted.join(", ")}`);
  }

  return {
    pluginId,
    permissions: resolved,
  };
}

/**
 * Wrap a function to block access if the permission is not granted.
 * Throws an error if the plugin tries to use a restricted API without permission.
 */
export function wrapRestrictedApi<T extends (...args: unknown[]) => unknown>(
  fn: T,
  policy: SandboxPolicy,
  apiName: RestrictedApiName,
  logger: PluginLogger,
): T {
  const hasPermission = policy.permissions[apiName as keyof typeof policy.permissions] ?? false;

  if (hasPermission) {
    return fn;
  }

  return ((...args: unknown[]) => {
    logger.error(`blocked call to ${apiName} - plugin does not have permission`);
    throw new Error(
      `Access denied: ${apiName} requires permissions.${apiName}:true in plugin config for "${policy.pluginId}"`,
    );
  }) as T;
}

/**
 * Create a sandboxed version of the plugin runtime.
 * Wraps dangerous APIs (runCommandWithTimeout, writeConfigFile) with permission checks.
 * Each API is individually gated by its corresponding permission.
 */
export function createSandboxedRuntime(
  runtime: PluginRuntime,
  policy: SandboxPolicy,
  logger: PluginLogger,
): PluginRuntime {
  const allPermitted =
    policy.permissions.runCommandWithTimeout && policy.permissions.writeConfigFile;

  // If all permissions granted, return original runtime
  if (allPermitted) {
    return runtime;
  }

  // Create wrapped versions of dangerous APIs (only wrap those without permission)
  const wrappedRunCommandWithTimeout = policy.permissions.runCommandWithTimeout
    ? runtime.system.runCommandWithTimeout
    : wrapRestrictedApi(
        runtime.system.runCommandWithTimeout,
        policy,
        "runCommandWithTimeout",
        logger,
      );

  const wrappedWriteConfigFile = policy.permissions.writeConfigFile
    ? runtime.config.writeConfigFile
    : wrapRestrictedApi(runtime.config.writeConfigFile, policy, "writeConfigFile", logger);

  // Return a new runtime with sandboxed APIs
  return {
    ...runtime,
    system: {
      ...runtime.system,
      runCommandWithTimeout: wrappedRunCommandWithTimeout,
    },
    config: {
      ...runtime.config,
      writeConfigFile: wrappedWriteConfigFile,
    },
  };
}
