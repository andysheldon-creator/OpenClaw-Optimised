import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { isKeychainReference, resolveSecret } from "./keychain.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("keychain", () => {
  describe("isKeychainReference", () => {
    it("identifies keychain references", () => {
      expect(isKeychainReference("@keychain:openai")).toBe(true);
      expect(isKeychainReference("sk-123")).toBe(false);
      expect(isKeychainReference(undefined)).toBe(false);
    });
  });

  describe("resolveSecret", () => {
    it("returns plain strings as-is", () => {
      expect(resolveSecret("sk-123")).toBe("sk-123");
    });

    it("resolves @keychain reference via system command", () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("real-api-key\n"));

      const result = resolveSecret("@keychain:my-service");
      expect(result).toBe("real-api-key");
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("security find-generic-password -s 'my-service' -w"),
        expect.anything(),
      );
    });

    it("falls back to reference string if system command fails", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("Not found");
      });

      const result = resolveSecret("@keychain:non-existent");
      expect(result).toBe("@keychain:non-existent");
    });
  });
});
