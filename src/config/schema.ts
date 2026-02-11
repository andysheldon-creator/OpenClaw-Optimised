import { CHANNEL_IDS } from "../channels/registry.js";
import { VERSION } from "../version.js";
import { applySensitiveHints, buildBaseHints } from "./schema.hints.js";
import { LIMITS_FIELD_LABELS, LIMITS_FIELD_HELP } from "./schema.rate-limits.js";
import {
  ConfigSchema,
  ConfigSchemaResponse,
  ConfigUiHints,
  ChannelUiMetadata,
  PluginUiMetadata,
  JsonSchemaNode,
} from "./schema.types.js";
import { OpenClawSchema } from "./zod-schema.js";

type JsonSchemaObject = JsonSchemaNode & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: JsonSchemaObject | boolean;
};

function cloneSchema<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSchemaObject(value: unknown): JsonSchemaObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonSchemaObject;
}

function isObjectSchema(schema: JsonSchemaObject): boolean {
  const type = schema.type;
  if (type === "object") {
    return true;
  }
  if (Array.isArray(type) && type.includes("object")) {
    return true;
  }
  return Boolean(schema.properties || schema.additionalProperties);
}

function mergeObjectSchema(base: JsonSchemaObject, extension: JsonSchemaObject): JsonSchemaObject {
  const mergedRequired = new Set<string>([...(base.required ?? []), ...(extension.required ?? [])]);

  const merged: JsonSchemaObject = {
    ...base,
    ...extension,
    properties: {
      ...base.properties,
      ...extension.properties,
    },
  };

  if (mergedRequired.size > 0) {
    merged.required = Array.from(mergedRequired);
  }

  const additional = extension.additionalProperties ?? base.additionalProperties;
  if (additional !== undefined) {
    merged.additionalProperties = additional;
  }

  return merged;
}

function applyPluginHints(hints: ConfigUiHints, plugins: PluginUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };

  for (const plugin of plugins) {
    const id = plugin.id.trim();
    if (!id) {
      continue;
    }

    const name = (plugin.name ?? id).trim() || id;
    const basePath = `plugins.entries.${id}`;

    next[basePath] = {
      ...next[basePath],
      label: name,
      help: plugin.description
        ? `${plugin.description} (plugin: ${id})`
        : `Plugin entry for ${id}.`,
    };

    next[`${basePath}.enabled`] = {
      ...next[`${basePath}.enabled`],
      label: `Enable ${name}`,
    };

    next[`${basePath}.config`] = {
      ...next[`${basePath}.config`],
      label: `${name} Config`,
      help: `Plugin-defined config payload for ${id}.`,
    };

    for (const [relPathRaw, hint] of Object.entries(plugin.configUiHints ?? {})) {
      const relPath = relPathRaw.trim().replace(/^\./, "");
      if (!relPath) {
        continue;
      }

      next[`${basePath}.config.${relPath}`] = {
        ...next[`${basePath}.config.${relPath}`],
        ...hint,
      };
    }
  }

  return next;
}

function applyChannelHints(hints: ConfigUiHints, channels: ChannelUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };

  for (const channel of channels) {
    const id = channel.id.trim();
    if (!id) {
      continue;
    }

    const basePath = `channels.${id}`;
    const current = next[basePath] ?? {};

    next[basePath] = {
      ...current,
      ...(channel.label ? { label: channel.label.trim() } : {}),
      ...(channel.description ? { help: channel.description.trim() } : {}),
    };

    for (const [relPathRaw, hint] of Object.entries(channel.configUiHints ?? {})) {
      const relPath = relPathRaw.trim().replace(/^\./, "");
      if (!relPath) {
        continue;
      }

      next[`${basePath}.${relPath}`] = {
        ...next[`${basePath}.${relPath}`],
        ...hint,
      };
    }
  }

  return next;
}

function listHeartbeatTargetChannels(channels: ChannelUiMetadata[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of CHANNEL_IDS) {
    const normalized = id.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  for (const channel of channels) {
    const normalized = channel.id.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function applyHeartbeatTargetHints(
  hints: ConfigUiHints,
  channels: ChannelUiMetadata[],
): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  const channelList = listHeartbeatTargetChannels(channels);

  const help =
    `Delivery target ("last", "none", or a channel id).` +
    (channelList.length ? ` Known channels: ${channelList.join(", ")}.` : "");

  for (const path of ["agents.defaults.heartbeat.target", "agents.list.*.heartbeat.target"]) {
    const current = next[path] ?? {};
    next[path] = {
      ...current,
      help: current.help ?? help,
      placeholder: current.placeholder ?? "last",
    };
  }

  return next;
}

function applyPluginSchemas(schema: ConfigSchema, plugins: PluginUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  const entriesNode = asSchemaObject(root?.properties?.plugins?.properties?.entries);

  if (!entriesNode) {
    return next;
  }

  const entryBase = asSchemaObject(entriesNode.additionalProperties);
  entriesNode.properties ??= {};

  for (const plugin of plugins) {
    if (!plugin.configSchema) {
      continue;
    }

    const entrySchema = entryBase
      ? cloneSchema(entryBase)
      : ({ type: "object" } as JsonSchemaObject);

    const entryObject = asSchemaObject(entrySchema)!;
    const baseConfigSchema = asSchemaObject(entryObject.properties?.config);
    const pluginSchema = asSchemaObject(plugin.configSchema);

    entryObject.properties = {
      ...entryObject.properties,
      config:
        baseConfigSchema &&
        pluginSchema &&
        isObjectSchema(baseConfigSchema) &&
        isObjectSchema(pluginSchema)
          ? mergeObjectSchema(baseConfigSchema, pluginSchema)
          : cloneSchema(plugin.configSchema),
    };

    entriesNode.properties[plugin.id] = entryObject;
  }

  return next;
}

function applyChannelSchemas(schema: ConfigSchema, channels: ChannelUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  const channelsNode = asSchemaObject(root?.properties?.channels);

  if (!channelsNode) {
    return next;
  }

  channelsNode.properties ??= {};

  for (const channel of channels) {
    if (!channel.configSchema) {
      continue;
    }

    const existing = asSchemaObject(channelsNode.properties[channel.id]);
    const incoming = asSchemaObject(channel.configSchema);

    channelsNode.properties[channel.id] =
      existing && incoming && isObjectSchema(existing) && isObjectSchema(incoming)
        ? mergeObjectSchema(existing, incoming)
        : cloneSchema(channel.configSchema);
  }

  return next;
}

let cachedBase: ConfigSchemaResponse | null = null;

function stripChannelSchema(schema: ConfigSchema): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asSchemaObject(next);
  const channelsNode = asSchemaObject(root?.properties?.channels);

  if (channelsNode) {
    channelsNode.properties = {};
    channelsNode.required = [];
    channelsNode.additionalProperties = true;
  }

  return next;
}

function buildBaseConfigSchema(): ConfigSchemaResponse {
  if (cachedBase) {
    return cachedBase;
  }

  const schema = OpenClawSchema.toJSONSchema({
    target: "draft-07",
    unrepresentable: "any",
  });

  schema.title = "OpenClawConfig";

  const hints = applySensitiveHints(buildBaseHints());

  // merge rate-limit UI metadata
  Object.assign(hints, LIMITS_FIELD_LABELS, LIMITS_FIELD_HELP);

  cachedBase = {
    schema: stripChannelSchema(schema),
    uiHints: hints,
    version: VERSION,
    generatedAt: new Date().toISOString(),
  };

  return cachedBase;
}

export function buildConfigSchema(params?: {
  plugins?: PluginUiMetadata[];
  channels?: ChannelUiMetadata[];
}): ConfigSchemaResponse {
  const base = buildBaseConfigSchema();
  const plugins = params?.plugins ?? [];
  const channels = params?.channels ?? [];

  if (!plugins.length && !channels.length) {
    return base;
  }

  return {
    ...base,
    uiHints: applySensitiveHints(
      applyHeartbeatTargetHints(
        applyChannelHints(applyPluginHints(base.uiHints, plugins), channels),
        channels,
      ),
    ),
    schema: applyChannelSchemas(applyPluginSchemas(base.schema, plugins), channels),
  };
}

export const OPENCLAW_CONFIG_SCHEMA_RESPONSE: ConfigSchemaResponse = {
  schema: OpenClawSchema.toJSONSchema({ target: "draft-07", unrepresentable: "any" }),
  uiHints: applySensitiveHints(buildBaseHints()),
  version: VERSION,
  generatedAt: new Date().toISOString(),
};
