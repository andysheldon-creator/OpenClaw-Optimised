import type { Bot } from "grammy";
import type { OpenClawConfig } from "../../config/types.js";

export type DashboardView =
  | "home"
  | "agents"
  | "agent"
  | "sessions"
  | "channels"
  | "usage"
  | "logs";

export type RenderResult = {
  text: string;
  buttons: Array<Array<{ text: string; callback_data: string }>>;
};

export type DashboardDeps = {
  cfg: OpenClawConfig;
  api: Bot["api"];
  chatId: number;
  messageId: number;
  accountId?: string;
};
