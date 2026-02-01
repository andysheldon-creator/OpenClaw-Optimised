/**
 * Test script for iterative narrative story generation.
 * Processes history file-by-file + active session to produce a final autobiography.
 * Usage: node --import tsx scripts/memory/test-story-generation.ts
 */

import {
  buildStoryPrompt,
  readIdentityContext
} from "../../src/services/memory/story-prompt-builder.js";
import { loadConfig } from "../../src/config/io.js";
import { resolveDefaultModelForAgent } from "../../src/agents/model-selection.js";
import { complete } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function main() {
  console.log("📖 Iterative Narrative Story Generation Test (Unified Prompt)\n");

  const home = os.homedir();
  const agentDir = process.cwd(); // Assume we are in the project root
  const clawdDir = path.join(home, "clawd");
  const stateDir = path.join(home, ".clawdbot");
  const outputPath = path.join(clawdDir, "STORY_TEST.md");

  // 1. Load config and resolve primary model
  const fullConfig = loadConfig();
  const modelRef = resolveDefaultModelForAgent({ cfg: fullConfig });
  const provider = modelRef.provider;
  const modelId = modelRef.model;

  console.log(`🤖 Using model: ${provider}/${modelId}`);

  const { resolveModel } = await import("../../src/agents/pi-embedded-runner/model.js");
  const { model, error } = resolveModel(provider, modelId, agentDir, fullConfig);
  if (error || !model) {
    console.error("❌ Model resolution failed:", error);
    return;
  }

  (model as any).provider = "openai";
  (model as any).cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  (model as any).api = "openai-completions";

  console.log("🤖 Resolving Auth...");
  const { resolveApiKeyForProvider } = await import("../../src/agents/model-auth.js");
  const auth = await resolveApiKeyForProvider({ provider, cfg: fullConfig, agentDir });

  if (!auth.apiKey) {
    console.error(`❌ No API key found for provider "${provider}"`);
    return;
  }

  // Ensure model has what it needs for the 'complete' call
  (model as any).apiKey = auth.apiKey;
  if (provider === "github-copilot") {
    const { resolveCopilotApiToken } = await import("../../src/providers/github-copilot-token.js");
    const copilotAuth = await resolveCopilotApiToken({ githubToken: auth.apiKey });
    (model as any).apiKey = copilotAuth.token;
  }

  console.log("✅ API token acquired.\n");

  // 2. Load Identity & Soul
  console.log("📂 Loading long-term data...");
  const identityContent = await readIdentityContext(path.join(clawdDir, "IDENTITY.md"));
  const soulContent = await fs.readFile(path.join(clawdDir, "SOUL.md"), "utf-8").catch(() => "");
  const combinedIdentity = `--- IDENTITY ---\n${identityContent}\n\n--- SOUL ---\n${soulContent}`.trim();

  // 3. Identify Memory Files
  const memoryDir = path.join(clawdDir, "memory");
  const files = (await fs.readdir(memoryDir)).filter(f => f.endsWith(".md")).sort();
  console.log(`📊 Found ${files.length} historical memory files.`);

  let currentStory = "";

  const headers = {
    "Editor-Version": "vscode/1.95.0",
    "Editor-Plugin-Version": "copilot-chat/0.22.4",
    "User-Agent": "GithubCopilot/1.243.0",
  };

  /** Helper to call LLM */
  const generate = async (prompt: string, label: string) => {
    console.log(`🚀 [${label}] Calling LLM (${modelId})...`);
    const completion = (await complete(
      model as any,
      { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] } as any,
      { apiKey: (model as any).apiKey || auth.apiKey, headers, temperature: 0.7, maxTokens: 4000 }
    )) as any;

    let text = "";
    if (Array.isArray(completion.content)) {
      text = completion.content.map((part: any) => (typeof part === "string" ? part : part.text || "")).join("");
    } else if (typeof completion.content === "string") {
      text = completion.content;
    } else if (completion.choices?.[0]?.message?.content) {
      text = completion.choices[0].message.content;
    }
    return text.trim();
  };

  // 4. Iterative Loop
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
    const transcript = `--- HISTORICAL LOG: ${file} ---\n${content}`;

    console.log(`\n🔹 STEP ${i + 1}/${files.length + 1}: Processing ${file}`);

    const prompt = buildStoryPrompt({
      identityContext: combinedIdentity,
      currentStory,
      transcript,
      isBootstrap: !currentStory
    });

    const updatedStory = await generate(prompt, `HISTORY: ${file}`);
    if (updatedStory) {
      currentStory = updatedStory;
      await fs.writeFile(outputPath, currentStory, "utf-8");
      console.log(`✅ [${file}] Integrated. Story size: ${currentStory.length} chars.`);
    } else {
      console.error(`❌ [${file}] Generation failed.`);
    }
  }

  // 5. Final Active Session Integration
  console.log(`\n🔹 STEP FINAL: Integrating Live Session`);

  const sessionsJsonPath = path.join(stateDir, "agents/main/sessions/sessions.json");
  const sessionsMeta = JSON.parse(await fs.readFile(sessionsJsonPath, "utf-8"));
  const mainSession = sessionsMeta["agent:main:main"];

  if (mainSession && mainSession.sessionFile) {
    const jsonLines = (await fs.readFile(mainSession.sessionFile, "utf-8")).split("\n").filter(l => l.trim());
    const sessionMessages: string[] = [];
    for (const line of jsonLines) {
      try {
        const log = JSON.parse(line);
        if (log.type === "message" && log.message) {
          const text = Array.isArray(log.message.content)
            ? log.message.content.map((c: any) => (typeof c === "string" ? c : (c.text ?? ""))).join(" ")
            : (log.message.content || "");
          if (text && text !== "NO_REPLY") {
            sessionMessages.push(`[${log.message.role}]: ${text}`);
          }
        }
      } catch (e) { }
    }

    const sessionTranscript = `--- ACTIVE SESSION ---\n${sessionMessages.join("\n")}`;
    const finalPrompt = buildStoryPrompt({
      identityContext: combinedIdentity,
      currentStory,
      transcript: sessionTranscript,
      isBootstrap: false
    });

    const finalStory = await generate(finalPrompt, "LIVE SESSION");
    if (finalStory) {
      currentStory = finalStory;
      await fs.writeFile(outputPath, currentStory, "utf-8");
      console.log(`\n🎉 FINAL INTEGRATION COMPLETE!`);
      console.log(`📊 Final Story: ${currentStory.split(/\s+/).length} words in ${path.basename(outputPath)}`);
    }
  } else {
    console.warn("⚠️ No active session found to integrate.");
  }
}

main().catch(console.error);
