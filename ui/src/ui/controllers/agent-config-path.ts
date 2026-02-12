type ConfigValue = Record<string, unknown> | null;
export type ConfigPath = (string | number)[];
type ApplyValue = (path: ConfigPath, value: unknown) => void;
type RemoveValue = (path: ConfigPath) => void;

export function resolveAgentConfigPath(
  configValue: ConfigValue,
  agentId: string,
  scope: "tools" | "subagents.tools",
): ConfigPath | null {
  const list = (configValue as { agents?: { list?: unknown[] } } | null)?.agents?.list;
  if (!Array.isArray(list)) {
    return null;
  }
  const index = list.findIndex(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "id" in entry &&
      (entry as { id?: string }).id === agentId,
  );
  if (index < 0) {
    return null;
  }
  return scope === "tools"
    ? ["agents", "list", index, "tools"]
    : ["agents", "list", index, "subagents", "tools"];
}

export function updateOrRemoveConfigValue(
  path: ConfigPath,
  value: unknown,
  shouldSet: boolean,
  update: (path: ConfigPath, value: unknown) => void,
  remove: (path: ConfigPath) => void,
) {
  if (shouldSet) {
    update(path, value);
    return;
  }
  remove(path);
}

export function applyAgentToolsProfileChange(params: {
  configValue: ConfigValue;
  agentId: string;
  profile: string | null;
  clearAllow: boolean;
  update: ApplyValue;
  remove: RemoveValue;
}) {
  const basePath = resolveAgentConfigPath(params.configValue, params.agentId, "tools");
  if (!basePath) {
    return;
  }
  updateOrRemoveConfigValue(
    [...basePath, "profile"],
    params.profile,
    Boolean(params.profile),
    params.update,
    params.remove,
  );
  if (params.clearAllow) {
    params.remove([...basePath, "allow"]);
  }
}

export function applyAgentToolsOverridesChange(params: {
  configValue: ConfigValue;
  agentId: string;
  alsoAllow: string[];
  deny: string[];
  update: ApplyValue;
  remove: RemoveValue;
}) {
  const basePath = resolveAgentConfigPath(params.configValue, params.agentId, "tools");
  if (!basePath) {
    return;
  }
  updateOrRemoveConfigValue(
    [...basePath, "alsoAllow"],
    params.alsoAllow,
    params.alsoAllow.length > 0,
    params.update,
    params.remove,
  );
  updateOrRemoveConfigValue(
    [...basePath, "deny"],
    params.deny,
    params.deny.length > 0,
    params.update,
    params.remove,
  );
}

export function applySubagentToolsPolicyChange(params: {
  configValue: ConfigValue;
  agentId: string;
  policy: { allow?: string[]; deny?: string[] } | null;
  update: ApplyValue;
  remove: RemoveValue;
}) {
  const basePath = resolveAgentConfigPath(params.configValue, params.agentId, "subagents.tools");
  if (!basePath) {
    return;
  }
  if (!params.policy) {
    params.remove(basePath);
    return;
  }
  updateOrRemoveConfigValue(
    [...basePath, "allow"],
    params.policy.allow,
    Array.isArray(params.policy.allow) && params.policy.allow.length > 0,
    params.update,
    params.remove,
  );
  updateOrRemoveConfigValue(
    [...basePath, "deny"],
    params.policy.deny,
    Array.isArray(params.policy.deny) && params.policy.deny.length > 0,
    params.update,
    params.remove,
  );
}
