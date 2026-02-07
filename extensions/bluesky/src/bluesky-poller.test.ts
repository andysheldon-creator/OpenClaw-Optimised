import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlueskyPoller } from "./bluesky-poller.js";
import type { BlueskyClient, BlueskyMessage } from "./bluesky-client.js";

function createMockClient(opts?: {
  did?: string;
  convos?: Array<{ id: string; members: Array<{ did: string; handle: string }> }>;
  messages?: Map<string, BlueskyMessage[]>;
}): BlueskyClient {
  const myDid = opts?.did ?? "did:plc:myself123";
  const convos = opts?.convos ?? [];
  const messages = opts?.messages ?? new Map();

  return {
    getDid: () => myDid,
    listConvos: vi.fn().mockResolvedValue({ convos }),
    getMessages: vi.fn().mockImplementation((convoId: string) => {
      return Promise.resolve({ messages: messages.get(convoId) ?? [] });
    }),
    sendMessage: vi.fn().mockResolvedValue({ id: "msg-new", convoId: "convo-1" }),
    resolveHandle: vi.fn().mockResolvedValue("did:plc:resolved"),
    markRead: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(myDid),
    logout: vi.fn().mockResolvedValue(undefined),
  } as unknown as BlueskyClient;
}

describe("BlueskyPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not deliver messages on first poll (seed phase)", async () => {
    const onMessage = vi.fn();
    const messages = new Map([
      [
        "convo-1",
        [
          {
            id: "msg-1",
            convoId: "convo-1",
            senderDid: "did:plc:other",
            text: "Hello!",
            sentAt: new Date().toISOString(),
          },
        ],
      ],
    ]);

    const client = createMockClient({
      convos: [{ id: "convo-1", members: [{ did: "did:plc:other", handle: "other.bsky.social" }] }],
      messages,
    });

    const poller = new BlueskyPoller({
      client,
      pollInterval: 5000,
      onMessage,
      onError: () => {},
    });

    poller.start();
    // Wait for the initial poll to complete
    await vi.advanceTimersByTimeAsync(100);

    expect(onMessage).not.toHaveBeenCalled();
    poller.stop();
  });

  it("delivers new messages on subsequent polls", async () => {
    const onMessage = vi.fn();
    const myDid = "did:plc:myself123";

    const initialMessages: BlueskyMessage[] = [
      {
        id: "msg-1",
        convoId: "convo-1",
        senderDid: "did:plc:other",
        text: "Old message",
        sentAt: new Date().toISOString(),
      },
    ];

    const client = createMockClient({
      did: myDid,
      convos: [{ id: "convo-1", members: [{ did: "did:plc:other", handle: "other.bsky.social" }] }],
      messages: new Map([["convo-1", initialMessages]]),
    });

    const poller = new BlueskyPoller({
      client,
      pollInterval: 5000,
      onMessage,
      onError: () => {},
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(onMessage).not.toHaveBeenCalled();

    // Simulate new message arriving
    const updatedMessages: BlueskyMessage[] = [
      {
        id: "msg-2",
        convoId: "convo-1",
        senderDid: "did:plc:other",
        text: "New message!",
        sentAt: new Date().toISOString(),
      },
      ...initialMessages,
    ];
    (client.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      messages: updatedMessages,
    });

    // Trigger next poll
    await vi.advanceTimersByTimeAsync(5000);

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-2", text: "New message!" }),
    );
    poller.stop();
  });

  it("skips own messages", async () => {
    const onMessage = vi.fn();
    const myDid = "did:plc:myself123";

    const client = createMockClient({
      did: myDid,
      convos: [{ id: "convo-1", members: [{ did: "did:plc:other", handle: "other.bsky.social" }] }],
      messages: new Map([
        [
          "convo-1",
          [{ id: "msg-1", convoId: "convo-1", senderDid: myDid, text: "seed", sentAt: new Date().toISOString() }],
        ],
      ]),
    });

    const poller = new BlueskyPoller({
      client,
      pollInterval: 5000,
      onMessage,
      onError: () => {},
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(100);

    // New message from self
    (client.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      messages: [
        { id: "msg-2", convoId: "convo-1", senderDid: myDid, text: "My own msg", sentAt: new Date().toISOString() },
        { id: "msg-1", convoId: "convo-1", senderDid: myDid, text: "seed", sentAt: new Date().toISOString() },
      ],
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(onMessage).not.toHaveBeenCalled();
    poller.stop();
  });

  it("calls onError when polling fails", async () => {
    const onError = vi.fn();
    const client = createMockClient();
    (client.listConvos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const poller = new BlueskyPoller({
      client,
      pollInterval: 5000,
      onMessage: vi.fn(),
      onError,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Network error" }),
      "listing conversations",
    );
    poller.stop();
  });
});
