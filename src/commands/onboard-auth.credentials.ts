import type { OAuthCredentials } from "@mariozechner/pi-ai";
import fs from "node:fs";
import path from "node:path";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { resolveStateDir } from "../config/paths.js";
export { CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF } from "../agents/cloudflare-ai-gateway.js";

const resolveAuthAgentDir = (agentDir?: string) => agentDir ?? resolveOpenClawAgentDir();

export type WriteOAuthCredentialsOptions = {
  syncSiblingAgents?: boolean;
};

function resolveSiblingAgentDirs(primaryAgentDir: string): string[] {
  const normalized = path.resolve(primaryAgentDir);

  // Derive agentsRoot from primaryAgentDir when it matches the standard
  // layout (.../agents/<name>/agent). Falls back to global state dir.
  const parentOfAgent = path.dirname(normalized);
  const candidateAgentsRoot = path.dirname(parentOfAgent);
  const looksLikeStandardLayout =
    path.basename(normalized) === "agent" && path.basename(candidateAgentsRoot) === "agents";

  const agentsRoot = looksLikeStandardLayout
    ? candidateAgentsRoot
    : path.join(resolveStateDir(), "agents");

  const entries = (() => {
    try {
      return fs.readdirSync(agentsRoot, { withFileTypes: true });
    } catch {
      return [];
    }
  })();
  const discovered = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(agentsRoot, entry.name, "agent"));

  const candidateDirs = [...new Set<string>([normalized, ...discovered])];

  return candidateDirs.filter((dir) => {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

export function writeOAuthCredentials(
  provider: string,
  creds: OAuthCredentials,
  agentDir?: string,
  options?: WriteOAuthCredentialsOptions,
): void {
  const email =
    typeof creds.email === "string" && creds.email.trim() ? creds.email.trim() : "default";
  const resolvedAgentDir = path.resolve(resolveAuthAgentDir(agentDir));
  const targetAgentDirs = options?.syncSiblingAgents
    ? resolveSiblingAgentDirs(resolvedAgentDir)
    : [resolvedAgentDir];

  const credential = {
    type: "oauth" as const,
    provider,
    ...creds,
  };

  // Primary write must succeed — let it throw on failure.
  upsertAuthProfile({
    profileId: `${provider}:${email}`,
    credential,
    agentDir: resolvedAgentDir,
  });

  // Sibling sync is best-effort — ignore individual failures.
  if (options?.syncSiblingAgents) {
    for (const targetAgentDir of targetAgentDirs) {
      if (targetAgentDir === resolvedAgentDir) {
        continue;
      }
      try {
        upsertAuthProfile({
          profileId: `${provider}:${email}`,
          credential,
          agentDir: targetAgentDir,
        });
      } catch {
        // Ignore sibling sync failures so primary onboarding can continue.
      }
    }
  }
}

export async function setAnthropicApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "anthropic:default",
    credential: {
      type: "api_key",
      provider: "anthropic",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setGeminiApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "google:default",
    credential: {
      type: "api_key",
      provider: "google",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setMinimaxApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "minimax:default",
    credential: {
      type: "api_key",
      provider: "minimax",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setMoonshotApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "moonshot:default",
    credential: {
      type: "api_key",
      provider: "moonshot",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setKimiCodingApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "kimi-coding:default",
    credential: {
      type: "api_key",
      provider: "kimi-coding",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setSyntheticApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "synthetic:default",
    credential: {
      type: "api_key",
      provider: "synthetic",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setVeniceApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "venice:default",
    credential: {
      type: "api_key",
      provider: "venice",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export const ZAI_DEFAULT_MODEL_REF = "zai/glm-4.7";
export const XIAOMI_DEFAULT_MODEL_REF = "xiaomi/mimo-v2-flash";
export const OPENROUTER_DEFAULT_MODEL_REF = "openrouter/auto";
export const VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF = "vercel-ai-gateway/anthropic/claude-opus-4.5";

export async function setZaiApiKey(key: string, agentDir?: string) {
  // Write to resolved agent dir so gateway finds credentials on startup.
  upsertAuthProfile({
    profileId: "zai:default",
    credential: {
      type: "api_key",
      provider: "zai",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setXiaomiApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "xiaomi:default",
    credential: {
      type: "api_key",
      provider: "xiaomi",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setOpenrouterApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "openrouter:default",
    credential: {
      type: "api_key",
      provider: "openrouter",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setCloudflareAiGatewayConfig(
  accountId: string,
  gatewayId: string,
  apiKey: string,
  agentDir?: string,
) {
  const normalizedAccountId = accountId.trim();
  const normalizedGatewayId = gatewayId.trim();
  const normalizedKey = apiKey.trim();
  upsertAuthProfile({
    profileId: "cloudflare-ai-gateway:default",
    credential: {
      type: "api_key",
      provider: "cloudflare-ai-gateway",
      key: normalizedKey,
      metadata: {
        accountId: normalizedAccountId,
        gatewayId: normalizedGatewayId,
      },
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setVercelAiGatewayApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "vercel-ai-gateway:default",
    credential: {
      type: "api_key",
      provider: "vercel-ai-gateway",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}

export async function setOpencodeZenApiKey(key: string, agentDir?: string) {
  upsertAuthProfile({
    profileId: "opencode:default",
    credential: {
      type: "api_key",
      provider: "opencode",
      key,
    },
    agentDir: resolveAuthAgentDir(agentDir),
  });
}
