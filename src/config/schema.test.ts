import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildConfigSchema, __test__ } from "./schema.js";
import { sensitive } from "./zod-schema.sensitive.js";

const { mapSensitivePaths } = __test__;

describe("mapSensitivePaths", () => {
  it("should detect sensitive fields nested inside all structural Zod types", () => {
    const GrandSchema = z.object({
      simple: z.string().register(sensitive).optional(),
      simpleReversed: z.string().optional().register(sensitive),
      nested: z.object({
        nested: z.string().register(sensitive),
      }),
      list: z.array(z.string().register(sensitive)),
      listOfObjects: z.array(z.object({ nested: z.string().register(sensitive) })),
      headers: z.record(z.string(), z.string().register(sensitive)),
      headersNested: z.record(z.string(), z.object({ nested: z.string().register(sensitive) })),
      auth: z.union([
        z.object({ type: z.literal("none") }),
        z.object({ type: z.literal("token"), value: z.string().register(sensitive) }),
      ]),
      merged: z
        .object({ id: z.string() })
        .and(z.object({ nested: z.string().register(sensitive) })),
    });

    const result = mapSensitivePaths(GrandSchema, "", {});

    expect(result["simple"]?.sensitive).toBe(true);
    expect(result["simpleReversed"]?.sensitive).toBe(true);
    expect(result["nested.nested"]?.sensitive).toBe(true);
    expect(result["list[]"]?.sensitive).toBe(true);
    expect(result["listOfObjects[].nested"]?.sensitive).toBe(true);
    expect(result["headers.*"]?.sensitive).toBe(true);
    expect(result["headersNested.*.nested"]?.sensitive).toBe(true);
    expect(result["auth.value"]?.sensitive).toBe(true);
    expect(result["merged.nested"]?.sensitive).toBe(true);
  });
  it("should not detect non-sensitive fields nested inside all structural Zod types", () => {
    const GrandSchema = z.object({
      simple: z.string().optional(),
      simpleReversed: z.string().optional(),
      nested: z.object({
        nested: z.string(),
      }),
      list: z.array(z.string()),
      listOfObjects: z.array(z.object({ nested: z.string() })),
      headers: z.record(z.string(), z.string()),
      headersNested: z.record(z.string(), z.object({ nested: z.string() })),
      auth: z.union([
        z.object({ type: z.literal("none") }),
        z.object({ type: z.literal("token"), value: z.string() }),
      ]),
      merged: z.object({ id: z.string() }).and(z.object({ nested: z.string() })),
    });

    const result = mapSensitivePaths(GrandSchema, "", {});

    expect(result["simple"]?.sensitive).toBe(undefined);
    expect(result["simpleReversed"]?.sensitive).toBe(undefined);
    expect(result["nested.nested"]?.sensitive).toBe(undefined);
    expect(result["list[]"]?.sensitive).toBe(undefined);
    expect(result["listOfObjects[].nested"]?.sensitive).toBe(undefined);
    expect(result["headers.*"]?.sensitive).toBe(undefined);
    expect(result["headersNested.*.nested"]?.sensitive).toBe(undefined);
    expect(result["auth.value"]?.sensitive).toBe(undefined);
    expect(result["merged.nested"]?.sensitive).toBe(undefined);
  });
});

describe("config schema", () => {
  it("exports schema + hints", () => {
    const res = buildConfigSchema();
    const schema = res.schema as { properties?: Record<string, unknown> };
    expect(schema.properties?.gateway).toBeTruthy();
    expect(schema.properties?.agents).toBeTruthy();
    expect(res.uiHints.gateway?.label).toBe("Gateway");
    expect(res.uiHints["gateway.auth.token"]?.sensitive).toBe(true);
    expect(res.version).toBeTruthy();
    expect(res.generatedAt).toBeTruthy();
  });

  it("merges plugin ui hints", () => {
    const res = buildConfigSchema({
      plugins: [
        {
          id: "voice-call",
          name: "Voice Call",
          description: "Outbound voice calls",
          configUiHints: {
            provider: { label: "Provider" },
            "twilio.authToken": { label: "Auth Token", sensitive: true },
          },
        },
      ],
    });

    expect(res.uiHints["plugins.entries.voice-call"]?.label).toBe("Voice Call");
    expect(res.uiHints["plugins.entries.voice-call.config"]?.label).toBe("Voice Call Config");
    expect(res.uiHints["plugins.entries.voice-call.config.twilio.authToken"]?.label).toBe(
      "Auth Token",
    );
    expect(res.uiHints["plugins.entries.voice-call.config.twilio.authToken"]?.sensitive).toBe(true);
  });

  it("merges plugin + channel schemas", () => {
    const res = buildConfigSchema({
      plugins: [
        {
          id: "voice-call",
          name: "Voice Call",
          configSchema: {
            type: "object",
            properties: {
              provider: { type: "string" },
            },
          },
        },
      ],
      channels: [
        {
          id: "matrix",
          label: "Matrix",
          configSchema: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
            },
          },
        },
      ],
    });

    const schema = res.schema as {
      properties?: Record<string, unknown>;
    };
    const pluginsNode = schema.properties?.plugins as Record<string, unknown> | undefined;
    const entriesNode = pluginsNode?.properties as Record<string, unknown> | undefined;
    const entriesProps = entriesNode?.entries as Record<string, unknown> | undefined;
    const entryProps = entriesProps?.properties as Record<string, unknown> | undefined;
    const pluginEntry = entryProps?.["voice-call"] as Record<string, unknown> | undefined;
    const pluginConfig = pluginEntry?.properties as Record<string, unknown> | undefined;
    const pluginConfigSchema = pluginConfig?.config as Record<string, unknown> | undefined;
    const pluginConfigProps = pluginConfigSchema?.properties as Record<string, unknown> | undefined;
    expect(pluginConfigProps?.provider).toBeTruthy();

    const channelsNode = schema.properties?.channels as Record<string, unknown> | undefined;
    const channelsProps = channelsNode?.properties as Record<string, unknown> | undefined;
    const channelSchema = channelsProps?.matrix as Record<string, unknown> | undefined;
    const channelProps = channelSchema?.properties as Record<string, unknown> | undefined;
    expect(channelProps?.accessToken).toBeTruthy();
  });

  it("adds heartbeat target hints with dynamic channels", () => {
    const res = buildConfigSchema({
      channels: [
        {
          id: "bluebubbles",
          label: "BlueBubbles",
          configSchema: { type: "object" },
        },
      ],
    });

    const defaultsHint = res.uiHints["agents.defaults.heartbeat.target"];
    const listHint = res.uiHints["agents.list.*.heartbeat.target"];
    expect(defaultsHint?.help).toContain("bluebubbles");
    expect(defaultsHint?.help).toContain("last");
    expect(listHint?.help).toContain("bluebubbles");
  });
});
