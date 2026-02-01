/**
 * Moltbot Integration Module
 *
 * Provides adapters and clients for integrating with Moltbot's
 * memory system, session management, and gateway.
 */

// Memory adapter (local SQLite access)
export {
  exportMoltbotData,
  getMoltbotMemoryStats,
  getMemoryDbPath,
  getSessionsDir,
  hasMemoryDb,
  importMoltbotData,
  isMoltbotInstalled,
  listAgentIds,
  readMoltbotMemory,
  readMoltbotSessions,
  type MoltbotConversationMessage,
  type MoltbotFile,
  type MoltbotMemoryChunk,
  type MoltbotMemoryExport,
  type MoltbotSession,
} from "./memory-adapter.js";

// Gateway client (remote API access)
export {
  createGatewayClient,
  discoverLocalGateway,
  MoltbotGatewayClient,
  type GatewayConfig,
  type GatewayResponse,
  type GatewayStatus,
  type MemorySearchResult,
  type SendMessageOptions,
} from "./gateway-client.js";
