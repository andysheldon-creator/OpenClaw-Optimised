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
  createGatewayClient,
  discoverLocalGateway,
  exportMoltbotData,
  getMoltbotMemoryStats,
  getMemoryDbPath,
  getSessionsDir,
  hasMemoryDb,
  importMoltbotData,
  isMoltbotInstalled,
  listAgentIds,
  MoltbotGatewayClient,
  readMoltbotMemory,
  readMoltbotSessions,
  type GatewayConfig,
  type GatewayResponse,
  type GatewayStatus,
  type MemorySearchResult,
  type MoltbotConversationMessage,
  type MoltbotFile,
  type MoltbotMemoryChunk,
  type MoltbotMemoryExport,
  type MoltbotSession,
  type SendMessageOptions,
} from "../moltbot/index.js";
