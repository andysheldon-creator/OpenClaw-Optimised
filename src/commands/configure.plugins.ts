import { buildPluginStatusReport } from "../plugins/status.js";
import { writeConfigFile } from "../config/config.js";
import { applyExclusiveSlotSelection } from "../plugins/slots.js";
import type { MoltbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { guardCancel } from "./onboard-helpers.js";
import type { PluginRecord } from "../plugins/registry.js";
import { getPackageManifestMetadata } from "../plugins/manifest.js";

function getNestedValue(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function getSchemaDefault(schema: any, path: string): any {
  if (!schema || !schema.properties) return undefined;
  const keys = path.split(".");
  let current = schema;
  for (const key of keys) {
    if (!current.properties || !current.properties[key]) return undefined;
    current = current.properties[key];
  }
  return current.default;
}

async function promptPluginEntryConfig(
  plugin: PluginRecord,
  currentConfig: MoltbotConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MoltbotConfig> {
  const pluginId = plugin.id;
  const entry = currentConfig.plugins?.entries?.[pluginId] ?? {};
  const isEnabled = entry.enabled ?? false;

  const report = buildPluginStatusReport({ config: currentConfig });

  let toggleEnabled = await prompter.confirm({
    message: `Enable plugin "${plugin.name || pluginId}"?`,
    initialValue: isEnabled,
  });

  let nextConfig = { ...currentConfig };
  let nextEntry = { ...entry, enabled: toggleEnabled };

  if (toggleEnabled && plugin.kind) {
    const slotResult = applyExclusiveSlotSelection({
      config: currentConfig,
      selectedId: pluginId,
      selectedKind: plugin.kind,
      registry: report,
    });
    if (slotResult.changed) {
      nextConfig = slotResult.config;
      nextEntry = (nextConfig.plugins?.entries?.[pluginId] as any) ?? nextEntry;
      if (slotResult.warnings.length > 0) {
        for (const w of slotResult.warnings) {
          await prompter.note(w, "Slot Selection");
        }
      }
    }
  }

  if (toggleEnabled && plugin.configUiHints) {
    const pluginConfig = (entry.config ?? {}) as Record<string, unknown>;
    const nextPluginConfig = { ...pluginConfig };

    for (const [key, hint] of Object.entries(plugin.configUiHints)) {
      const message = hint.label || key;
      const currentVal = getNestedValue(pluginConfig, key);
      const defaultVal = getSchemaDefault(plugin.configJsonSchema, key);
      const initialValue = String(currentVal ?? defaultVal ?? hint.placeholder ?? "");

      if (hint.sensitive) {
        const input = guardCancel(
          await prompter.text({
            message: `${message}${hint.help ? ` (${hint.help})` : ""}`,
            placeholder: hint.placeholder,
            // Don't show current value for sensitive fields if it looks like a secret
            initialValue: initialValue && !initialValue.includes("***") ? "" : initialValue,
          }),
          runtime,
        );
        if (input !== undefined) {
          nextPluginConfig[key] = String(input).trim();
        }
      } else {
        const input = guardCancel(
          await prompter.text({
            message: `${message}${hint.help ? ` (${hint.help})` : ""}`,
            initialValue: initialValue,
            placeholder: hint.placeholder,
          }),
          runtime,
        );
        if (input !== undefined) {
          const val = String(input).trim();
          let finalVal: any = val;
          // Simple type conversion for booleans/numbers if they look like it
          if (val.toLowerCase() === "true") finalVal = true;
          else if (val.toLowerCase() === "false") finalVal = false;
          else if (/^\d+$/.test(val)) finalVal = Number.parseInt(val, 10);

          setNestedValue(nextPluginConfig, key, finalVal);
        }
      }
    }
    nextEntry.config = nextPluginConfig;
  }

  return {
    ...nextConfig,
    plugins: {
      ...nextConfig.plugins,
      entries: {
        ...nextConfig.plugins?.entries,
        [pluginId]: nextEntry,
      },
    },
  };
}

export async function promptPluginsConfig(
  cfg: MoltbotConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MoltbotConfig> {
  const report = buildPluginStatusReport({ config: cfg });
  const plugins = report.plugins;

  if (plugins.length === 0) {
    await prompter.note("No plugins found.", "Plugins");
    return cfg;
  }

  let nextConfig = { ...cfg };

  while (true) {
    const options = plugins.map((p) => {
      const isEnabled = nextConfig.plugins?.entries?.[p.id]?.enabled ?? p.enabled;
      const status = isEnabled ? "✅ enabled" : "❌ disabled";
      return {
        value: p.id,
        label: `${p.name || p.id}`,
        hint: `${status} — ${p.description || ""}`,
      };
    });

    const choice = guardCancel(
      await prompter.select({
        message: "Select a plugin to configure",
        options: [
          ...options,
          { value: "__done__", label: "Done", hint: "Finish plugin configuration" },
        ],
      }),
      runtime,
    );

    if (choice === "__done__" || choice === undefined) {
      break;
    }

    const target = plugins.find((p) => p.id === choice);
    if (target) {
      nextConfig = await promptPluginEntryConfig(target, nextConfig, runtime, prompter);
      await writeConfigFile(nextConfig);
    }
  }

  return nextConfig;
}
