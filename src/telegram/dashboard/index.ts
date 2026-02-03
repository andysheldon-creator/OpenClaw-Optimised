import type { Bot } from "grammy";
import type { HealthSummary } from "../../commands/health.js";
import type { OpenClawConfig } from "../../config/types.js";
import type { RuntimeEnv } from "../../runtime.js";
import { withTelegramApiErrorLogging } from "../api-logging.js";
import { buildInlineKeyboard } from "../send.js";
import { fetchHealth } from "./data.js";
import {
  renderAgentDetail,
  renderAgents,
  renderChannels,
  renderHome,
  renderLogs,
  renderSessions,
} from "./views.js";

type DashboardCommandDeps = {
  bot: Bot;
  cfg: OpenClawConfig;
  runtime?: RuntimeEnv;
};

/**
 * Sends the initial dashboard message in response to the `/dashboard` command.
 */
export async function sendDashboard(
  chatId: number,
  deps: DashboardCommandDeps,
  threadParams?: Record<string, unknown>,
): Promise<void> {
  const health = await fetchHealth().catch(() => null);
  const result = renderHome(health);
  const keyboard = buildInlineKeyboard(result.buttons);

  await withTelegramApiErrorLogging({
    operation: "sendMessage",
    runtime: deps.runtime,
    fn: () =>
      deps.bot.api.sendMessage(chatId, result.text, {
        parse_mode: "HTML",
        ...(keyboard ? { reply_markup: keyboard } : {}),
        ...threadParams,
      }),
  });
}

/**
 * Handles `d:*` callback_query data. Returns true if handled, false otherwise.
 */
export async function handleDashboardCallback(
  data: string,
  chatId: number,
  messageId: number,
  api: Bot["api"],
): Promise<boolean> {
  if (!data.startsWith("d:")) {
    return false;
  }

  const parts = data.split(":");
  const view = parts[1];
  const param = parts.slice(2).join(":");

  // noop callbacks (pagination current page indicator)
  if (param === "noop") {
    return true;
  }

  const h = await fetchHealth().catch(() => null);

  let result;
  switch (view) {
    case "home":
    case "refresh":
      result = renderHome(h);
      break;
    case "agents":
      result = renderAgents(h);
      break;
    case "agent":
      result = renderAgentDetail(h, param ?? "default");
      break;
    case "sessions":
      result = renderSessions(h, param ? Number.parseInt(param, 10) || 0 : 0);
      break;
    case "channels":
      result = renderChannels(h);
      break;
    case "logs":
      result = renderLogs(h, param ? Number.parseInt(param, 10) || 0 : 0);
      break;
    default:
      return false;
  }

  const keyboard = buildInlineKeyboard(result.buttons);

  try {
    await api.editMessageText(chatId, messageId, result.text, {
      parse_mode: "HTML",
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  } catch (err) {
    const errStr = String(err);
    if (!errStr.includes("message is not modified")) {
      throw err;
    }
  }

  return true;
}
