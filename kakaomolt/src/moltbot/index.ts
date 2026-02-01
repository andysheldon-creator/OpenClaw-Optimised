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

// Tool bridge (execute Moltbot tools)
export {
  createToolBridge,
  formatToolList,
  MoltbotToolBridge,
  MOLTBOT_TOOLS,
  type ParameterDef,
  type ToolCategory,
  type ToolDefinition,
  type ToolExecutionResult,
} from "./tool-bridge.js";

// Channel bridge (cross-platform messaging)
export {
  CHANNELS,
  createChannelBridge,
  formatBridgeStatus,
  formatChannelList,
  MoltbotChannelBridge,
  parseBridgeCommand,
  type BridgeMessage,
  type BridgeResult,
  type ChannelInfo,
  type ChannelStatus,
  type ChannelType,
} from "./channel-bridge.js";

// Agent integration (high-level API)
export {
  createAgentIntegration,
  getSharedIntegration,
  initializeAgentIntegration,
  MoltbotAgentIntegration,
  resetSharedIntegration,
  type AgentConfig,
  type AgentResponse,
  type ConversationContext,
} from "./agent-integration.js";
