import { afterEach, describe, expect, it } from "vitest";
import {
  addFavorite,
  clearFavorites,
  getFavoriteIds,
  isFavorite,
  removeFavorite,
  toggleFavorite,
} from "./command-favorites";

describe("command-favorites", () => {
  afterEach(() => {
    clearFavorites();
  });

  // ---------------------------------------------------------------------------
  // addFavorite / isFavorite
  // ---------------------------------------------------------------------------
  describe("addFavorite", () => {
    it("adds a command to favorites", () => {
      addFavorite("nav-chat");
      expect(isFavorite("nav-chat")).toBe(true);
    });

    it("does not duplicate an already-favorited command", () => {
      addFavorite("nav-chat");
      addFavorite("nav-chat");
      expect(getFavoriteIds()).toEqual(["nav-chat"]);
    });

    it("preserves insertion order", () => {
      addFavorite("a");
      addFavorite("b");
      addFavorite("c");
      expect(getFavoriteIds()).toEqual(["a", "b", "c"]);
    });
  });

  // ---------------------------------------------------------------------------
  // removeFavorite
  // ---------------------------------------------------------------------------
  describe("removeFavorite", () => {
    it("removes a favorited command", () => {
      addFavorite("nav-chat");
      removeFavorite("nav-chat");
      expect(isFavorite("nav-chat")).toBe(false);
      expect(getFavoriteIds()).toEqual([]);
    });

    it("is a no-op for non-favorited commands", () => {
      addFavorite("a");
      removeFavorite("b");
      expect(getFavoriteIds()).toEqual(["a"]);
    });

    it("preserves order of remaining favorites", () => {
      addFavorite("a");
      addFavorite("b");
      addFavorite("c");
      removeFavorite("b");
      expect(getFavoriteIds()).toEqual(["a", "c"]);
    });
  });

  // ---------------------------------------------------------------------------
  // toggleFavorite
  // ---------------------------------------------------------------------------
  describe("toggleFavorite", () => {
    it("adds and returns true when not favorited", () => {
      const result = toggleFavorite("nav-chat");
      expect(result).toBe(true);
      expect(isFavorite("nav-chat")).toBe(true);
    });

    it("removes and returns false when already favorited", () => {
      addFavorite("nav-chat");
      const result = toggleFavorite("nav-chat");
      expect(result).toBe(false);
      expect(isFavorite("nav-chat")).toBe(false);
    });

    it("toggles back and forth", () => {
      expect(toggleFavorite("x")).toBe(true);
      expect(toggleFavorite("x")).toBe(false);
      expect(toggleFavorite("x")).toBe(true);
      expect(isFavorite("x")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // isFavorite
  // ---------------------------------------------------------------------------
  describe("isFavorite", () => {
    it("returns false for unknown commands", () => {
      expect(isFavorite("unknown")).toBe(false);
    });

    it("returns true for favorited commands", () => {
      addFavorite("nav-chat");
      expect(isFavorite("nav-chat")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getFavoriteIds
  // ---------------------------------------------------------------------------
  describe("getFavoriteIds", () => {
    it("returns empty array when no favorites exist", () => {
      expect(getFavoriteIds()).toEqual([]);
    });

    it("returns all favorited IDs in insertion order", () => {
      addFavorite("c");
      addFavorite("a");
      addFavorite("b");
      expect(getFavoriteIds()).toEqual(["c", "a", "b"]);
    });
  });

  // ---------------------------------------------------------------------------
  // clearFavorites
  // ---------------------------------------------------------------------------
  describe("clearFavorites", () => {
    it("removes all favorites", () => {
      addFavorite("a");
      addFavorite("b");
      clearFavorites();
      expect(getFavoriteIds()).toEqual([]);
      expect(isFavorite("a")).toBe(false);
    });

    it("is safe when already empty", () => {
      clearFavorites();
      expect(getFavoriteIds()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Resilience
  // ---------------------------------------------------------------------------
  describe("resilience", () => {
    it("recovers from corrupted localStorage data", () => {
      localStorage.setItem("clawdbrain:command-favorites", "{{bad json");
      expect(getFavoriteIds()).toEqual([]);
      expect(isFavorite("x")).toBe(false);
      // Should still work after corruption
      addFavorite("x");
      expect(isFavorite("x")).toBe(true);
    });

    it("recovers from non-array localStorage data", () => {
      localStorage.setItem("clawdbrain:command-favorites", '"hello"');
      expect(getFavoriteIds()).toEqual([]);
    });

    it("filters out non-string entries", () => {
      localStorage.setItem("clawdbrain:command-favorites", JSON.stringify(["a", 42, null, "b"]));
      expect(getFavoriteIds()).toEqual(["a", "b"]);
    });
  });
});
