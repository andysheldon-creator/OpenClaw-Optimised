import { xml } from "@xmpp/client";
import { describe, it, expect, beforeEach } from "vitest";
import { XmppClient } from "./client.js";

// Helper type to access private methods for testing
type XmppClientPrivate = {
  extractMessageContent: (stanza: unknown) => {
    body: string;
    links: Array<{ url?: string; description?: string }>;
  };
  extractMessageReactions: (stanza: unknown) => { id: string; reactions: string[] } | undefined;
  extractThreadInfo: (stanza: unknown) => { thread?: string; parentThread?: string };
  buildXmppMessage: (...args: unknown[]) => unknown;
};

describe("XmppClient - Message Parsing", () => {
  let client: XmppClient;

  beforeEach(() => {
    client = new XmppClient({
      jid: "test@example.com",
      password: "password",
      server: "example.com",
    });
  });

  describe("extractMessageContent", () => {
    it("should extract message body", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("body", {}, "Hello, world!"),
      ]);

      // Access private method via type assertion for testing
      const result = (client as unknown as XmppClientPrivate).extractMessageContent(stanza);

      expect(result.body).toBe("Hello, world!");
      expect(result.links).toEqual([]);
    });

    it("should extract OOB link (XEP-0066)", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("body", {}, "Check this out"),
        xml("x", { xmlns: "jabber:x:oob" }, [
          xml("url", {}, "https://example.com/image.jpg"),
          xml("desc", {}, "A cool image"),
        ]),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageContent(stanza);

      expect(result.body).toBe("Check this out");
      expect(result.links).toEqual([
        {
          url: "https://example.com/image.jpg",
          description: "A cool image",
        },
      ]);
    });

    it("should handle empty body", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" });

      const result = (client as unknown as XmppClientPrivate).extractMessageContent(stanza);

      expect(result.body).toBe("");
      expect(result.links).toEqual([]);
    });

    it("should extract OOB link without description", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("x", { xmlns: "jabber:x:oob" }, [xml("url", {}, "https://example.com/file.pdf")]),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageContent(stanza);

      expect(result.links).toEqual([
        {
          url: "https://example.com/file.pdf",
          description: undefined,
        },
      ]);
    });
  });

  describe("extractMessageReactions", () => {
    it("should extract reactions (XEP-0444)", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("reactions", { xmlns: "urn:xmpp:reactions:0", id: "msg-123" }, [
          xml("reaction", {}, "👍"),
          xml("reaction", {}, "❤️"),
        ]),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageReactions(stanza);

      expect(result).toEqual({
        id: "msg-123",
        reactions: ["👍", "❤️"],
      });
    });

    it("should return undefined when no reactions element", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("body", {}, "Hello"),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageReactions(stanza);

      expect(result).toBeUndefined();
    });

    it("should return undefined when reactions element has no id", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("reactions", { xmlns: "urn:xmpp:reactions:0" }, [xml("reaction", {}, "👍")]),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageReactions(stanza);

      expect(result).toBeUndefined();
    });

    it("should return undefined when no reaction children", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("reactions", { xmlns: "urn:xmpp:reactions:0", id: "msg-123" }),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractMessageReactions(stanza);

      expect(result).toBeUndefined();
    });
  });

  describe("extractThreadInfo", () => {
    it("should extract thread information", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("thread", { parent: "thread-parent" }, "thread-123"),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractThreadInfo(stanza);

      expect(result.thread).toBe("thread-123");
      expect(result.parentThread).toBe("thread-parent");
    });

    it("should extract thread without parent", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("thread", {}, "thread-456"),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractThreadInfo(stanza);

      expect(result.thread).toBe("thread-456");
      expect(result.parentThread).toBeUndefined();
    });

    it("should return empty object when no thread", () => {
      const stanza = xml("message", { from: "user@example.com", type: "chat" }, [
        xml("body", {}, "Hello"),
      ]);

      const result = (client as unknown as XmppClientPrivate).extractThreadInfo(stanza);

      expect(result.thread).toBeUndefined();
      expect(result.parentThread).toBeUndefined();
    });
  });

  describe("buildXmppMessage", () => {
    it("should build a basic chat message", () => {
      const message = (client as unknown as XmppClientPrivate).buildXmppMessage(
        "user@example.com",
        "bot@example.com",
        "msg-123",
        "chat",
        "Hello",
        [],
        undefined,
        undefined,
        undefined,
      );

      expect(message.id).toBe("msg-123");
      expect(message.from).toBe("user@example.com");
      expect(message.to).toBe("bot@example.com");
      expect(message.body).toBe("Hello");
      expect(message.type).toBe("chat");
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.links).toBeUndefined();
      expect(message.reactions).toBeUndefined();
    });

    it("should build a groupchat message with room info", () => {
      const message = (client as unknown as XmppClientPrivate).buildXmppMessage(
        "room@conference.example.com/Nick",
        "bot@example.com",
        "msg-456",
        "groupchat",
        "Hello room",
        [],
        undefined,
        undefined,
        undefined,
      );

      expect(message.type).toBe("groupchat");
      expect(message.roomJid).toBe("room@conference.example.com");
      expect(message.nick).toBe("Nick");
    });

    it("should include links when provided", () => {
      const links = [{ url: "https://example.com/file.pdf", description: "Document" }];
      const message = (client as unknown as XmppClientPrivate).buildXmppMessage(
        "user@example.com",
        "bot@example.com",
        "msg-789",
        "chat",
        "Check this",
        links,
        undefined,
        undefined,
        undefined,
      );

      expect(message.links).toEqual(links);
    });

    it("should include reactions when provided", () => {
      const reactions = { id: "msg-100", reactions: ["👍", "❤️"] };
      const message = (client as unknown as XmppClientPrivate).buildXmppMessage(
        "user@example.com",
        "bot@example.com",
        "msg-200",
        "chat",
        "",
        [],
        reactions,
        undefined,
        undefined,
      );

      expect(message.reactions).toEqual(reactions);
    });

    it("should include thread info when provided", () => {
      const message = (client as unknown as XmppClientPrivate).buildXmppMessage(
        "user@example.com",
        "bot@example.com",
        "msg-300",
        "chat",
        "Reply",
        [],
        undefined,
        "thread-123",
        "thread-parent",
      );

      expect(message.thread).toBe("thread-123");
      expect(message.parentThread).toBe("thread-parent");
    });
  });
});
