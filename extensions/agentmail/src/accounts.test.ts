import { describe, expect, it } from "vitest";

import {
  listAgentMailAccountIds,
  resolveAgentMailAccount,
  resolveCredentials,
  resolveDefaultAgentMailAccountId,
} from "./accounts.js";
import type { CoreConfig } from "./utils.js";

describe("resolveCredentials", () => {
  it("resolves from config", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          token: "am_config_token",
          emailAddress: "inbox@agentmail.to",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.apiKey).toBe("am_config_token");
    expect(result.inboxId).toBe("inbox@agentmail.to");
    expect(result.webhookPath).toBe("/webhooks/agentmail");
  });

  it("falls back to environment variables", () => {
    const cfg: CoreConfig = {};
    const env = {
      AGENTMAIL_TOKEN: "am_env_token",
      AGENTMAIL_EMAIL_ADDRESS: "env@agentmail.to",
    };
    const result = resolveCredentials(cfg, env);
    expect(result.apiKey).toBe("am_env_token");
    expect(result.inboxId).toBe("env@agentmail.to");
  });

  it("config takes precedence over env", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          token: "am_config_token",
          emailAddress: "config@agentmail.to",
        },
      },
    };
    const env = {
      AGENTMAIL_TOKEN: "am_env_token",
      AGENTMAIL_EMAIL_ADDRESS: "env@agentmail.to",
    };
    const result = resolveCredentials(cfg, env);
    expect(result.apiKey).toBe("am_config_token");
    expect(result.inboxId).toBe("config@agentmail.to");
  });

  it("resolves custom webhookPath from config", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          webhookPath: "/custom/path",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.webhookPath).toBe("/custom/path");
  });

  it("resolves webhookPath from env", () => {
    const cfg: CoreConfig = {};
    const env = {
      AGENTMAIL_WEBHOOK_PATH: "/env/webhook",
    };
    const result = resolveCredentials(cfg, env);
    expect(result.webhookPath).toBe("/env/webhook");
  });

  it("returns undefined for missing credentials", () => {
    const cfg: CoreConfig = {};
    const result = resolveCredentials(cfg, {});
    expect(result.apiKey).toBeUndefined();
    expect(result.inboxId).toBeUndefined();
  });

  it("resolves webhookUrl from config", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          webhookUrl: "https://my-gateway.ngrok.io",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.webhookUrl).toBe("https://my-gateway.ngrok.io");
  });

  it("resolves webhookUrl from env", () => {
    const cfg: CoreConfig = {};
    const env = {
      AGENTMAIL_WEBHOOK_URL: "https://env-gateway.example.com/hooks/email",
    };
    const result = resolveCredentials(cfg, env);
    expect(result.webhookUrl).toBe("https://env-gateway.example.com/hooks/email");
  });

  it("derives webhookPath from webhookUrl", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          webhookUrl: "https://my-gateway.ngrok.io/custom/path",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.webhookPath).toBe("/custom/path");
  });

  it("uses default webhookPath when URL has no path", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          webhookUrl: "https://my-gateway.ngrok.io",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.webhookPath).toBe("/webhooks/agentmail");
  });

  it("explicit webhookPath takes precedence over URL-derived path", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          webhookUrl: "https://my-gateway.ngrok.io/url-path",
          webhookPath: "/explicit-path",
        },
      },
    };
    const result = resolveCredentials(cfg, {});
    expect(result.webhookPath).toBe("/explicit-path");
  });
});

describe("resolveAgentMailAccount", () => {
  it("resolves configured account", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          name: "My Email",
          enabled: true,
          token: "am_token",
          emailAddress: "inbox@agentmail.to",
        },
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.accountId).toBe("default");
    expect(result.name).toBe("My Email");
    expect(result.enabled).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.inboxId).toBe("inbox@agentmail.to");
  });

  it("returns configured=false when missing token", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          emailAddress: "inbox@agentmail.to",
        },
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.configured).toBe(false);
  });

  it("returns configured=false when missing emailAddress", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          token: "am_token",
        },
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.configured).toBe(false);
  });

  it("defaults enabled to true", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {},
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.enabled).toBe(true);
  });

  it("respects enabled=false", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          enabled: false,
        },
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.enabled).toBe(false);
  });

  it("trims name whitespace", () => {
    const cfg: CoreConfig = {
      channels: {
        agentmail: {
          name: "  Trimmed Name  ",
        },
      },
    };
    const result = resolveAgentMailAccount({ cfg });
    expect(result.name).toBe("Trimmed Name");
  });
});

describe("listAgentMailAccountIds", () => {
  it("returns default account", () => {
    const cfg: CoreConfig = {};
    const result = listAgentMailAccountIds(cfg);
    expect(result).toEqual(["default"]);
  });
});

describe("resolveDefaultAgentMailAccountId", () => {
  it("returns default account id", () => {
    const cfg: CoreConfig = {};
    const result = resolveDefaultAgentMailAccountId(cfg);
    expect(result).toBe("default");
  });
});
