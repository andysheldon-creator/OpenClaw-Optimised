import type { WebClient as SlackWebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { resolveSlackChannelHistory, resolveSlackThreadHistory } from "./media.js";

function mockClient(
  overrides: {
    replies?: ReturnType<typeof vi.fn>;
    history?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    conversations: {
      replies: overrides.replies ?? vi.fn().mockResolvedValue({ messages: [] }),
      history: overrides.history ?? vi.fn().mockResolvedValue({ messages: [] }),
    },
  } as unknown as SlackWebClient;
}

describe("resolveSlackThreadHistory", () => {
  it("returns thread messages excluding specified ts", async () => {
    const client = mockClient({
      replies: vi.fn().mockResolvedValue({
        messages: [
          { text: "Thread starter", user: "U1", ts: "1000.0" },
          { text: "Reply 1", user: "U2", ts: "1001.0" },
          { text: "Current message", user: "U1", ts: "1002.0" },
        ],
      }),
    });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 50,
      excludeTs: "1002.0",
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "Thread starter", userId: "U1", ts: "1000.0" });
    expect(result[1]).toEqual({ text: "Reply 1", userId: "U2", ts: "1001.0" });
  });

  it("returns all messages when no excludeTs is specified", async () => {
    const client = mockClient({
      replies: vi.fn().mockResolvedValue({
        messages: [
          { text: "Starter", user: "U1", ts: "1000.0" },
          { text: "Reply", user: "U2", ts: "1001.0" },
        ],
      }),
    });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 50,
    });

    expect(result).toHaveLength(2);
  });

  it("returns latest messages when thread exceeds limit", async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      text: `Message ${i}`,
      user: "U1",
      ts: `${1000 + i}.0`,
    }));
    const client = mockClient({
      replies: vi.fn().mockResolvedValue({ messages }),
    });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 3,
    });

    expect(result).toHaveLength(3);
    // Should return the LAST 3 messages (prioritize recent context)
    expect(result[0].text).toBe("Message 7");
    expect(result[1].text).toBe("Message 8");
    expect(result[2].text).toBe("Message 9");
  });

  it("filters out messages with empty text", async () => {
    const client = mockClient({
      replies: vi.fn().mockResolvedValue({
        messages: [
          { text: "Valid", user: "U1", ts: "1000.0" },
          { text: "", user: "U2", ts: "1001.0" },
          { text: "   ", user: "U3", ts: "1002.0" },
          { text: "Also valid", user: "U4", ts: "1003.0" },
        ],
      }),
    });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 50,
    });

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Valid");
    expect(result[1].text).toBe("Also valid");
  });

  it("returns empty array when limit is 0", async () => {
    const repliesMock = vi.fn();
    const client = mockClient({ replies: repliesMock });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 0,
    });

    expect(result).toEqual([]);
    expect(repliesMock).not.toHaveBeenCalled();
  });

  it("returns empty array on API error", async () => {
    const client = mockClient({
      replies: vi.fn().mockRejectedValue(new Error("channel_not_found")),
    });

    const result = await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 50,
    });

    expect(result).toEqual([]);
  });

  it("calls conversations.replies with correct parameters", async () => {
    const repliesMock = vi.fn().mockResolvedValue({ messages: [] });
    const client = mockClient({ replies: repliesMock });

    await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 25,
    });

    expect(repliesMock).toHaveBeenCalledWith({
      channel: "C123",
      ts: "1000.0",
      limit: 50, // limit * 2 to get latest messages
      inclusive: true,
    });
  });

  it("caps fetchLimit at 200", async () => {
    const repliesMock = vi.fn().mockResolvedValue({ messages: [] });
    const client = mockClient({ replies: repliesMock });

    await resolveSlackThreadHistory({
      channelId: "C123",
      threadTs: "1000.0",
      client,
      limit: 150,
    });

    expect(repliesMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });
});

describe("resolveSlackChannelHistory", () => {
  it("returns channel messages in chronological order", async () => {
    const client = mockClient({
      // conversations.history returns newest-first
      history: vi.fn().mockResolvedValue({
        messages: [
          { text: "Newest", user: "U2", ts: "999.0" },
          { text: "Older", user: "U1", ts: "998.0" },
          { text: "Oldest", user: "U1", ts: "997.0" },
        ],
      }),
    });

    const result = await resolveSlackChannelHistory({
      channelId: "C123",
      client,
      limit: 10,
      before: "1000.0",
    });

    // Should be reversed to chronological order
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("Oldest");
    expect(result[1].text).toBe("Older");
    expect(result[2].text).toBe("Newest");
  });

  it("calls conversations.history with correct parameters", async () => {
    const historyMock = vi.fn().mockResolvedValue({ messages: [] });
    const client = mockClient({ history: historyMock });

    await resolveSlackChannelHistory({
      channelId: "C123",
      client,
      limit: 20,
      before: "1000.0",
    });

    expect(historyMock).toHaveBeenCalledWith({
      channel: "C123",
      latest: "1000.0",
      limit: 20,
      inclusive: false,
    });
  });

  it("returns empty array when limit is 0", async () => {
    const historyMock = vi.fn();
    const client = mockClient({ history: historyMock });

    const result = await resolveSlackChannelHistory({
      channelId: "C123",
      client,
      limit: 0,
      before: "1000.0",
    });

    expect(result).toEqual([]);
    expect(historyMock).not.toHaveBeenCalled();
  });

  it("returns empty array on API error", async () => {
    const client = mockClient({
      history: vi.fn().mockRejectedValue(new Error("not_in_channel")),
    });

    const result = await resolveSlackChannelHistory({
      channelId: "C123",
      client,
      limit: 10,
      before: "1000.0",
    });

    expect(result).toEqual([]);
  });

  it("filters out messages with empty text", async () => {
    const client = mockClient({
      history: vi.fn().mockResolvedValue({
        messages: [
          { text: "Valid", user: "U1", ts: "999.0" },
          { text: "", user: "U2", ts: "998.0" },
          { text: null, user: "U3", ts: "997.0" },
        ],
      }),
    });

    const result = await resolveSlackChannelHistory({
      channelId: "C123",
      client,
      limit: 10,
      before: "1000.0",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Valid");
  });
});
