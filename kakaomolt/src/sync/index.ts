/**
 * Memory Sync Module
 *
 * E2E encrypted memory synchronization for KakaoMolt.
 * Allows users to sync their AI memory across multiple devices.
 */

// Encryption utilities
export {
  calculateChecksum,
  compressAndEncrypt,
  decrypt,
  decryptAndDecompress,
  decryptJSON,
  decryptToString,
  deriveKey,
  encrypt,
  encryptJSON,
  generateRandomKey,
  generateSalt,
  keyToRecoveryCode,
  verifyRecoveryCode,
  type E2EEncryptedData,
  type E2EEncryptionKey,
} from "./encryption.js";

// Memory sync manager
export {
  createMemorySyncManager,
  MemorySyncManager,
  type ConversationData,
  type ConversationMessage,
  type DeviceInfo,
  type MemoryChunk,
  type MemoryData,
  type MemoryMetadata,
  type SyncConfig,
  type SyncResult,
  type SyncStatus,
} from "./memory-sync.js";

// Sync commands
export {
  handleSyncCommand,
  isSyncCommand,
  parseSyncCommand,
  type SyncCommandContext,
  type SyncCommandResult,
} from "./sync-commands.js";

// Re-export Moltbot adapters for convenience
export {
  // Memory adapter
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
  // Gateway client
  createGatewayClient,
  discoverLocalGateway,
  MoltbotGatewayClient,
  type GatewayConfig,
  type GatewayResponse,
  type GatewayStatus,
  type MemorySearchResult,
  type SendMessageOptions,
  // Tool bridge
  createToolBridge,
  formatToolList,
  MoltbotToolBridge,
  MOLTBOT_TOOLS,
  type ParameterDef,
  type ToolCategory,
  type ToolDefinition,
  type ToolExecutionResult,
  // Channel bridge
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
  // Agent integration
  createAgentIntegration,
  getSharedIntegration,
  initializeAgentIntegration,
  MoltbotAgentIntegration,
  resetSharedIntegration,
  type AgentConfig,
  type AgentResponse,
  type ConversationContext,
} from "../moltbot/index.js";
