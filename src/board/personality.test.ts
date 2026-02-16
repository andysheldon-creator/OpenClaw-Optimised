import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildBoardSystemPrompt,
  ensureBoardPersonalityFiles,
  loadAgentPersonality,
} from "./personality.js";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadAgentPersonality", () => {
  it("returns default personality when no workspace file exists", () => {
    const personality = loadAgentPersonality("finance", tmpDir);
    expect(personality).toContain("CFO");
    expect(personality).toContain("Financial");
  });

  it("loads custom personality from workspace board/ directory", () => {
    const boardDir = path.join(tmpDir, "board");
    fs.mkdirSync(boardDir, { recursive: true });
    fs.writeFileSync(
      path.join(boardDir, "research.soul.md"),
      "Custom research persona for testing.",
    );

    const personality = loadAgentPersonality("research", tmpDir);
    expect(personality).toBe("Custom research persona for testing.");

    // Clean up
    fs.unlinkSync(path.join(boardDir, "research.soul.md"));
  });

  it("loads personality from custom soulFile path in config", () => {
    const customPath = path.join(tmpDir, "my-finance.md");
    fs.writeFileSync(customPath, "My custom finance soul.");

    const personality = loadAgentPersonality("finance", tmpDir, [
      { role: "finance", soulFile: customPath },
    ]);
    expect(personality).toBe("My custom finance soul.");

    fs.unlinkSync(customPath);
  });

  it("falls back to default when workspace file is empty", () => {
    const boardDir = path.join(tmpDir, "board");
    fs.mkdirSync(boardDir, { recursive: true });
    fs.writeFileSync(path.join(boardDir, "critic.soul.md"), "");

    const personality = loadAgentPersonality("critic", tmpDir);
    expect(personality).toContain("Devil's Advocate");

    fs.unlinkSync(path.join(boardDir, "critic.soul.md"));
  });
});

describe("buildBoardSystemPrompt", () => {
  it("includes agent role and personality", () => {
    const prompt = buildBoardSystemPrompt("finance", tmpDir);
    expect(prompt).toContain("Agent Role: Finance Director (CFO)");
    expect(prompt).toContain("📊");
    expect(prompt).toContain("CFO");
  });

  it("lists all board colleagues", () => {
    const prompt = buildBoardSystemPrompt("research", tmpDir);
    expect(prompt).toContain("General");
    expect(prompt).toContain("Research Analyst");
    expect(prompt).toContain("Content Director");
    expect(prompt).toContain("Finance Director");
    expect(prompt).toContain("Strategy Director");
    expect(prompt).toContain("Critic");
    expect(prompt).toContain("← You");
  });

  it("includes consultation instructions when enabled", () => {
    const prompt = buildBoardSystemPrompt("strategy", tmpDir, {
      consultationEnabled: true,
      maxConsultationDepth: 3,
    });
    expect(prompt).toContain("Cross-Agent Consultation");
    expect(prompt).toContain("[[consult:");
    expect(prompt).toContain("depth of 3");
  });

  it("omits consultation instructions when disabled", () => {
    const prompt = buildBoardSystemPrompt("strategy", tmpDir, {
      consultationEnabled: false,
    });
    expect(prompt).not.toContain("Cross-Agent Consultation");
  });

  it("includes meeting instructions only for general agent", () => {
    const generalPrompt = buildBoardSystemPrompt("general", tmpDir, {
      meetingsEnabled: true,
    });
    expect(generalPrompt).toContain("Board Meetings");
    expect(generalPrompt).toContain("[[board_meeting]]");

    const financePrompt = buildBoardSystemPrompt("finance", tmpDir, {
      meetingsEnabled: true,
    });
    expect(financePrompt).not.toContain("Board Meetings");
  });

  it("includes routing guidance for general agent", () => {
    const prompt = buildBoardSystemPrompt("general", tmpDir);
    expect(prompt).toContain("Message Routing");
    expect(prompt).toContain("don't target a specific specialist");
  });

  it("includes routing guidance for specialist agents", () => {
    const prompt = buildBoardSystemPrompt("critic", tmpDir);
    expect(prompt).toContain("Stay in your lane");
  });
});

describe("ensureBoardPersonalityFiles", () => {
  it("creates board/ directory with personality files", () => {
    const testDir = path.join(tmpDir, "workspace-test");
    fs.mkdirSync(testDir, { recursive: true });

    ensureBoardPersonalityFiles(testDir);

    const boardDir = path.join(testDir, "board");
    expect(fs.existsSync(boardDir)).toBe(true);

    // Should have personality files for all non-general agents
    for (const role of [
      "research",
      "content",
      "finance",
      "strategy",
      "critic",
    ]) {
      const filepath = path.join(boardDir, `${role}.soul.md`);
      expect(fs.existsSync(filepath)).toBe(true);
      const content = fs.readFileSync(filepath, "utf-8");
      expect(content.length).toBeGreaterThan(50);
    }

    // General should NOT have a file (uses root SOUL.md)
    expect(fs.existsSync(path.join(boardDir, "general.soul.md"))).toBe(false);

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("does not overwrite existing personality files", () => {
    const testDir = path.join(tmpDir, "workspace-preserve");
    const boardDir = path.join(testDir, "board");
    fs.mkdirSync(boardDir, { recursive: true });
    fs.writeFileSync(
      path.join(boardDir, "finance.soul.md"),
      "Custom content that should be preserved.",
    );

    ensureBoardPersonalityFiles(testDir);

    const content = fs.readFileSync(
      path.join(boardDir, "finance.soul.md"),
      "utf-8",
    );
    expect(content).toBe("Custom content that should be preserved.");

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
