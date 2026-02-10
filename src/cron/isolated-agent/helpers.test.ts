import { describe, expect, it } from "vitest";
import { extractJsonFromText, validateJsonSchema } from "./helpers.js";

describe("extractJsonFromText", () => {
  it("extracts a pure JSON object", () => {
    expect(extractJsonFromText('{"ok":true}')).toBe('{"ok":true}');
  });

  it("extracts a pure JSON array", () => {
    expect(extractJsonFromText('[{"ok":true}]')).toBe('[{"ok":true}]');
  });

  it("extracts JSON from a markdown fence", () => {
    const input = '```json\n{\n  "ok": true\n}\n```';
    expect(extractJsonFromText(input)).toBe('{\n  "ok": true\n}');
  });

  it("extracts JSON with surrounding text", () => {
    const input = 'prefix {"ok":true} suffix';
    expect(extractJsonFromText(input)).toBe('{"ok":true}');
  });

  it("returns null when no JSON is present", () => {
    expect(extractJsonFromText("no json here")).toBeNull();
  });

  it("extracts nested JSON objects", () => {
    const input = 'note {"outer":{"inner":[1,2,3]}} done';
    expect(extractJsonFromText(input)).toBe('{"outer":{"inner":[1,2,3]}}');
  });
});

describe("validateJsonSchema", () => {
  const baseSchema = {
    type: "object",
    required: ["completedToday"],
    properties: {
      completedToday: { type: "array", items: { type: "string" } },
    },
  };

  it("returns valid for matching JSON", () => {
    const res = validateJsonSchema('{"completedToday":["a"]}', baseSchema);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.data).toEqual({ completedToday: ["a"] });
    }
  });

  it("fails when JSON does not match schema", () => {
    const res = validateJsonSchema('{"completedToday":[1]}', baseSchema);
    expect(res.valid).toBe(false);
  });

  it("fails on invalid JSON", () => {
    const res = validateJsonSchema('{"completedToday":', baseSchema);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toMatch(/JSON parse error/);
    }
  });

  it("fails when required fields are missing", () => {
    const res = validateJsonSchema('{"other":[]}', baseSchema);
    expect(res.valid).toBe(false);
  });

  it("fails when type constraints are violated", () => {
    const schema = { type: "array", items: { type: "number" } };
    const res = validateJsonSchema('{"not":"array"}', schema);
    expect(res.valid).toBe(false);
  });
});
