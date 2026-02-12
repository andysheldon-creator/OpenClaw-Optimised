import { describe, expect, it } from "vitest";
import { buildInboundUserContextPrefix } from "./inbound-meta.js";

function parseFirstJsonBlock(text: string): Record<string, unknown> {
  const match = text.match(/```json\n([\s\S]+?)\n```/);
  if (!match?.[1]) {
    throw new Error("missing json block");
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("buildInboundUserContextPrefix", () => {
  it("includes replied media paths and types in replied-message context", () => {
    const prefix = buildInboundUserContextPrefix({
      ReplyToBody: "<media:image>",
      ReplyToSender: "Ada",
      ReplyToMediaPaths: ["media/inbound/replied.jpg"],
      ReplyToMediaTypes: ["image/jpeg"],
    });

    const block = parseFirstJsonBlock(prefix);
    expect(block).toEqual({
      sender_label: "Ada",
      body: "<media:image>",
      media_paths: ["media/inbound/replied.jpg"],
      media_types: ["image/jpeg"],
    });
  });
});
