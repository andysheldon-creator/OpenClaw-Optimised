import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { reactSlackMessage } from "../../../slack/actions.js";
import { slackOutbound } from "./slack.js";

vi.mock("../../../slack/actions.js", () => ({
  reactSlackMessage: vi.fn(async () => undefined),
}));

describe("slackOutbound.sendPayload", () => {
  it("sends blocks with fallback text and reactions", async () => {
    const sendSlack = vi.fn(async () => ({ messageId: "m1", channelId: "c1" }));

    const result = await slackOutbound.sendPayload?.({
      cfg: {} as OpenClawConfig,
      to: "slack:C1",
      text: "ignored",
      payload: {
        text: "Fallback",
        channelData: {
          slack: {
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: "Hello" },
              },
            ],
            reactions: ["+1", "heart"],
          },
        },
      },
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledWith(
      "slack:C1",
      "Fallback",
      expect.objectContaining({
        blocks: expect.any(Array),
      }),
    );
    expect(reactSlackMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ channel: "slack", messageId: "m1", channelId: "c1" });
  });
});
