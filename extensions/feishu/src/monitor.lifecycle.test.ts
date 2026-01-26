import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import type { ClawdbotConfig, PluginRuntime } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./accounts.js";
import { startFeishuMonitor, handleFeishuWebhookRequest } from "./monitor.js";
import { setFeishuRuntime } from "./runtime.js";

async function withServer(
  handler: Parameters<typeof createServer>[0],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("missing server address");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Feishu monitor lifecycle", () => {
  it("unregisters webhook targets on abort", async () => {
    const core = { logging: { shouldLogVerbose: () => false } } as unknown as PluginRuntime;
    setFeishuRuntime(core);

    const account: ResolvedFeishuAccount = {
      accountId: "default",
      enabled: true,
      config: { mode: "http", verificationToken: "vtok" },
      credentialSource: "config",
    };
    const abort = new AbortController();
    const error = vi.fn();

    const monitorTask = startFeishuMonitor({
      account,
      config: {} as ClawdbotConfig,
      runtime: { error },
      abortSignal: abort.signal,
      webhookPath: "/hook",
    });

    await withServer(
      async (req, res) => {
        const handled = await handleFeishuWebhookRequest(req, res);
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      },
      async (baseUrl) => {
        const payload = { token: "vtok", challenge: "abc", type: "url_verification" };
        const response = await fetch(`${baseUrl}/hook`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        expect(response.status).toBe(200);

        abort.abort();
        await monitorTask;

        const response2 = await fetch(`${baseUrl}/hook`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        expect(response2.status).toBe(404);
      },
    );

    expect(error).not.toHaveBeenCalled();
  });
});
