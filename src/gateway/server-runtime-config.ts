import type {
  GatewayAuthConfig,
  GatewayBindMode,
  GatewayTailscaleConfig,
  loadConfig,
} from "../config/config.js";
import {
  assertGatewayAuthConfigured,
  generateSecureGatewayToken,
  type ResolvedGatewayAuth,
  resolveGatewayAuth,
} from "./auth.js";
import { normalizeControlUiBasePath } from "./control-ui-shared.js";
import { resolveHooksConfig } from "./hooks.js";
import { isLoopbackHost, resolveGatewayBindHost } from "./net.js";

export type GatewayRuntimeConfig = {
  bindHost: string;
  controlUiEnabled: boolean;
  openAiChatCompletionsEnabled: boolean;
  openResponsesEnabled: boolean;
  openResponsesConfig?: import("../config/types.gateway.js").GatewayHttpResponsesConfig;
  controlUiBasePath: string;
  resolvedAuth: ResolvedGatewayAuth;
  authMode: ResolvedGatewayAuth["mode"];
  tailscaleConfig: GatewayTailscaleConfig;
  tailscaleMode: "off" | "serve" | "funnel";
  hooksConfig: ReturnType<typeof resolveHooksConfig>;
  canvasHostEnabled: boolean;
};

export async function resolveGatewayRuntimeConfig(params: {
  cfg: ReturnType<typeof loadConfig>;
  port: number;
  bind?: GatewayBindMode;
  host?: string;
  controlUiEnabled?: boolean;
  openAiChatCompletionsEnabled?: boolean;
  openResponsesEnabled?: boolean;
  auth?: GatewayAuthConfig;
  tailscale?: GatewayTailscaleConfig;
}): Promise<GatewayRuntimeConfig> {
  const bindMode = params.bind ?? params.cfg.gateway?.bind ?? "loopback";
  const customBindHost = params.cfg.gateway?.customBindHost;
  const bindHost = params.host ?? (await resolveGatewayBindHost(bindMode, customBindHost));
  const controlUiEnabled =
    params.controlUiEnabled ?? params.cfg.gateway?.controlUi?.enabled ?? true;
  const openAiChatCompletionsEnabled =
    params.openAiChatCompletionsEnabled ??
    params.cfg.gateway?.http?.endpoints?.chatCompletions?.enabled ??
    false;
  const openResponsesConfig = params.cfg.gateway?.http?.endpoints?.responses;
  const openResponsesEnabled = params.openResponsesEnabled ?? openResponsesConfig?.enabled ?? false;
  const controlUiBasePath = normalizeControlUiBasePath(params.cfg.gateway?.controlUi?.basePath);
  const authBase = params.cfg.gateway?.auth ?? {};
  const authOverrides = params.auth ?? {};
  const authConfig = {
    ...authBase,
    ...authOverrides,
  };
  const tailscaleBase = params.cfg.gateway?.tailscale ?? {};
  const tailscaleOverrides = params.tailscale ?? {};
  const tailscaleConfig = {
    ...tailscaleBase,
    ...tailscaleOverrides,
  };
  const tailscaleMode = tailscaleConfig.mode ?? "off";
  const resolvedAuth = resolveGatewayAuth({
    authConfig,
    env: process.env,
    tailscaleMode,
  });
  const authMode: ResolvedGatewayAuth["mode"] = resolvedAuth.mode;
  const hasToken = typeof resolvedAuth.token === "string" && resolvedAuth.token.trim().length > 0;
  const hasPassword =
    typeof resolvedAuth.password === "string" && resolvedAuth.password.trim().length > 0;
  const hasSharedSecret =
    (authMode === "token" && hasToken) || (authMode === "password" && hasPassword);
  const hooksConfig = resolveHooksConfig(params.cfg);
  const canvasHostEnabled =
    process.env.OPENCLAW_SKIP_CANVAS_HOST !== "1" && params.cfg.canvasHost?.enabled !== false;

  assertGatewayAuthConfigured(resolvedAuth);
  if (tailscaleMode === "funnel" && authMode !== "password") {
    throw new Error(
      "tailscale funnel requires gateway auth mode=password (set gateway.auth.password or OPENCLAW_GATEWAY_PASSWORD)",
    );
  }
  if (tailscaleMode !== "off" && !isLoopbackHost(bindHost)) {
    throw new Error("tailscale serve/funnel requires gateway bind=loopback (127.0.0.1)");
  }
  // Auto-generate secure token for external binds lacking auth (Issue #1971)
  if (!isLoopbackHost(bindHost) && !hasSharedSecret) {
    const autoToken = generateSecureGatewayToken();
    resolvedAuth.token = autoToken;
    resolvedAuth.mode = "token";

    // Persist the auto-generated token to config
    try {
      const { writeConfigFile } = await import("../config/config.js");
      const existingConfig = params.cfg;
      await writeConfigFile({
        ...existingConfig,
        gateway: {
          ...existingConfig.gateway,
          auth: {
            ...existingConfig.gateway?.auth,
            mode: "token",
            token: autoToken,
          },
        },
      });

      console.warn(`
🔒 SECURITY AUTO-CONFIG: Gateway requires authentication for external access.
   A secure token has been automatically generated and saved to your config.

   Token: ${autoToken.slice(0, 16)}... (64 chars total, protect your config file)

   To connect clients, use:
     openclaw pairing approve <channel> --token ${autoToken.slice(0, 8)}...

   Or set environment variable:
     export OPENCLAW_GATEWAY_TOKEN=${autoToken}

   See: https://github.com/openclaw/openclaw/blob/main/SECURITY.md
      `);
    } catch (e) {
      // If we can't save config, still use the token for this session
      console.warn("Could not persist auto-generated token to config:", e);
    }
  }

  // SECURITY: Warn when binding to external interfaces even with auth
  // Issue #1971: ~900+ exposed instances detected on Shodan
  if (!isLoopbackHost(bindHost) && hasSharedSecret) {
    const isWeakToken = authMode === "token" && (resolvedAuth.token?.length ?? 0) < 32;
    const isWeakPassword = authMode === "password" && (resolvedAuth.password?.length ?? 0) < 12;

    if (isWeakToken || isWeakPassword) {
      throw new Error(
        `SECURITY: Gateway binding to ${bindHost}:${params.port} requires strong auth. ` +
        `Token must be >=32 chars, password >=12 chars. ` +
        `This check protects against brute force attacks on exposed gateways.`
      );
    }

    // Log security warning (this will be visible in logs)
    console.warn(`
⚠️  SECURITY NOTICE: Gateway is binding to ${bindHost}:${params.port}
   This exposes the gateway to the network. Ensure:
   - Firewall is configured (block port ${params.port} from untrusted networks)
   - Auth token/password is strong and rotated regularly
   - Consider using Cloudflare Tunnel or Tailscale instead of direct exposure
   - See: https://github.com/openclaw/openclaw/blob/main/docs/security.md

   Detected ${900}+ exposed OpenClaw instances on Shodan. Don't be one of them.
    `);
  }

  return {
    bindHost,
    controlUiEnabled,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig: openResponsesConfig
      ? { ...openResponsesConfig, enabled: openResponsesEnabled }
      : undefined,
    controlUiBasePath,
    resolvedAuth,
    authMode,
    tailscaleConfig,
    tailscaleMode,
    hooksConfig,
    canvasHostEnabled,
  };
}
