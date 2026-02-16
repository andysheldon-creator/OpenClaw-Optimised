import { describe, expect, it } from "vitest";

import {
  boardSessionKey,
  extractRoleFromSessionKey,
  isBoardSessionKey,
} from "./session-keys.js";

describe("boardSessionKey", () => {
  it("general agent keeps original key for direct chats", () => {
    expect(boardSessionKey("main", "general")).toBe("main");
  });

  it("other agents get board-prefixed keys for direct chats", () => {
    expect(boardSessionKey("main", "finance")).toBe("board:finance");
    expect(boardSessionKey("main", "research")).toBe("board:research");
    expect(boardSessionKey("main", "critic")).toBe("board:critic");
  });

  it("group keys get board prefix with group suffix", () => {
    expect(boardSessionKey("group:12345", "finance")).toBe(
      "board:finance:group:12345",
    );
    expect(boardSessionKey("group:12345", "general")).toBe(
      "board:general:group:12345",
    );
  });

  it("handles surface:group: style keys", () => {
    expect(boardSessionKey("telegram:group:12345", "research")).toBe(
      "board:research:telegram:group:12345",
    );
  });

  it("handles surface:channel: style keys", () => {
    expect(boardSessionKey("discord:channel:abc", "strategy")).toBe(
      "board:strategy:discord:channel:abc",
    );
  });

  it("handles g- prefixed keys", () => {
    expect(boardSessionKey("g-my-group", "content")).toBe(
      "board:content:g-my-group",
    );
  });
});

describe("extractRoleFromSessionKey", () => {
  it("extracts role from board session key", () => {
    expect(extractRoleFromSessionKey("board:finance")).toBe("finance");
    expect(extractRoleFromSessionKey("board:research")).toBe("research");
    expect(extractRoleFromSessionKey("board:general")).toBe("general");
  });

  it("extracts role from group board session key", () => {
    expect(extractRoleFromSessionKey("board:critic:group:12345")).toBe(
      "critic",
    );
  });

  it("returns undefined for non-board keys", () => {
    expect(extractRoleFromSessionKey("main")).toBeUndefined();
    expect(extractRoleFromSessionKey("group:12345")).toBeUndefined();
    expect(extractRoleFromSessionKey("global")).toBeUndefined();
  });

  it("returns undefined for invalid roles", () => {
    expect(extractRoleFromSessionKey("board:unknown")).toBeUndefined();
  });
});

describe("isBoardSessionKey", () => {
  it("returns true for board keys", () => {
    expect(isBoardSessionKey("board:finance")).toBe(true);
    expect(isBoardSessionKey("board:general:group:123")).toBe(true);
  });

  it("returns false for non-board keys", () => {
    expect(isBoardSessionKey("main")).toBe(false);
    expect(isBoardSessionKey("group:123")).toBe(false);
    expect(isBoardSessionKey("boardroom")).toBe(false);
  });
});
