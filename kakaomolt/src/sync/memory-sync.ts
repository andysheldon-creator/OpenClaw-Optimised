/**
 * Memory Sync Service
 *
 * Handles E2E encrypted memory synchronization between devices.
 * All data is encrypted client-side before upload - server stores only ciphertext.
 *
 * Sync flow:
 * 1. User generates encryption key (from passphrase or random)
 * 2. Client encrypts local memory data
 * 3. Encrypted data uploaded to Supabase
 * 4. Other devices download and decrypt with same key
 * 5. Incremental sync for efficiency (delta changes)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase.js";
import {
  compressAndEncrypt,
  decryptAndDecompress,
  decryptJSON,
  deriveKey,
  encryptJSON,
  generateSalt,
  keyToRecoveryCode,
  type E2EEncryptedData,
  type E2EEncryptionKey,
} from "./encryption.js";
import {
  exportMoltbotData,
  importMoltbotData,
  isMoltbotInstalled,
  getMoltbotMemoryStats,
  type MoltbotMemoryExport,
} from "../moltbot/index.js";

// Max chunk size for large data (4MB base64 ≈ 3MB binary)
const MAX_CHUNK_SIZE = 4 * 1024 * 1024;

export interface SyncConfig {
  supabase: SupabaseClient<Database>;
  userId: string; // Supabase user UUID
  kakaoUserId: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: "mobile" | "desktop" | "tablet" | "unknown";
}

export interface MemoryData {
  chunks: MemoryChunk[];
  metadata: MemoryMetadata;
}

export interface MemoryChunk {
  id: string;
  text: string;
  path: string;
  source: string;
  embedding?: number[];
  startLine?: number;
  endLine?: number;
  createdAt: string;
}

export interface MemoryMetadata {
  totalChunks: number;
  embeddingModel: string;
  lastUpdated: string;
  version: number;
}

export interface ConversationData {
  sessionId: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: unknown[];
}

export interface SyncStatus {
  lastSyncAt: string | null;
  localVersion: number;
  remoteVersion: number;
  pendingChanges: number;
  devices: DeviceInfo[];
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  lastSyncAt: string | null;
}

export interface SyncResult {
  success: boolean;
  version?: number;
  recoveryCode?: string;
  error?: string;
}

/**
 * Memory Sync Manager
 *
 * Manages E2E encrypted memory synchronization.
 */
export class MemorySyncManager {
  private config: SyncConfig;
  private encryptionKey: Buffer | null = null;
  private keySalt: string | null = null;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  /**
   * Initialize sync with a passphrase
   * Creates or retrieves the key salt from server
   */
  async initWithPassphrase(passphrase: string): Promise<{ success: boolean; isNewUser: boolean; recoveryCode: string }> {
    const { supabase, userId } = this.config;

    // Check if user has existing salt
    const { data: saltData } = await supabase.from("user_key_salts").select("salt").eq("user_id", userId).single();

    let isNewUser = false;

    if (saltData) {
      // Existing user - use stored salt
      this.keySalt = saltData.salt;
    } else {
      // New user - generate and store salt
      isNewUser = true;
      this.keySalt = generateSalt();

      await supabase.from("user_key_salts").insert({
        user_id: userId,
        salt: this.keySalt,
      });
    }

    // Derive key from passphrase
    const { key } = deriveKey(passphrase, this.keySalt);
    this.encryptionKey = key;

    // Register device
    await this.registerDevice();

    return {
      success: true,
      isNewUser,
      recoveryCode: keyToRecoveryCode(key),
    };
  }

  /**
   * Register current device for sync
   */
  private async registerDevice(): Promise<void> {
    const { supabase, userId, deviceId, deviceName, deviceType } = this.config;

    await supabase.from("user_devices").upsert(
      {
        user_id: userId,
        device_id: deviceId,
        device_name: deviceName ?? null,
        device_type: deviceType ?? "unknown",
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" },
    );
  }

  /**
   * Upload memory data to cloud (E2E encrypted)
   */
  async uploadMemory(memoryData: MemoryData): Promise<SyncResult> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized. Call initWithPassphrase first." };
    }

    const { supabase, userId, deviceId } = this.config;

    try {
      // Serialize and compress memory data
      const jsonData = JSON.stringify(memoryData);
      const encrypted = await compressAndEncrypt(jsonData, this.encryptionKey);

      // Check if data needs chunking
      const dataSize = encrypted.ciphertext.length;

      if (dataSize <= MAX_CHUNK_SIZE) {
        // Single chunk upload
        const { data, error } = await supabase.rpc("upload_sync_data", {
          p_user_id: userId,
          p_encrypted_data: encrypted.ciphertext,
          p_iv: encrypted.iv,
          p_auth_tag: encrypted.authTag,
          p_data_type: "memory",
          p_checksum: encrypted.checksum,
          p_source_device_id: deviceId,
          p_chunk_index: 0,
          p_total_chunks: 1,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        const result = data?.[0];
        if (!result?.success) {
          return { success: false, error: result?.error_message ?? "Upload failed" };
        }

        return {
          success: true,
          version: result.new_version,
          recoveryCode: keyToRecoveryCode(this.encryptionKey),
        };
      } else {
        // Multi-chunk upload
        const chunks = this.splitIntoChunks(encrypted.ciphertext, MAX_CHUNK_SIZE);
        const totalChunks = chunks.length;
        let finalVersion = 0;

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabase.rpc("upload_sync_data", {
            p_user_id: userId,
            p_encrypted_data: chunks[i],
            p_iv: encrypted.iv,
            p_auth_tag: encrypted.authTag,
            p_data_type: "memory",
            p_checksum: encrypted.checksum,
            p_source_device_id: deviceId,
            p_chunk_index: i,
            p_total_chunks: totalChunks,
          });

          if (error) {
            return { success: false, error: `Chunk ${i} failed: ${error.message}` };
          }

          const result = data?.[0];
          if (result?.success) {
            finalVersion = result.new_version;
          }
        }

        return {
          success: true,
          version: finalVersion,
          recoveryCode: keyToRecoveryCode(this.encryptionKey),
        };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Download and decrypt memory data from cloud
   */
  async downloadMemory(minVersion: number = 0): Promise<{ success: boolean; data?: MemoryData; version?: number; error?: string }> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized. Call initWithPassphrase first." };
    }

    const { supabase, userId } = this.config;

    try {
      const { data, error } = await supabase.rpc("download_sync_data", {
        p_user_id: userId,
        p_data_type: "memory",
        p_min_version: minVersion,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data || data.length === 0) {
        return { success: true, data: undefined, version: minVersion };
      }

      // Group chunks by version
      const latestVersion = data[0].version;
      const chunks = data.filter((d) => d.version === latestVersion).sort((a, b) => a.chunk_index - b.chunk_index);

      // Reassemble ciphertext
      const ciphertext = chunks.map((c) => c.encrypted_data).join("");

      const encrypted: E2EEncryptedData = {
        ciphertext,
        iv: chunks[0].iv,
        authTag: chunks[0].auth_tag,
        checksum: chunks[0].checksum,
      };

      // Decrypt and decompress
      const decrypted = await decryptAndDecompress(encrypted, this.encryptionKey);
      const memoryData = JSON.parse(decrypted.toString("utf-8")) as MemoryData;

      return {
        success: true,
        data: memoryData,
        version: latestVersion,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Upload conversation history (E2E encrypted)
   */
  async uploadConversation(conversation: ConversationData): Promise<SyncResult> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized" };
    }

    const { supabase, userId, deviceId } = this.config;

    try {
      const encrypted = encryptJSON(conversation.messages, this.encryptionKey);

      // Get current version
      const { data: existing } = await supabase
        .from("conversation_sync")
        .select("version")
        .eq("user_id", userId)
        .eq("session_id", conversation.sessionId)
        .single();

      const newVersion = (existing?.version ?? 0) + 1;

      const { error } = await supabase.from("conversation_sync").upsert(
        {
          user_id: userId,
          session_id: conversation.sessionId,
          encrypted_messages: encrypted.ciphertext,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          message_count: conversation.messages.length,
          version: newVersion,
          source_device_id: deviceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,session_id" },
      );

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, version: newVersion };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Download conversation history
   */
  async downloadConversations(): Promise<{ success: boolean; data?: ConversationData[]; error?: string }> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized" };
    }

    const { supabase, userId } = this.config;

    try {
      const { data, error } = await supabase
        .from("conversation_sync")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data || data.length === 0) {
        return { success: true, data: [] };
      }

      const conversations: ConversationData[] = [];

      for (const row of data) {
        try {
          const encrypted: E2EEncryptedData = {
            ciphertext: row.encrypted_messages,
            iv: row.iv,
            authTag: row.auth_tag,
            checksum: "", // Checksum not stored for conversations
          };

          // Skip checksum verification for conversations
          const messages = decryptJSON<ConversationMessage[]>(
            { ...encrypted, checksum: encrypted.checksum || "skip" },
            this.encryptionKey!,
          );

          conversations.push({
            sessionId: row.session_id,
            messages,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        } catch {
          // Skip corrupted conversations
          console.error(`Failed to decrypt conversation ${row.session_id}`);
        }
      }

      return { success: true, data: conversations };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const { supabase, userId } = this.config;

    // Get devices
    const { data: devices } = await supabase
      .from("user_devices")
      .select("device_id, device_name, device_type, last_sync_at")
      .eq("user_id", userId);

    // Get remote version
    const { data: syncData } = await supabase
      .from("memory_sync")
      .select("version, created_at")
      .eq("user_id", userId)
      .eq("data_type", "memory")
      .order("version", { ascending: false })
      .limit(1);

    return {
      lastSyncAt: syncData?.[0]?.created_at ?? null,
      localVersion: 0, // To be set by caller
      remoteVersion: syncData?.[0]?.version ?? 0,
      pendingChanges: 0, // To be calculated by caller
      devices:
        devices?.map((d) => ({
          deviceId: d.device_id,
          deviceName: d.device_name,
          deviceType: d.device_type,
          lastSyncAt: d.last_sync_at,
        })) ?? [],
    };
  }

  /**
   * Delete all sync data for user (for account deletion or reset)
   */
  async deleteAllSyncData(): Promise<{ success: boolean; error?: string }> {
    const { supabase, userId } = this.config;

    try {
      await Promise.all([
        supabase.from("memory_sync").delete().eq("user_id", userId),
        supabase.from("memory_deltas").delete().eq("user_id", userId),
        supabase.from("conversation_sync").delete().eq("user_id", userId),
        supabase.from("user_devices").delete().eq("user_id", userId),
        supabase.from("user_key_salts").delete().eq("user_id", userId),
      ]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  // Helper: Split string into chunks
  private splitIntoChunks(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // ============================================
  // Moltbot Integration Methods
  // ============================================

  /**
   * Check if local Moltbot is installed
   */
  checkMoltbotInstalled(): boolean {
    return isMoltbotInstalled();
  }

  /**
   * Get local Moltbot memory statistics
   */
  async getMoltbotStats(agentId: string): Promise<{
    exists: boolean;
    files?: number;
    chunks?: number;
    sessions?: number;
    totalMessages?: number;
  } | null> {
    return getMoltbotMemoryStats(agentId);
  }

  /**
   * Upload local Moltbot data to cloud (E2E encrypted)
   *
   * This exports the local Moltbot memory and sessions, encrypts them,
   * and uploads to Supabase for cross-device sync.
   */
  async uploadMoltbotData(agentId: string): Promise<SyncResult & { stats?: { files: number; chunks: number; sessions: number } }> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized. Call initWithPassphrase first." };
    }

    if (!isMoltbotInstalled()) {
      return { success: false, error: "Moltbot is not installed on this device." };
    }

    const { supabase, userId, deviceId } = this.config;

    try {
      // Export local Moltbot data
      const moltbotData = await exportMoltbotData(agentId);

      if (!moltbotData) {
        return { success: false, error: "Failed to export Moltbot data. No data found." };
      }

      // Serialize and compress
      const jsonData = JSON.stringify(moltbotData);
      const encrypted = await compressAndEncrypt(jsonData, this.encryptionKey);

      // Check if data needs chunking
      const dataSize = encrypted.ciphertext.length;

      if (dataSize <= MAX_CHUNK_SIZE) {
        // Single chunk upload
        const { data, error } = await supabase.rpc("upload_sync_data", {
          p_user_id: userId,
          p_encrypted_data: encrypted.ciphertext,
          p_iv: encrypted.iv,
          p_auth_tag: encrypted.authTag,
          p_data_type: "full_backup",
          p_checksum: encrypted.checksum,
          p_source_device_id: deviceId,
          p_chunk_index: 0,
          p_total_chunks: 1,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        const result = data?.[0];
        if (!result?.success) {
          return { success: false, error: result?.error_message ?? "Upload failed" };
        }

        return {
          success: true,
          version: result.new_version,
          recoveryCode: keyToRecoveryCode(this.encryptionKey),
          stats: {
            files: moltbotData.memory.files.length,
            chunks: moltbotData.memory.chunks.length,
            sessions: moltbotData.sessions.length,
          },
        };
      } else {
        // Multi-chunk upload
        const chunks = this.splitIntoChunks(encrypted.ciphertext, MAX_CHUNK_SIZE);
        const totalChunks = chunks.length;
        let finalVersion = 0;

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabase.rpc("upload_sync_data", {
            p_user_id: userId,
            p_encrypted_data: chunks[i],
            p_iv: encrypted.iv,
            p_auth_tag: encrypted.authTag,
            p_data_type: "full_backup",
            p_checksum: encrypted.checksum,
            p_source_device_id: deviceId,
            p_chunk_index: i,
            p_total_chunks: totalChunks,
          });

          if (error) {
            return { success: false, error: `Chunk ${i} failed: ${error.message}` };
          }

          const result = data?.[0];
          if (result?.success) {
            finalVersion = result.new_version;
          }
        }

        return {
          success: true,
          version: finalVersion,
          recoveryCode: keyToRecoveryCode(this.encryptionKey),
          stats: {
            files: moltbotData.memory.files.length,
            chunks: moltbotData.memory.chunks.length,
            sessions: moltbotData.sessions.length,
          },
        };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Download and restore Moltbot data from cloud
   *
   * Downloads the encrypted Moltbot backup from Supabase, decrypts it,
   * and imports it to the local Moltbot installation.
   */
  async downloadMoltbotData(minVersion: number = 0): Promise<{
    success: boolean;
    data?: MoltbotMemoryExport;
    version?: number;
    error?: string;
  }> {
    if (!this.encryptionKey) {
      return { success: false, error: "Encryption not initialized. Call initWithPassphrase first." };
    }

    const { supabase, userId } = this.config;

    try {
      const { data, error } = await supabase.rpc("download_sync_data", {
        p_user_id: userId,
        p_data_type: "full_backup",
        p_min_version: minVersion,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data || data.length === 0) {
        return { success: true, data: undefined, version: minVersion };
      }

      // Group chunks by version
      const latestVersion = data[0].version;
      const chunks = data.filter((d) => d.version === latestVersion).sort((a, b) => a.chunk_index - b.chunk_index);

      // Reassemble ciphertext
      const ciphertext = chunks.map((c) => c.encrypted_data).join("");

      const encrypted: E2EEncryptedData = {
        ciphertext,
        iv: chunks[0].iv,
        authTag: chunks[0].auth_tag,
        checksum: chunks[0].checksum,
      };

      // Decrypt and decompress
      const decrypted = await decryptAndDecompress(encrypted, this.encryptionKey);
      const moltbotData = JSON.parse(decrypted.toString("utf-8")) as MoltbotMemoryExport;

      return {
        success: true,
        data: moltbotData,
        version: latestVersion,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Full sync: Download from cloud and import to local Moltbot
   */
  async syncMoltbotFromCloud(): Promise<{
    success: boolean;
    stats?: { files: number; chunks: number; sessions: number };
    error?: string;
  }> {
    const downloadResult = await this.downloadMoltbotData();

    if (!downloadResult.success) {
      return { success: false, error: downloadResult.error };
    }

    if (!downloadResult.data) {
      return { success: true, stats: { files: 0, chunks: 0, sessions: 0 } };
    }

    // Import to local Moltbot
    const importResult = await importMoltbotData(downloadResult.data);

    if (!importResult.success) {
      return { success: false, error: importResult.error };
    }

    return {
      success: true,
      stats: importResult.stats,
    };
  }

  /**
   * Full sync: Export local Moltbot and upload to cloud
   */
  async syncMoltbotToCloud(agentId: string): Promise<{
    success: boolean;
    version?: number;
    stats?: { files: number; chunks: number; sessions: number };
    error?: string;
  }> {
    return this.uploadMoltbotData(agentId);
  }
}

// Factory function
export function createMemorySyncManager(config: SyncConfig): MemorySyncManager {
  return new MemorySyncManager(config);
}

// Re-export Moltbot types
export type { MoltbotMemoryExport };
