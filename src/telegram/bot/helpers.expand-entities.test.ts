import { describe, expect, it } from "vitest";
import { expandEntities } from "./helpers.js";

describe("expandEntities", () => {
  it("returns text unchanged when no entities are provided", () => {
    expect(expandEntities("Hello world")).toBe("Hello world");
    expect(expandEntities("Hello world", null)).toBe("Hello world");
    expect(expandEntities("Hello world", [])).toBe("Hello world");
  });

  it("returns text unchanged when there are no expandable entities", () => {
    const entities = [
      { type: "mention", offset: 0, length: 5 },
      { type: "bold", offset: 6, length: 5 },
    ];
    expect(expandEntities("@user hello", entities)).toBe("@user hello");
  });

  describe("text_link expansion", () => {
    it("expands a single text_link entity", () => {
      const text = "Check this link for details";
      const entities = [{ type: "text_link", offset: 11, length: 4, url: "https://example.com" }];
      expect(expandEntities(text, entities)).toBe(
        "Check this [link](https://example.com) for details",
      );
    });

    it("expands multiple text_link entities", () => {
      const text = "Visit Google or GitHub for more";
      const entities = [
        { type: "text_link", offset: 6, length: 6, url: "https://google.com" },
        { type: "text_link", offset: 16, length: 6, url: "https://github.com" },
      ];
      expect(expandEntities(text, entities)).toBe(
        "Visit [Google](https://google.com) or [GitHub](https://github.com) for more",
      );
    });
  });

  describe("custom_emoji expansion", () => {
    it("expands a single custom_emoji with resolved info", () => {
      const text = "Hello X world";
      const entities = [
        { type: "custom_emoji", offset: 6, length: 1, custom_emoji_id: "emoji123" },
      ];
      const resolved = new Map([["emoji123", { emoji: "😂", setName: "FunPack" }]]);

      expect(expandEntities(text, entities, resolved)).toBe("Hello [😂:FunPack] world");
    });

    it("expands custom_emoji without set name", () => {
      const text = "Hi X!";
      const entities = [{ type: "custom_emoji", offset: 3, length: 1, custom_emoji_id: "e1" }];
      const resolved = new Map([["e1", { emoji: "🎉" }]]);

      expect(expandEntities(text, entities, resolved)).toBe("Hi [🎉]!");
    });

    it("ignores custom_emoji when no resolved map provided", () => {
      const text = "Hello X world";
      const entities = [
        { type: "custom_emoji", offset: 6, length: 1, custom_emoji_id: "emoji123" },
      ];

      expect(expandEntities(text, entities)).toBe("Hello X world");
    });

    it("ignores unresolved custom_emoji", () => {
      const text = "A B";
      const entities = [
        { type: "custom_emoji", offset: 0, length: 1, custom_emoji_id: "resolved" },
        { type: "custom_emoji", offset: 2, length: 1, custom_emoji_id: "unknown" },
      ];
      const resolved = new Map([["resolved", { emoji: "✅" }]]);

      expect(expandEntities(text, entities, resolved)).toBe("[✅] B");
    });
  });

  describe("combined text_link and custom_emoji expansion", () => {
    it("expands both entity types in a single pass", () => {
      const text = "Check link and emoji X here";
      const entities = [
        { type: "text_link", offset: 6, length: 4, url: "https://example.com" },
        { type: "custom_emoji", offset: 21, length: 1, custom_emoji_id: "e1" },
      ];
      const resolved = new Map([["e1", { emoji: "🎯", setName: "Targets" }]]);

      expect(expandEntities(text, entities, resolved)).toBe(
        "Check [link](https://example.com) and emoji [🎯:Targets] here",
      );
    });

    it("handles adjacent text_link and custom_emoji", () => {
      const text = "linkX";
      const entities = [
        { type: "text_link", offset: 0, length: 4, url: "https://a.com" },
        { type: "custom_emoji", offset: 4, length: 1, custom_emoji_id: "e1" },
      ];
      const resolved = new Map([["e1", { emoji: "⭐" }]]);

      expect(expandEntities(text, entities, resolved)).toBe("[link](https://a.com)[⭐]");
    });

    it("preserves entity order when expanding both types", () => {
      const text = "A B C D E";
      const entities = [
        { type: "custom_emoji", offset: 0, length: 1, custom_emoji_id: "e1" },
        { type: "text_link", offset: 2, length: 1, url: "https://b.com" },
        { type: "custom_emoji", offset: 4, length: 1, custom_emoji_id: "e2" },
        { type: "text_link", offset: 6, length: 1, url: "https://d.com" },
        { type: "custom_emoji", offset: 8, length: 1, custom_emoji_id: "e3" },
      ];
      const resolved = new Map([
        ["e1", { emoji: "1️⃣" }],
        ["e2", { emoji: "3️⃣" }],
        ["e3", { emoji: "5️⃣" }],
      ]);

      expect(expandEntities(text, entities, resolved)).toBe(
        "[1️⃣] [B](https://b.com) [3️⃣] [D](https://d.com) [5️⃣]",
      );
    });

    it("handles multiple overlapping-position entities correctly", () => {
      // Real-world case: message with links and emoji interspersed
      const text = "See docs here emoji1 and emoji2 links";
      const entities = [
        { type: "text_link", offset: 4, length: 4, url: "https://docs.example.com" },
        { type: "custom_emoji", offset: 14, length: 6, custom_emoji_id: "smile" },
        { type: "custom_emoji", offset: 25, length: 6, custom_emoji_id: "wave" },
      ];
      const resolved = new Map([
        ["smile", { emoji: "😊", setName: "Faces" }],
        ["wave", { emoji: "👋" }],
      ]);

      expect(expandEntities(text, entities, resolved)).toBe(
        "See [docs](https://docs.example.com) here [😊:Faces] and [👋] links",
      );
    });
  });
});
