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
  /** Maximum time to wait for MCP server initialization (e.g., "10s", "30s"). Default: 10s */
  startupTimeout?: string;
  /** Per-request timeout - allows for model loading on first query (e.g., "30s", "1m"). Default: 30s */
  requestTimeout?: string;
  /** Maximum restart attempts before giving up */
  maxRetries?: number;
  /** Delay between restart attempts (e.g., "1s", "500ms"). Default: 1s */
  retryDelay?: string;
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
