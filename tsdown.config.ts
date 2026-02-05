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
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  // Bundled hook handlers – these were missed when migrating from tsc to tsdown
  // in 2026.2.2, causing `openclaw hooks list` to show 0 hooks on npm installs.
  {
    entry: {
      "hooks/bundled/session-memory/handler": "src/hooks/bundled/session-memory/handler.ts",
      "hooks/bundled/command-logger/handler": "src/hooks/bundled/command-logger/handler.ts",
      "hooks/bundled/boot-md/handler": "src/hooks/bundled/boot-md/handler.ts",
      "hooks/bundled/soul-evil/handler": "src/hooks/bundled/soul-evil/handler.ts",
      "hooks/llm-slug-generator": "src/hooks/llm-slug-generator.ts",
    },
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
