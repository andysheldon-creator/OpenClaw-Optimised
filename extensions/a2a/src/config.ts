export type A2ARemoteAgent = {
  url: string;
  headers?: Record<string, string>;
};

export type A2AInboundKey = {
  label: string;
  key: string;
};

export type A2AInboundConfig = {
  allowUnauthenticated?: boolean;
  apiKeys?: A2AInboundKey[];
};

export type A2APluginConfig = {
  enabled?: boolean;
  agentId?: string;
  description?: string;
  remoteAgents?: A2ARemoteAgent[];
  inbound?: A2AInboundConfig;
};

function parseRemoteAgents(value: unknown): A2ARemoteAgent[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: A2ARemoteAgent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!url) {
      continue;
    }
    const headers =
      raw.headers && typeof raw.headers === "object" && !Array.isArray(raw.headers)
        ? (raw.headers as Record<string, string>)
        : undefined;
    result.push({ url, ...(headers ? { headers } : {}) });
  }
  return result.length > 0 ? result : undefined;
}

function parseInbound(value: unknown): A2AInboundConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const allowUnauthenticated =
    typeof raw.allowUnauthenticated === "boolean" ? raw.allowUnauthenticated : undefined;
  let apiKeys: A2AInboundKey[] | undefined;
  if (Array.isArray(raw.apiKeys)) {
    apiKeys = [];
    for (const entry of raw.apiKeys) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === "string" ? e.label.trim() : "";
      const key = typeof e.key === "string" ? e.key : "";
      if (!label || !key) {
        continue;
      }
      apiKeys.push({ label, key });
    }
    if (apiKeys.length === 0) {
      apiKeys = undefined;
    }
  }
  // Only return if at least one field was set
  if (allowUnauthenticated === undefined && apiKeys === undefined) {
    return undefined;
  }
  return {
    ...(allowUnauthenticated !== undefined ? { allowUnauthenticated } : {}),
    ...(apiKeys ? { apiKeys } : {}),
  };
}

export function parseA2APluginConfig(value: unknown): A2APluginConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: true };
  }
  const raw = value as Record<string, unknown>;
  const remoteAgents = parseRemoteAgents(raw.remoteAgents);
  const inbound = parseInbound(raw.inbound);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    agentId: typeof raw.agentId === "string" ? raw.agentId.trim() || undefined : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() || undefined : undefined,
    ...(remoteAgents ? { remoteAgents } : {}),
    ...(inbound ? { inbound } : {}),
  };
}
