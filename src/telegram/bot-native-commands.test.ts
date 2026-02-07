import type { Bot } from "grammy";
import { expect, it, vi, describe } from "vitest";
import type { TelegramAccountConfig } from "../config/types.js";
import type { RuntimeEnv } from "../runtime.js";
import { loadConfig } from "../config/config.js";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";

// Mock grammy
vi.mock("grammy", () => {
  return {
    Bot: vi.fn().mockImplementation(() => {
      return {
        api: {
          setMyCommands: vi.fn().mockResolvedValue(true),
        },
        command: vi.fn(),
      };
    }),
  };
});

// Mock dependencies to control skill commands
vi.mock("../auto-reply/skill-commands.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listSkillCommandsForAgents: vi.fn().mockReturnValue([
      { name: "github", description: "GitHub skill" },
      { name: "github", description: "GitHub duplicate" },
      { name: "weather", description: "Weather skill" },
    ]),
  };
});

describe("Telegram native commands deduplication", () => {
  it("should register skill commands exactly once even if found multiple times", async () => {
    const setMyCommandsSpy = vi.fn().mockResolvedValue(true);
    const bot = {
      api: {
        setMyCommands: setMyCommandsSpy,
      },
      command: vi.fn(),
    } as unknown as Bot;

    const cfg = loadConfig();
    const runtime = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;

    const telegramCfg = {
      token: "test",
      commands: {
        native: "auto",
        nativeSkills: "auto",
      },
    } as unknown as TelegramAccountConfig;

    registerTelegramNativeCommands({
      bot,
      cfg,
      runtime,
      accountId: "main",
      telegramCfg,
      allowFrom: [],
      groupAllowFrom: [],
      replyToMode: "first",
      textLimit: 4000,
      useAccessGroups: true,
      nativeEnabled: true,
      nativeSkillsEnabled: true,
      nativeDisabledExplicit: false,
      resolveGroupPolicy: () => ({ allowed: true, allowlistEnabled: false }),
      resolveTelegramGroupConfig: () => ({}),
      shouldSkipUpdate: () => false,
      opts: { token: "test" },
    });

    expect(setMyCommandsSpy).toHaveBeenCalledOnce();
    const commands = setMyCommandsSpy.mock.calls[0][0] as Array<{ command: string }>;

    const githubCount = commands.filter((c) => c.command === "github").length;
    const weatherCount = commands.filter((c) => c.command === "weather").length;

    expect(githubCount).toBe(1);
    expect(weatherCount).toBe(1);
  });
});
