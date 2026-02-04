import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    dts: true,
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  // Memory modules - dynamically imported by search-manager.ts
  {
    entry: "src/memory/manager.ts",
    outDir: "dist/memory",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/memory/qmd-manager.ts",
    outDir: "dist/memory",
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
