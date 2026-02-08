import { afterEach, describe, expect, it } from "vitest";
import { buildWorkflowInventory } from "./inventory.js";

describe("control-plane inventory", () => {
  const previousN8nBaseUrl = process.env.OPENCLAW_N8N_BASE_URL;
  const previousN8nApiKey = process.env.OPENCLAW_N8N_API_KEY;

  afterEach(() => {
    if (previousN8nBaseUrl === undefined) {
      delete process.env.OPENCLAW_N8N_BASE_URL;
    } else {
      process.env.OPENCLAW_N8N_BASE_URL = previousN8nBaseUrl;
    }
    if (previousN8nApiKey === undefined) {
      delete process.env.OPENCLAW_N8N_API_KEY;
    } else {
      process.env.OPENCLAW_N8N_API_KEY = previousN8nApiKey;
    }
  });

  it("loads workflow templates even when n8n API is not configured", async () => {
    delete process.env.OPENCLAW_N8N_BASE_URL;
    delete process.env.OPENCLAW_N8N_API_KEY;

    const { inventory } = await buildWorkflowInventory();

    expect(inventory.length).toBeGreaterThan(0);
    expect(inventory.some((item) => item.source === "template")).toBe(true);
    expect(inventory.some((item) => item.name.toLowerCase().includes("marketing"))).toBe(true);
  });
});
