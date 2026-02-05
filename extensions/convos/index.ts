import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema, renderQrPngBase64 } from "openclaw/plugin-sdk";
import { convosPlugin } from "./src/channel.js";
import { getConvosRuntime, setConvosRuntime } from "./src/runtime.js";
import { setupConvosWithInvite } from "./src/setup.js";
import type { ConvosSDKClient } from "./src/sdk-client.js";

// Module-level state for setup agent (accepts join requests during setup flow)
let setupAgent: ConvosSDKClient | null = null;
let setupJoinState = { joined: false, joinerInboxId: null as string | null };
let setupCleanupTimer: ReturnType<typeof setTimeout> | null = null;

// Deferred config: stored after setup, written on convos.setup.complete
let setupResult: {
  privateKey: string;
  conversationId: string;
  env: "production" | "dev";
  accountId?: string;
} | null = null;

async function cleanupSetupAgent() {
  if (setupCleanupTimer) {
    clearTimeout(setupCleanupTimer);
    setupCleanupTimer = null;
  }
  if (setupAgent) {
    try {
      await setupAgent.stop();
    } catch {
      // Ignore cleanup errors
    }
    setupAgent = null;
  }
}

// --- Core handlers shared by WebSocket gateway methods and HTTP routes ---

async function handleSetup(params: {
  accountId?: string;
  env?: "production" | "dev";
  name?: string;
}) {
  await cleanupSetupAgent();
  setupJoinState = { joined: false, joinerInboxId: null };

  const result = await setupConvosWithInvite({
    accountId: params.accountId,
    env: params.env,
    name: params.name,
    keepRunning: true,
    onInvite: async (ctx) => {
      console.log(`[convos-setup] Join request from ${ctx.joinerInboxId}`);
      try {
        await ctx.accept();
        setupJoinState = { joined: true, joinerInboxId: ctx.joinerInboxId };
        console.log(`[convos-setup] Accepted join from ${ctx.joinerInboxId}`);
      } catch (err) {
        console.error(`[convos-setup] Failed to accept join:`, err);
      }
    },
  });

  if (result.client) {
    setupAgent = result.client;
    console.log("[convos-setup] Agent kept running to accept join requests");
    setupCleanupTimer = setTimeout(async () => {
      console.log("[convos-setup] Timeout - stopping setup agent");
      setupResult = null;
      await cleanupSetupAgent();
    }, 10 * 60 * 1000);
  }

  setupResult = {
    privateKey: result.privateKey,
    conversationId: result.conversationId,
    env: params.env ?? "production",
    accountId: params.accountId,
  };

  const qrBase64 = await renderQrPngBase64(result.inviteUrl);

  return {
    inviteUrl: result.inviteUrl,
    conversationId: result.conversationId,
    qrDataUrl: `data:image/png;base64,${qrBase64}`,
  };
}

function handleStatus() {
  return {
    active: setupAgent !== null,
    joined: setupJoinState.joined,
    joinerInboxId: setupJoinState.joinerInboxId,
  };
}

async function handleComplete() {
  if (!setupResult) {
    throw new Error("No active setup to complete. Run convos.setup first.");
  }

  const runtime = getConvosRuntime();
  const cfg = runtime.config.loadConfig() as OpenClawConfig;

  const channels = (cfg as Record<string, unknown>).channels as
    | Record<string, unknown>
    | undefined;
  if (!channels) {
    (cfg as Record<string, unknown>).channels = {};
  }
  const convosSection =
    ((cfg as Record<string, unknown>).channels as Record<string, unknown>).convos ?? {};
  const convos = convosSection as Record<string, unknown>;

  convos.privateKey = setupResult.privateKey;
  convos.ownerConversationId = setupResult.conversationId;
  convos.env = setupResult.env;
  convos.enabled = true;

  ((cfg as Record<string, unknown>).channels as Record<string, unknown>).convos = convos;

  await runtime.config.writeConfigFile(cfg);
  console.log("[convos-setup] Config saved successfully");

  const saved = { ...setupResult };
  setupResult = null;
  await cleanupSetupAgent();

  return { saved: true, conversationId: saved.conversationId };
}

// --- HTTP helpers ---

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString();
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// --- Plugin ---

const plugin = {
  id: "convos",
  name: "Convos",
  description: "E2E encrypted messaging via XMTP",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setConvosRuntime(api.runtime);
    api.registerChannel({ plugin: convosPlugin });

    // ---- WebSocket gateway methods (for Control UI) ----

    api.registerGatewayMethod("convos.setup", async ({ params, respond }) => {
      try {
        const p = params as Record<string, unknown>;
        const result = await handleSetup({
          accountId: typeof p.accountId === "string" ? p.accountId : undefined,
          env: typeof p.env === "string" ? (p.env as "production" | "dev") : undefined,
          name: typeof p.name === "string" ? p.name : undefined,
        });
        respond(true, result, undefined);
      } catch (err) {
        await cleanupSetupAgent();
        respond(false, undefined, {
          code: -1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    api.registerGatewayMethod("convos.setup.status", async ({ respond }) => {
      respond(true, handleStatus(), undefined);
    });

    api.registerGatewayMethod("convos.setup.complete", async ({ respond }) => {
      try {
        const result = await handleComplete();
        respond(true, result, undefined);
      } catch (err) {
        respond(false, undefined, {
          code: -1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ---- HTTP routes (for Railway template and other HTTP clients) ----

    api.registerHttpRoute({
      path: "/convos/setup",
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req);
          const result = await handleSetup({
            accountId: typeof body.accountId === "string" ? body.accountId : undefined,
            env: typeof body.env === "string" ? (body.env as "production" | "dev") : undefined,
            name: typeof body.name === "string" ? body.name : undefined,
          });
          jsonResponse(res, 200, result);
        } catch (err) {
          await cleanupSetupAgent();
          jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      },
    });

    api.registerHttpRoute({
      path: "/convos/setup/status",
      handler: async (_req, res) => {
        jsonResponse(res, 200, handleStatus());
      },
    });

    api.registerHttpRoute({
      path: "/convos/setup/complete",
      handler: async (_req, res) => {
        try {
          const result = await handleComplete();
          jsonResponse(res, 200, result);
        } catch (err) {
          jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      },
    });
  },
};

export default plugin;
