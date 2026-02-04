import { describe, expect, it, vi } from "vitest";
import { reactSlackMessage } from "../actions.js";
import { sendMessageSlack } from "../send.js";
import { createSlackRichMessageTool } from "./rich-message-tool.js";

vi.mock("../send.js", () => ({
  sendMessageSlack: vi.fn(async () => ({ messageId: "m1", channelId: "C1" })),
}));

vi.mock("../actions.js", () => ({
  reactSlackMessage: vi.fn(async () => undefined),
}));

describe("SlackRichMessage tool", () => {
  it("sends raw blocks and applies reactions", async () => {
    const tool = createSlackRichMessageTool();

    const result = await tool.execute("tool-1", {
      to: "#general",
      pattern: "raw",
      params: {
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "Hello" },
          },
        ],
        fallbackText: "Fallback",
      },
      reactions: ["+1"],
    });

    expect(vi.mocked(sendMessageSlack)).toHaveBeenCalledWith(
      "#general",
      "Fallback",
      expect.objectContaining({ blocks: expect.any(Array) }),
    );
    expect(vi.mocked(reactSlackMessage)).toHaveBeenCalledWith("C1", "m1", "+1", expect.any(Object));
    expect(result.details).toMatchObject({ success: true, sentWithBlocks: true });
  });

  it("rejects invalid blocks", async () => {
    const tool = createSlackRichMessageTool();
    const longText = "a".repeat(200);

    const result = await tool.execute("tool-2", {
      to: "#general",
      pattern: "raw",
      params: {
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: longText },
          },
        ],
      },
    });

    expect(result.details).toMatchObject({ success: false });
    expect(String(result.details?.error)).toMatch(/Invalid Slack blocks/);
  });
});
