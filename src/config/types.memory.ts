import type { SessionSendPolicyConfig } from "./types.base.js";

export type MemoryBackend = "builtin" | "qmd";
export type MemoryCitationsMode = "auto" | "on" | "off";

export type MemoryConfig = {
  backend?: MemoryBackend;
  citations?: MemoryCitationsMode;
  qmd?: MemoryQmdConfig;
};

export type MemoryQmdConfig = {
  command?: string;
  includeDefaultMemory?: boolean;
  paths?: MemoryQmdIndexPath[];
  sessions?: MemoryQmdSessionConfig;
  update?: MemoryQmdUpdateConfig;
  limits?: MemoryQmdLimitsConfig;
  scope?: SessionSendPolicyConfig;
  /** MCP server mode configuration */
  mcp?: MemoryQmdMcpConfig;
};

export type MemoryQmdMcpConfig = {
  /** Enable MCP server mode (default: true) */
  enabled?: boolean;
  /** Maximum time to wait for MCP server initialization (ms) */
  startupTimeoutMs?: number;
  /** Per-request timeout - allows for model loading on first query (ms) */
  requestTimeoutMs?: number;
  /** Maximum restart attempts before giving up */
  maxRetries?: number;
  /** Delay between restart attempts (ms) */
  retryDelayMs?: number;
};

export type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

export type MemoryQmdSessionConfig = {
  enabled?: boolean;
  exportDir?: string;
  retentionDays?: number;
};

export type MemoryQmdUpdateConfig = {
  interval?: string;
  debounceMs?: number;
  onBoot?: boolean;
  embedInterval?: string;
};

export type MemoryQmdLimitsConfig = {
  maxResults?: number;
  maxSnippetChars?: number;
  maxInjectedChars?: number;
  timeoutMs?: number;
};
