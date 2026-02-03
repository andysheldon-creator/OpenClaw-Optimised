import { describe, expect, test } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { shouldRefreshSessionDescription } from "./session-description.js";

describe("session description", () => {
  test("does not refresh when there are no turns yet", () => {
    const entry: SessionEntry = { sessionId: "s", updatedAt: 1 };
    expect(shouldRefreshSessionDescription(entry, Date.now())).toBe(false);
  });

  test("refreshes when missing description and has turns", () => {
    const entry: SessionEntry = { sessionId: "s", updatedAt: 1, turnCount: 1 };
    expect(shouldRefreshSessionDescription(entry, Date.now())).toBe(true);
  });

  test("does not refresh when description is recent", () => {
    const now = Date.now();
    const entry: SessionEntry = {
      sessionId: "s",
      updatedAt: 1,
      turnCount: 20,
      description: "Working on gateway sessions UI",
      descriptionTurnCount: 12,
      descriptionUpdatedAt: now - 60_000,
    };
    expect(shouldRefreshSessionDescription(entry, now)).toBe(false);
  });

  test("refreshes when enough turns and age have passed", () => {
    const now = Date.now();
    const entry: SessionEntry = {
      sessionId: "s",
      updatedAt: 1,
      turnCount: 20,
      description: "Working on gateway sessions UI",
      descriptionTurnCount: 10,
      descriptionUpdatedAt: now - 60 * 60_000,
    };
    expect(shouldRefreshSessionDescription(entry, now)).toBe(true);
  });
});
