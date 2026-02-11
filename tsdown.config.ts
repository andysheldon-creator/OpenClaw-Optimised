import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

// Workaround for circular dependency issues with rolldown code splitting.
// Force specific modules to be bundled together to avoid __exportAll circular refs.
const manualChunks = (id: string) => {
  // Bundle pi-model-discovery and related modules into entry chunk
  if (id.includes("pi-model-discovery") || id.includes("pi-embedded-runner")) {
    return "entry";
  }
  // Keep config-related modules together
  if (id.includes("/config/") || id.includes("/agents/context")) {
    return "config";
  }
  return null;
};

// Native modules that should not be bundled (they use __filename/__dirname)
const external = ["better-sqlite3", "bindings", "node-llama-cpp", "@napi-rs/canvas"];

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external,
    outputOptions: {
      manualChunks,
    },
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external,
    outputOptions: {
      manualChunks,
    },
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
    external,
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external,
    outputOptions: {
      manualChunks,
    },
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
