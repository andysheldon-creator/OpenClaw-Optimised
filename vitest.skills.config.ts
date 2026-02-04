import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["skills/**/*.test.ts", "skills/**/*.test.js"],
    environment: "node",
  },
});
