/**
 * DingTalk onboarding adapter
 */

import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingStatusContext,
  ChannelOnboardingConfigureContext,
  ChannelOnboardingResult,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { DingTalkConfig } from "./types.js";
import { probeDingTalk } from "./probe.js";

const channel = "dingtalk" as const;

async function promptDingTalkCredentials(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const { cfg, prompter } = params;

  await prompter.intro("DingTalk Channel Setup");
  await prompter.note(
    "To set up DingTalk integration:\n" +
      "1. Open your DingTalk group\n" +
      "2. Go to Group Settings → Group Assistant → Add Robot\n" +
      "3. Select 'Custom Robot'\n" +
      "4. Configure security settings (choose 'Signature')\n" +
      "5. Copy the webhook URL and secret",
  );

  const webhookUrl = await prompter.text({
    message: "Enter the webhook URL from DingTalk:",
    placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
    validate: (value: string) => {
      if (!value) {
        return "Webhook URL is required";
      }
      try {
        const url = new URL(value);
        if (!url.hostname.includes("dingtalk.com")) {
          return "URL must be a DingTalk webhook URL";
        }
      } catch {
        return "Invalid URL format";
      }
    },
  });

  const secret = await prompter.text({
    message: "Enter the secret from DingTalk robot settings:",
    placeholder: "SEC...",
    validate: (value: string) => {
      if (!value) {
        return "Secret is required";
      }
      if (value.length < 10) {
        return "Secret seems too short";
      }
    },
  });

  const dingtalkConfig = cfg.channels?.dingtalk as DingTalkConfig | undefined;

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      dingtalk: {
        ...(dingtalkConfig || {}),
        webhookUrl,
        secret,
        enabled: true,
      },
    },
  };
}

async function testDingTalkConnection(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<void> {
  const { cfg, prompter } = params;
  const config = cfg.channels?.dingtalk as DingTalkConfig | undefined;
  if (!config) {
    throw new Error("DingTalk not configured");
  }

  const progress = prompter.progress("Testing connection to DingTalk...");

  const probeResult = await probeDingTalk(config, true);

  if (!probeResult.success) {
    progress.stop(`Connection test failed: ${probeResult.error}`);
    throw new Error(probeResult.error);
  }

  progress.stop("Connection test successful!");
}

async function promptDingTalkDmPolicy(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const { cfg, prompter } = params;

  const dmPolicy = await prompter.select({
    message: "Choose DM policy:",
    options: [
      {
        value: "pairing",
        label: "Pairing",
        hint: "Users must pair before sending messages",
      },
      {
        value: "allowlist",
        label: "Allowlist",
        hint: "Only specific users can send messages",
      },
      {
        value: "open",
        label: "Open",
        hint: "Anyone can send messages",
      },
      {
        value: "disabled",
        label: "Disabled",
        hint: "No incoming messages accepted",
      },
    ],
    initialValue: "pairing",
  });

  const dingtalkConfig = cfg.channels?.dingtalk as DingTalkConfig | undefined;

  let updatedCfg: OpenClawConfig = {
    ...cfg,
    channels: {
      ...cfg.channels,
      dingtalk: {
        ...(dingtalkConfig || {}),
        dmPolicy,
      } as DingTalkConfig,
    },
  };

  // If allowlist, prompt for allowed users
  if (dmPolicy === "allowlist") {
    const allowFromInput = await prompter.text({
      message: "Enter allowed user IDs (comma-separated):",
      placeholder: "user1, user2, user3",
    });

    if (allowFromInput) {
      const allowFrom = allowFromInput
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      const currentDingtalkConfig = updatedCfg.channels?.dingtalk as DingTalkConfig | undefined;

      updatedCfg = {
        ...updatedCfg,
        channels: {
          ...updatedCfg.channels,
          dingtalk: {
            ...(currentDingtalkConfig || {}),
            allowFrom,
          } as DingTalkConfig,
        },
      };
    }
  }

  return updatedCfg;
}

export const dingtalkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  async getStatus(ctx: ChannelOnboardingStatusContext) {
    const config = ctx.cfg.channels?.dingtalk as DingTalkConfig | undefined;
    const configured = Boolean(config?.webhookUrl && config?.secret);

    return {
      channel,
      configured,
      statusLines: configured ? [`✓ Webhook configured`] : [`✗ Not configured`],
    };
  },
  async configure(ctx: ChannelOnboardingConfigureContext): Promise<ChannelOnboardingResult> {
    let cfg = ctx.cfg;

    // Prompt for credentials
    cfg = await promptDingTalkCredentials({ cfg, prompter: ctx.prompter });

    // Test connection
    await testDingTalkConnection({ cfg, prompter: ctx.prompter });

    // Configure DM policy
    cfg = await promptDingTalkDmPolicy({ cfg, prompter: ctx.prompter });

    return {
      cfg,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  },
};
