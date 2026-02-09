import { describe, expect, it } from "vitest";
import { resolveDiscordChannelAllowlist } from "./resolve-channels.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("resolveDiscordChannelAllowlist", () => {
  it("resolves guild/channel by name", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "g1", name: "My Guild" }]);
      }
      if (url.endsWith("/guilds/g1/channels")) {
        return jsonResponse([
          { id: "c1", name: "general", guild_id: "g1", type: 0 },
          { id: "c2", name: "random", guild_id: "g1", type: 0 },
        ]);
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["My Guild/general"],
      fetcher,
    });

    expect(res[0]?.resolved).toBe(true);
    expect(res[0]?.guildId).toBe("g1");
    expect(res[0]?.channelId).toBe("c1");
  });

  it("resolves guildId/channelId when both are numeric", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "111222333", name: "Test Server" }]);
      }
      if (url.endsWith("/channels/444555666")) {
        return jsonResponse({
          id: "444555666",
          name: "general",
          guild_id: "111222333",
          type: 0,
        });
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["111222333/444555666"],
      fetcher,
    });

    expect(res[0]?.resolved).toBe(true);
    expect(res[0]?.guildId).toBe("111222333");
    expect(res[0]?.channelId).toBe("444555666");
  });

  it("rejects guildId/channelId when channel belongs to a different guild", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([
          { id: "111222333", name: "Guild A" },
          { id: "999888777", name: "Guild B" },
        ]);
      }
      if (url.endsWith("/channels/444555666")) {
        return jsonResponse({
          id: "444555666",
          name: "general",
          guild_id: "999888777",
          type: 0,
        });
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["111222333/444555666"],
      fetcher,
    });

    expect(res[0]?.resolved).toBe(false);
    expect(res[0]?.note).toMatch(/guild/i);
  });

  it("marks invalid numeric channelId as unresolved without aborting batch", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "111222333", name: "Test Server" }]);
      }
      if (url.endsWith("/guilds/111222333/channels")) {
        return jsonResponse([{ id: "444555666", name: "general", guild_id: "111222333", type: 0 }]);
      }
      if (url.endsWith("/channels/444555666")) {
        return jsonResponse({
          id: "444555666",
          name: "general",
          guild_id: "111222333",
          type: 0,
        });
      }
      if (url.endsWith("/channels/999000111")) {
        return new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["111222333/999000111", "111222333/444555666"],
      fetcher,
    });

    expect(res).toHaveLength(2);
    expect(res[0]?.resolved).toBe(false);
    expect(res[0]?.channelId).toBe("999000111");
    expect(res[0]?.guildId).toBe("111222333");
    expect(res[1]?.resolved).toBe(true);
    expect(res[1]?.channelId).toBe("444555666");
  });

  it("treats 403 channel lookup as unresolved without aborting batch", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "111222333", name: "Test Server" }]);
      }
      if (url.endsWith("/guilds/111222333/channels")) {
        return jsonResponse([{ id: "444555666", name: "general", guild_id: "111222333", type: 0 }]);
      }
      if (url.endsWith("/channels/777888999")) {
        return new Response("Missing Access", { status: 403 });
      }
      if (url.endsWith("/channels/444555666")) {
        return jsonResponse({
          id: "444555666",
          name: "general",
          guild_id: "111222333",
          type: 0,
        });
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["111222333/777888999", "111222333/444555666"],
      fetcher,
    });

    expect(res).toHaveLength(2);
    expect(res[0]?.resolved).toBe(false);
    expect(res[0]?.channelId).toBe("777888999");
    expect(res[0]?.guildId).toBe("111222333");
    expect(res[1]?.resolved).toBe(true);
    expect(res[1]?.channelId).toBe("444555666");
  });

  it("falls back to name matching when numeric channel name is not a valid ID", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "111222333", name: "Test Server" }]);
      }
      if (url.endsWith("/channels/2024")) {
        return new Response("not found", { status: 404 });
      }
      if (url.endsWith("/guilds/111222333/channels")) {
        return jsonResponse([
          { id: "c1", name: "2024", guild_id: "111222333", type: 0 },
          { id: "c2", name: "general", guild_id: "111222333", type: 0 },
        ]);
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["111222333/2024"],
      fetcher,
    });

    expect(res[0]?.resolved).toBe(true);
    expect(res[0]?.guildId).toBe("111222333");
    expect(res[0]?.channelId).toBe("c1");
    expect(res[0]?.channelName).toBe("2024");
  });

  it("resolves channel id to guild", async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([{ id: "g1", name: "Guild One" }]);
      }
      if (url.endsWith("/channels/123")) {
        return jsonResponse({ id: "123", name: "general", guild_id: "g1", type: 0 });
      }
      return new Response("not found", { status: 404 });
    };

    const res = await resolveDiscordChannelAllowlist({
      token: "test",
      entries: ["123"],
      fetcher,
    });

    expect(res[0]?.resolved).toBe(true);
    expect(res[0]?.guildId).toBe("g1");
    expect(res[0]?.channelId).toBe("123");
  });
});
