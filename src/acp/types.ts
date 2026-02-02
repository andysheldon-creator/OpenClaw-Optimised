import type { SessionId } from "@agentclientprotocol/sdk";
import { VERSION } from "../version.js";

export type McpServerConfig = {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
};

export type AcpSession = {
  sessionId: SessionId;
  sessionKey: string;
  cwd: string;
  createdAt: number;
  abortController: AbortController | null;
  activeRunId: string | null;
  mcpServers: McpServerConfig[];
};

export type AcpServerOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  defaultSessionKey?: string;
  defaultSessionLabel?: string;
  requireExistingSession?: boolean;
  resetSession?: boolean;
  prefixCwd?: boolean;
  verbose?: boolean;
};

export const ACP_AGENT_INFO = {
  name: "openclaw-acp",
  title: "OpenClaw ACP Gateway",
  version: VERSION,
};
