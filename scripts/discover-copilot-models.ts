/**
 * Standalone script to test story generation in isolation
 * Usage: node --import tsx scripts/test-story-generation.ts
 */

import { promises as fs } from "fs";
import os from "os";
import path from "node:path";
import { resolveCopilotApiToken } from "../src/providers/github-copilot-token.js";
import { resolveApiKeyForProvider } from "../src/agents/model-auth.js";
import { ensureAuthProfileStore } from "../src/agents/auth-profiles.js";
import { discoverAuthStorage, discoverModels } from "@mariozechner/pi-coding-agent";

async function main() {
  console.log("🔍 Copilot Model Discovery\n");

  console.log(`🤖 Resolving Auth...\n`);

  let githubToken = process.env.COPILOT_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!githubToken) {
    try {
      const store = ensureAuthProfileStore();
      const resolved = await resolveApiKeyForProvider({
        provider: "github-copilot",
        store
      });
      githubToken = resolved.apiKey;
      console.log(`✅ GitHub token resolved from profile: ${resolved.profileId}`);
    } catch (e: any) {
      console.error(`❌ Failed to resolve GitHub token from profiles: ${e.message}`);
      process.exit(1);
    }
  }

  let auth;
  try {
    auth = await resolveCopilotApiToken({ githubToken: githubToken || "" });
    console.log(`✅ Copilot API token acquired.`);
  } catch (e: any) {
    console.error(`❌ Failed to exchange Copilot token: ${e.message}`);
    process.exit(1);
  }

  console.log(`🔍 Discovering available models for github-copilot...\n`);
  const agentDir = os.homedir() + "/.clawdbot/agents/main/agent";
  const authStorage = discoverAuthStorage(agentDir);
  const modelRegistry = discoverModels(authStorage, agentDir) as any;
  const allModels = modelRegistry.getAll ? modelRegistry.getAll() : (Array.isArray(modelRegistry) ? modelRegistry : []);
  const copilotModels = allModels.filter((m: any) => m.provider === "github-copilot");

  console.log(`Found ${copilotModels.length} models:`);
  copilotModels.forEach((m: any) => console.log(` - ID: ${m.id} | Name: ${m.name}`));
  console.log("");
}

main().catch(console.error);
