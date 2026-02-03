import { describe, expect, it, vi } from "vitest";
import {
  downloadCustomEmojiFiles,
  extractCustomEmojiEntities,
  expandCustomEmojisInText,
  processCustomEmojis,
  resolveCustomEmojis,
} from "./custom-emoji.js";

describe("extractCustomEmojiEntities", () => {
  it("returns empty array when entities is undefined", () => {
    expect(extractCustomEmojiEntities(undefined)).toEqual([]);
  });

  it("returns empty array when entities is empty", () => {
    expect(extractCustomEmojiEntities([])).toEqual([]);
  });

  it("returns empty array when no custom_emoji entities exist", () => {
    const entities = [
      { type: "mention", offset: 0, length: 5 },
      { type: "bold", offset: 6, length: 5 },
      { type: "text_link", offset: 12, length: 4, url: "https://example.com" },
    ];
    expect(extractCustomEmojiEntities(entities)).toEqual([]);
  });

  it("extracts custom_emoji entities", () => {
    const entities = [
      { type: "mention", offset: 0, length: 5 },
      { type: "custom_emoji", offset: 6, length: 2, custom_emoji_id: "emoji123" },
      { type: "bold", offset: 9, length: 5 },
      { type: "custom_emoji", offset: 15, length: 2, custom_emoji_id: "emoji456" },
    ];
    const result = extractCustomEmojiEntities(entities);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: "custom_emoji",
      offset: 6,
      length: 2,
      custom_emoji_id: "emoji123",
    });
    expect(result[1]).toEqual({
      type: "custom_emoji",
      offset: 15,
      length: 2,
      custom_emoji_id: "emoji456",
    });
  });

  it("skips custom_emoji without custom_emoji_id", () => {
    const entities = [
      { type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "valid123" },
      { type: "custom_emoji", offset: 3, length: 2 }, // missing custom_emoji_id
      { type: "custom_emoji", offset: 6, length: 2, custom_emoji_id: "" }, // empty string
    ];
    const result = extractCustomEmojiEntities(entities);
    expect(result).toHaveLength(1);
    expect(result[0].custom_emoji_id).toBe("valid123");
  });
});

describe("expandCustomEmojisInText", () => {
  it("returns text unchanged when entities is empty", () => {
    const resolved = new Map([["emoji123", { emoji: "😂", setName: "TestPack" }]]);
    expect(expandCustomEmojisInText("Hello world", [], resolved)).toBe("Hello world");
  });

  it("returns text unchanged when resolved map is empty", () => {
    const entities = [
      { type: "custom_emoji" as const, offset: 6, length: 1, custom_emoji_id: "emoji123" },
    ];
    expect(expandCustomEmojisInText("Hello X world", entities, new Map())).toBe("Hello X world");
  });

  it("expands a single custom emoji with set name", () => {
    const text = "Hello X world";
    const entities = [
      { type: "custom_emoji" as const, offset: 6, length: 1, custom_emoji_id: "emoji123" },
    ];
    const resolved = new Map([["emoji123", { emoji: "😂", setName: "FunnyPack" }]]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe("Hello [😂:FunnyPack] world");
  });

  it("expands a single custom emoji without set name", () => {
    const text = "Hello X world";
    const entities = [
      { type: "custom_emoji" as const, offset: 6, length: 1, custom_emoji_id: "emoji123" },
    ];
    const resolved = new Map([["emoji123", { emoji: "🎉" }]]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe("Hello [🎉] world");
  });

  it("expands multiple custom emojis", () => {
    const text = "A B C";
    const entities = [
      { type: "custom_emoji" as const, offset: 0, length: 1, custom_emoji_id: "e1" },
      { type: "custom_emoji" as const, offset: 2, length: 1, custom_emoji_id: "e2" },
      { type: "custom_emoji" as const, offset: 4, length: 1, custom_emoji_id: "e3" },
    ];
    const resolved = new Map([
      ["e1", { emoji: "🅰️", setName: "Letters" }],
      ["e2", { emoji: "🅱️", setName: "Letters" }],
      ["e3", { emoji: "©️" }],
    ]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe(
      "[🅰️:Letters] [🅱️:Letters] [©️]",
    );
  });

  it("handles adjacent custom emojis", () => {
    const text = "XY";
    const entities = [
      { type: "custom_emoji" as const, offset: 0, length: 1, custom_emoji_id: "e1" },
      { type: "custom_emoji" as const, offset: 1, length: 1, custom_emoji_id: "e2" },
    ];
    const resolved = new Map([
      ["e1", { emoji: "🔥" }],
      ["e2", { emoji: "💧" }],
    ]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe("[🔥][💧]");
  });

  it("skips unresolved custom emoji", () => {
    const text = "A B C";
    const entities = [
      { type: "custom_emoji" as const, offset: 0, length: 1, custom_emoji_id: "e1" },
      { type: "custom_emoji" as const, offset: 2, length: 1, custom_emoji_id: "unknown" },
      { type: "custom_emoji" as const, offset: 4, length: 1, custom_emoji_id: "e3" },
    ];
    const resolved = new Map([
      ["e1", { emoji: "🔴" }],
      ["e3", { emoji: "🔵" }],
    ]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe("[🔴] B [🔵]");
  });

  it("handles multi-byte emoji placeholder", () => {
    // Custom emoji in Telegram can occupy 2 UTF-16 code units (surrogate pair)
    const text = "Hi 👋 there";
    const entities = [
      { type: "custom_emoji" as const, offset: 3, length: 2, custom_emoji_id: "wave" },
    ];
    const resolved = new Map([["wave", { emoji: "👋", setName: "Hands" }]]);

    expect(expandCustomEmojisInText(text, entities, resolved)).toBe("Hi [👋:Hands] there");
  });
});

describe("resolveCustomEmojis", () => {
  it("returns empty map for empty array", async () => {
    const mockBot = { api: { getCustomEmojiStickers: vi.fn() } };
    const result = await resolveCustomEmojis(mockBot as never, []);
    expect(result.size).toBe(0);
    expect(mockBot.api.getCustomEmojiStickers).not.toHaveBeenCalled();
  });

  it("resolves emoji info from API", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockResolvedValue([
          {
            custom_emoji_id: "emoji1",
            emoji: "🎉",
            set_name: "PartyPack",
            file_id: "file1",
            file_unique_id: "unique1",
          },
          {
            custom_emoji_id: "emoji2",
            emoji: "🔥",
            set_name: "FireSet",
            file_id: "file2",
            file_unique_id: "unique2",
          },
        ]),
      },
    };

    const result = await resolveCustomEmojis(mockBot as never, ["emoji1", "emoji2"]);

    expect(result.size).toBe(2);
    expect(result.get("emoji1")).toEqual({
      emoji: "🎉",
      setName: "PartyPack",
      fileId: "file1",
      fileUniqueId: "unique1",
    });
    expect(result.get("emoji2")).toEqual({
      emoji: "🔥",
      setName: "FireSet",
      fileId: "file2",
      fileUniqueId: "unique2",
    });
  });

  it("uses fallback emoji when emoji is undefined", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockResolvedValue([
          {
            custom_emoji_id: "emoji1",
            // emoji is undefined
            set_name: "TestPack",
            file_id: "file1",
            file_unique_id: "unique1",
          },
        ]),
      },
    };

    const result = await resolveCustomEmojis(mockBot as never, ["emoji1"]);

    expect(result.get("emoji1")?.emoji).toBe("❓");
  });

  it("returns empty map on API error", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockRejectedValue(new Error("API error")),
      },
    };

    const result = await resolveCustomEmojis(mockBot as never, ["emoji1"]);

    expect(result.size).toBe(0);
  });

  it("skips stickers without custom_emoji_id", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockResolvedValue([
          {
            custom_emoji_id: "emoji1",
            emoji: "🎉",
          },
          {
            // no custom_emoji_id
            emoji: "🔥",
          },
        ]),
      },
    };

    const result = await resolveCustomEmojis(mockBot as never, ["emoji1", "emoji2"]);

    expect(result.size).toBe(1);
    expect(result.has("emoji1")).toBe(true);
  });
});

describe("downloadCustomEmojiFiles", () => {
  it("returns empty array for empty map", async () => {
    const mockBot = { api: { getFile: vi.fn() } };
    const result = await downloadCustomEmojiFiles(mockBot as never, "token", new Map(), 1000000);
    expect(result).toEqual([]);
  });

  it("handles emoji without fileId", async () => {
    const mockBot = { api: { getFile: vi.fn() } };
    const emojiInfo = new Map([["e1", { emoji: "🎉", setName: "Pack" }]]);

    const result = await downloadCustomEmojiFiles(mockBot as never, "token", emojiInfo, 1000000);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "e1",
      emoji: "🎉",
      setName: "Pack",
    });
    expect(mockBot.api.getFile).not.toHaveBeenCalled();
  });

  it("handles getFile returning no file_path", async () => {
    const mockBot = {
      api: {
        getFile: vi.fn().mockResolvedValue({
          // no file_path
        }),
      },
    };
    const emojiInfo = new Map([
      ["e1", { emoji: "🎉", setName: "Pack", fileId: "f1", fileUniqueId: "u1" }],
    ]);

    const result = await downloadCustomEmojiFiles(mockBot as never, "token", emojiInfo, 1000000);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "e1",
      emoji: "🎉",
      setName: "Pack",
      fileId: "f1",
      fileUniqueId: "u1",
    });
  });

  it("handles download failure gracefully", async () => {
    const mockBot = {
      api: {
        getFile: vi.fn().mockRejectedValue(new Error("Download failed")),
      },
    };
    const emojiInfo = new Map([
      ["e1", { emoji: "🎉", setName: "Pack", fileId: "f1", fileUniqueId: "u1" }],
    ]);

    const result = await downloadCustomEmojiFiles(mockBot as never, "token", emojiInfo, 1000000);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "e1",
      emoji: "🎉",
      setName: "Pack",
      fileId: "f1",
      fileUniqueId: "u1",
    });
  });
});

describe("processCustomEmojis", () => {
  it("returns original text when no custom emojis", async () => {
    const mockBot = { api: { getCustomEmojiStickers: vi.fn() } };
    const result = await processCustomEmojis({
      text: "Hello world",
      entities: [{ type: "bold", offset: 0, length: 5 }],
      bot: mockBot as never,
      token: "token",
      maxBytes: 1000000,
    });

    expect(result.expandedText).toBe("Hello world");
    expect(result.customEmojis).toEqual([]);
    expect(mockBot.api.getCustomEmojiStickers).not.toHaveBeenCalled();
  });

  it("returns original text when entities is undefined", async () => {
    const mockBot = { api: { getCustomEmojiStickers: vi.fn() } };
    const result = await processCustomEmojis({
      text: "Hello world",
      entities: undefined,
      bot: mockBot as never,
      token: "token",
      maxBytes: 1000000,
    });

    expect(result.expandedText).toBe("Hello world");
    expect(result.customEmojis).toEqual([]);
  });

  it("resolves and expands custom emojis without downloading", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockResolvedValue([
          {
            custom_emoji_id: "emoji1",
            emoji: "🎉",
            set_name: "PartyPack",
          },
        ]),
      },
    };

    const result = await processCustomEmojis({
      text: "Hello X world",
      entities: [{ type: "custom_emoji", offset: 6, length: 1, custom_emoji_id: "emoji1" }],
      bot: mockBot as never,
      token: "token",
      maxBytes: 1000000,
      downloadFiles: false,
    });

    expect(result.expandedText).toBe("Hello [🎉:PartyPack] world");
    expect(result.customEmojis).toHaveLength(1);
    expect(result.customEmojis[0]).toEqual({
      id: "emoji1",
      emoji: "🎉",
      setName: "PartyPack",
    });
  });

  it("handles multiple emojis in correct order", async () => {
    const mockBot = {
      api: {
        getCustomEmojiStickers: vi.fn().mockResolvedValue([
          { custom_emoji_id: "e1", emoji: "🔴" },
          { custom_emoji_id: "e2", emoji: "🟢" },
          { custom_emoji_id: "e3", emoji: "🔵" },
        ]),
      },
    };

    const result = await processCustomEmojis({
      text: "A B C",
      entities: [
        { type: "custom_emoji", offset: 0, length: 1, custom_emoji_id: "e1" },
        { type: "custom_emoji", offset: 2, length: 1, custom_emoji_id: "e2" },
        { type: "custom_emoji", offset: 4, length: 1, custom_emoji_id: "e3" },
      ],
      bot: mockBot as never,
      token: "token",
      maxBytes: 1000000,
    });

    expect(result.expandedText).toBe("[🔴] [🟢] [🔵]");
    expect(result.customEmojis).toHaveLength(3);
  });
});
