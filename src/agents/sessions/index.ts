/**
 * Session adapter module.
 *
 * Provides a unified interface for reading and writing session history
 * across different runtime formats (Pi-Agent, Claude Code SDK).
 */

export type { SessionAdapter, SessionAdapterFactory } from "./session-adapter.js";
export type {
  AssistantContent,
  NormalizedContent,
  NormalizedImageContent,
  NormalizedMessage,
  NormalizedTextContent,
  NormalizedThinking,
  NormalizedToolCall,
  NormalizedToolResultContent,
  SessionMetadata,
  UsageInfo,
} from "./types.js";

export {
  createPiSessionAdapter,
  PiSessionAdapter,
  type PiSessionAdapterOptions,
} from "./pi-session-adapter.js";

export {
  createCcsdkSessionAdapter,
  CcsdkSessionAdapter,
  type CcsdkSessionAdapterOptions,
} from "./ccsdk-session-adapter.js";

import type { SessionAdapter } from "./session-adapter.js";
import { createPiSessionAdapter } from "./pi-session-adapter.js";
import { createCcsdkSessionAdapter } from "./ccsdk-session-adapter.js";

/**
 * Factory function to create the appropriate session adapter.
 */
export function createSessionAdapter(
  runtime: "pi-agent" | "ccsdk",
  sessionFile: string,
  options: {
    sessionId: string;
    cwd?: string;
    version?: string;
    gitBranch?: string;
    slug?: string;
  },
): SessionAdapter {
  if (runtime === "ccsdk") {
    return createCcsdkSessionAdapter(sessionFile, options);
  }
  return createPiSessionAdapter(sessionFile, options);
}
