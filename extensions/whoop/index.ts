/**
 * Whoop Fitness Plugin for Clawdbot
 * Provides access to Whoop recovery, sleep, cycle, and workout data
 */

import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { createWhoopTool } from "./src/whoop-tool.js";
import { loginWhoopOAuth } from "./src/oauth.js";

const PROVIDER_ID = "whoop";
const PROVIDER_LABEL = "Whoop Fitness";

export default function register(api: ClawdbotPluginApi) {
  api.logger.info("Registering Whoop fitness plugin");

  // Register OAuth provider
  api.registerProvider({
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    docsPath: "/plugins/whoop",
    envVars: ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET"],
    auth: [
      {
        id: "oauth",
        label: "Whoop OAuth",
        hint: "OAuth 2.0 with localhost callback",
        kind: "oauth",
        run: async (ctx) => {
          const spin = ctx.prompter.progress("Starting Whoop OAuth…");

          // Get client credentials from config
          const config = api.config?.plugins?.entries?.whoop?.config as
            | { clientId?: string; clientSecret?: string }
            | undefined;

          const clientId =
            config?.clientId || process.env.WHOOP_CLIENT_ID || process.env.CLAWDBOT_WHOOP_CLIENT_ID;
          const clientSecret =
            config?.clientSecret ||
            process.env.WHOOP_CLIENT_SECRET ||
            process.env.CLAWDBOT_WHOOP_CLIENT_SECRET;

          if (!clientId || !clientSecret) {
            spin.stop("Configuration missing");
            throw new Error(
              "Whoop Client ID and Client Secret required. Add them to your config or set WHOOP_CLIENT_ID/WHOOP_CLIENT_SECRET environment variables.",
            );
          }

          try {
            const result = await loginWhoopOAuth({
              isRemote: ctx.isRemote,
              openUrl: ctx.openUrl,
              log: (msg) => ctx.runtime.log(msg),
              note: ctx.prompter.note,
              prompt: async (message) => String(await ctx.prompter.text({ message })),
              progress: spin,
              clientId,
              clientSecret,
            });

            spin.stop("Whoop OAuth complete");

            const profileId = `whoop:${result.userId ?? "default"}`;

            return {
              profiles: [
                {
                  profileId,
                  credential: {
                    type: "oauth",
                    provider: PROVIDER_ID,
                    access: result.access,
                    refresh: result.refresh,
                    expires: result.expires,
                    userId: result.userId,
                  },
                },
              ],
              notes: [
                "Your Whoop account is now connected!",
                "The agent tool 'get_whoop_data' will be available once allowlisted.",
              ],
            };
          } catch (err) {
            spin.stop("Whoop OAuth failed");
            await ctx.prompter.note(
              "Check that your redirect URI (http://localhost:8086/oauth2callback) is registered in your Whoop app settings at developer.whoop.com",
              "OAuth help",
            );
            throw err;
          }
        },
      },
    ],
  });

  // Register tool
  api.registerTool(createWhoopTool(api), { optional: true });
}
