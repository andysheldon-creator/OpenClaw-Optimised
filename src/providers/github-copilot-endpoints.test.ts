import { describe, expect, it } from "vitest";
import { resolveGitHubCopilotEndpoints, isGitHubDotCom } from "./github-copilot-endpoints.js";

describe("resolveGitHubCopilotEndpoints", () => {
  it("returns github.com defaults when no host provided", () => {
    const ep = resolveGitHubCopilotEndpoints();
    expect(ep.host).toBe("github.com");
    expect(ep.clientId).toBe("Iv1.b507a08c87ecfe98");
    expect(ep.deviceCodeUrl).toBe("https://github.com/login/device/code");
    expect(ep.accessTokenUrl).toBe("https://github.com/login/oauth/access_token");
    expect(ep.copilotTokenUrl).toBe("https://api.github.com/copilot_internal/v2/token");
    expect(ep.copilotUserUrl).toBe("https://api.github.com/copilot_internal/user");
    expect(ep.defaultCopilotApiBaseUrl).toBe("https://api.individual.githubcopilot.com");
  });

  it("returns github.com defaults for explicit 'github.com'", () => {
    const ep = resolveGitHubCopilotEndpoints("github.com");
    expect(ep.host).toBe("github.com");
    expect(ep.copilotTokenUrl).toBe("https://api.github.com/copilot_internal/v2/token");
    expect(ep.defaultCopilotApiBaseUrl).toBe("https://api.individual.githubcopilot.com");
  });

  it("derives GHE Cloud data residency endpoints from host", () => {
    const ep = resolveGitHubCopilotEndpoints("myorg.ghe.com");
    expect(ep.host).toBe("myorg.ghe.com");
    expect(ep.clientId).toBe("Iv1.b507a08c87ecfe98");
    expect(ep.deviceCodeUrl).toBe("https://myorg.ghe.com/login/device/code");
    expect(ep.accessTokenUrl).toBe("https://myorg.ghe.com/login/oauth/access_token");
    expect(ep.copilotTokenUrl).toBe("https://api.myorg.ghe.com/copilot_internal/v2/token");
    expect(ep.copilotUserUrl).toBe("https://api.myorg.ghe.com/copilot_internal/user");
    expect(ep.defaultCopilotApiBaseUrl).toBe("https://copilot-api.myorg.ghe.com");
  });

  it("allows overriding the client ID", () => {
    const ep = resolveGitHubCopilotEndpoints("myorg.ghe.com", "Iv1.custom");
    expect(ep.clientId).toBe("Iv1.custom");
  });

  it("trims whitespace from host", () => {
    const ep = resolveGitHubCopilotEndpoints("  myorg.ghe.com  ");
    expect(ep.host).toBe("myorg.ghe.com");
  });

  it("treats empty string as github.com", () => {
    const ep = resolveGitHubCopilotEndpoints("");
    expect(ep.host).toBe("github.com");
    expect(ep.defaultCopilotApiBaseUrl).toBe("https://api.individual.githubcopilot.com");
  });
});

describe("isGitHubDotCom", () => {
  it("returns true for github.com", () => {
    expect(isGitHubDotCom("github.com")).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isGitHubDotCom("")).toBe(true);
  });

  it("returns false for GHE Cloud host", () => {
    expect(isGitHubDotCom("myorg.ghe.com")).toBe(false);
  });
});
