import { describe, expect, it } from "vitest";
import {
  listBlueskyAccountIds,
  resolveBlueskyAccount,
  resolveDefaultBlueskyAccountId,
} from "./types.js";

const makeConfig = (bluesky?: Record<string, unknown>) =>
  ({ channels: bluesky ? { bluesky } : {} }) as never;

describe("listBlueskyAccountIds", () => {
  it("returns empty when no config", () => {
    expect(listBlueskyAccountIds(makeConfig())).toEqual([]);
  });

  it("returns empty when identifier missing", () => {
    expect(listBlueskyAccountIds(makeConfig({ appPassword: "xxx" }))).toEqual([]);
  });

  it("returns empty when appPassword missing", () => {
    expect(listBlueskyAccountIds(makeConfig({ identifier: "user.bsky.social" }))).toEqual([]);
  });

  it("returns default when both identifier and appPassword are set", () => {
    expect(
      listBlueskyAccountIds(
        makeConfig({ identifier: "user.bsky.social", appPassword: "app-pass-1234" }),
      ),
    ).toEqual(["default"]);
  });
});

describe("resolveDefaultBlueskyAccountId", () => {
  it("returns default when configured", () => {
    expect(
      resolveDefaultBlueskyAccountId(
        makeConfig({ identifier: "user.bsky.social", appPassword: "app-pass-1234" }),
      ),
    ).toBe("default");
  });

  it("returns default when not configured", () => {
    expect(resolveDefaultBlueskyAccountId(makeConfig())).toBe("default");
  });
});

describe("resolveBlueskyAccount", () => {
  it("resolves configured account", () => {
    const account = resolveBlueskyAccount({
      cfg: makeConfig({
        identifier: "user.bsky.social",
        appPassword: "app-pass-1234",
        service: "https://custom-pds.example.com",
        pollInterval: 10000,
      }),
    });

    expect(account.configured).toBe(true);
    expect(account.enabled).toBe(true);
    expect(account.identifier).toBe("user.bsky.social");
    expect(account.appPassword).toBe("app-pass-1234");
    expect(account.service).toBe("https://custom-pds.example.com");
    expect(account.pollInterval).toBe(10000);
  });

  it("resolves unconfigured account with defaults", () => {
    const account = resolveBlueskyAccount({ cfg: makeConfig() });

    expect(account.configured).toBe(false);
    expect(account.enabled).toBe(true);
    expect(account.identifier).toBe("");
    expect(account.service).toBe("https://bsky.social");
    expect(account.pollInterval).toBe(5000);
  });

  it("respects enabled: false", () => {
    const account = resolveBlueskyAccount({
      cfg: makeConfig({
        identifier: "user.bsky.social",
        appPassword: "app-pass-1234",
        enabled: false,
      }),
    });

    expect(account.configured).toBe(true);
    expect(account.enabled).toBe(false);
  });
});
