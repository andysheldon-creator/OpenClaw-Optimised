/**
 * Sync Command Handler
 *
 * Handles KakaoTalk commands for memory synchronization.
 * Commands:
 *   /동기화 설정 <암호>     - Initialize sync with passphrase
 *   /동기화 업로드         - Upload local memory to cloud
 *   /동기화 다운로드       - Download memory from cloud
 *   /동기화 상태           - Check sync status
 *   /동기화 기기목록       - List synced devices
 *   /동기화 삭제           - Delete all synced data
 */

import { getSupabase } from "../supabase.js";
import { createMemorySyncManager, type ConversationData, type MemoryData, type SyncConfig } from "./memory-sync.js";

export interface SyncCommandContext {
  kakaoUserId: string;
  userId: string; // Supabase user UUID
  deviceId: string;
  deviceName?: string;
  deviceType?: "mobile" | "desktop" | "tablet" | "unknown";
}

export interface SyncCommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// Active sync managers (keyed by kakaoUserId)
const activeSyncManagers = new Map<
  string,
  {
    manager: ReturnType<typeof createMemorySyncManager>;
    expiresAt: number;
  }
>();

// Session timeout: 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Get or create sync manager for user
 */
function getSyncManager(context: SyncCommandContext): ReturnType<typeof createMemorySyncManager> | null {
  const existing = activeSyncManagers.get(context.kakaoUserId);

  if (existing && existing.expiresAt > Date.now()) {
    // Extend session
    existing.expiresAt = Date.now() + SESSION_TIMEOUT;
    return existing.manager;
  }

  return null;
}

/**
 * Create and cache sync manager
 */
function createAndCacheSyncManager(context: SyncCommandContext): ReturnType<typeof createMemorySyncManager> {
  const config: SyncConfig = {
    supabase: getSupabase(),
    userId: context.userId,
    kakaoUserId: context.kakaoUserId,
    deviceId: context.deviceId,
    deviceName: context.deviceName,
    deviceType: context.deviceType,
  };

  const manager = createMemorySyncManager(config);

  activeSyncManagers.set(context.kakaoUserId, {
    manager,
    expiresAt: Date.now() + SESSION_TIMEOUT,
  });

  return manager;
}

/**
 * Parse sync command from message
 */
export function parseSyncCommand(message: string): { command: string; args: string[] } | null {
  const trimmed = message.trim();

  // Korean commands
  if (trimmed.startsWith("/동기화")) {
    const parts = trimmed.slice(4).trim().split(/\s+/);
    const command = parts[0] || "help";
    const args = parts.slice(1);
    return { command, args };
  }

  // English commands (alias)
  if (trimmed.startsWith("/sync")) {
    const parts = trimmed.slice(5).trim().split(/\s+/);
    const command = parts[0] || "help";
    const args = parts.slice(1);
    return { command, args };
  }

  return null;
}

/**
 * Handle sync setup command
 * /동기화 설정 <암호>
 */
async function handleSetup(context: SyncCommandContext, passphrase: string): Promise<SyncCommandResult> {
  if (!passphrase || passphrase.length < 8) {
    return {
      success: false,
      message: "⚠️ 암호는 8자 이상이어야 합니다.\n\n사용법: /동기화 설정 <암호>",
    };
  }

  const manager = createAndCacheSyncManager(context);

  try {
    const result = await manager.initWithPassphrase(passphrase);

    if (result.isNewUser) {
      return {
        success: true,
        message:
          `✅ 동기화 설정 완료!\n\n` +
          `🔐 복구 코드: ${result.recoveryCode}\n\n` +
          `⚠️ 이 복구 코드를 안전한 곳에 저장하세요.\n` +
          `암호를 잊어버렸을 때 필요합니다.\n\n` +
          `이제 "/동기화 업로드"로 메모리를 업로드하세요.`,
        data: { recoveryCode: result.recoveryCode },
      };
    } else {
      return {
        success: true,
        message:
          `✅ 동기화 연결 완료!\n\n` +
          `기존 동기화 데이터에 연결되었습니다.\n` +
          `"/동기화 다운로드"로 메모리를 가져오세요.`,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ 설정 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle upload command
 * /동기화 업로드 [agentId]
 */
async function handleUpload(context: SyncCommandContext, agentId?: string): Promise<SyncCommandResult> {
  const manager = getSyncManager(context);

  if (!manager) {
    return {
      success: false,
      message: '⚠️ 먼저 "/동기화 설정 <암호>"로 동기화를 설정해주세요.',
    };
  }

  // Check if Moltbot is installed
  if (!manager.checkMoltbotInstalled()) {
    return {
      success: false,
      message:
        "⚠️ Moltbot이 설치되어 있지 않습니다.\n\n" +
        "이 기기에 Moltbot을 먼저 설치해주세요.\n" +
        "설치: npm install -g moltbot",
    };
  }

  // Use default agent ID if not provided
  const targetAgentId = agentId || "main";

  try {
    const result = await manager.uploadMoltbotData(targetAgentId);

    if (result.success) {
      const stats = result.stats;
      return {
        success: true,
        message:
          `✅ Moltbot 메모리 업로드 완료!\n\n` +
          `📊 버전: ${result.version}\n` +
          `📁 파일: ${stats?.files ?? 0}개\n` +
          `📝 청크: ${stats?.chunks ?? 0}개\n` +
          `💬 세션: ${stats?.sessions ?? 0}개\n` +
          `🔐 복구 코드: ${result.recoveryCode}\n\n` +
          `다른 기기에서 "/동기화 다운로드"로\n` +
          `메모리를 가져올 수 있습니다.`,
        data: { version: result.version, stats: result.stats },
      };
    } else {
      return {
        success: false,
        message: `❌ 업로드 실패: ${result.error}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ 업로드 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle download command
 * /동기화 다운로드
 */
async function handleDownload(context: SyncCommandContext): Promise<SyncCommandResult> {
  const manager = getSyncManager(context);

  if (!manager) {
    return {
      success: false,
      message: '⚠️ 먼저 "/동기화 설정 <암호>"로 동기화를 설정해주세요.',
    };
  }

  try {
    // First try to download Moltbot full backup
    const moltbotResult = await manager.downloadMoltbotData();

    if (moltbotResult.success && moltbotResult.data) {
      // Check if Moltbot is installed for import
      if (manager.checkMoltbotInstalled()) {
        // Import to local Moltbot
        const syncResult = await manager.syncMoltbotFromCloud();

        if (syncResult.success) {
          const stats = syncResult.stats;
          return {
            success: true,
            message:
              `✅ Moltbot 메모리 다운로드 및 복원 완료!\n\n` +
              `📊 버전: ${moltbotResult.version}\n` +
              `📁 파일: ${stats?.files ?? 0}개\n` +
              `📝 청크: ${stats?.chunks ?? 0}개\n` +
              `💬 세션: ${stats?.sessions ?? 0}개\n\n` +
              `로컬 Moltbot에 메모리가 복원되었습니다.`,
            data: { version: moltbotResult.version, stats },
          };
        } else {
          return {
            success: false,
            message: `❌ 복원 실패: ${syncResult.error}\n\n데이터는 다운로드되었으나 로컬에 복원하지 못했습니다.`,
          };
        }
      } else {
        // Just return the data info (can't import without Moltbot)
        const data = moltbotResult.data;
        return {
          success: true,
          message:
            `✅ 메모리 다운로드 완료!\n\n` +
            `📊 버전: ${moltbotResult.version}\n` +
            `📁 파일: ${data.memory.files.length}개\n` +
            `📝 청크: ${data.memory.chunks.length}개\n` +
            `💬 세션: ${data.sessions.length}개\n\n` +
            `⚠️ Moltbot이 설치되지 않아 로컬에 복원하지 못했습니다.\n` +
            `Moltbot 설치 후 다시 다운로드하세요.`,
          data: moltbotResult.data,
        };
      }
    }

    // Fallback to simple memory download
    const result = await manager.downloadMemory();

    if (result.success) {
      if (!result.data) {
        return {
          success: true,
          message: "📭 동기화된 메모리가 없습니다.\n\n" + '먼저 다른 기기에서 "/동기화 업로드"를 실행하세요.',
        };
      }

      const chunkCount = result.data.chunks?.length ?? 0;

      return {
        success: true,
        message:
          `✅ 메모리 다운로드 완료!\n\n` +
          `📊 버전: ${result.version}\n` +
          `📝 메모리 청크: ${chunkCount}개\n` +
          `🕐 마지막 동기화: ${result.data.metadata?.lastUpdated ?? "알 수 없음"}`,
        data: result.data,
      };
    } else {
      return {
        success: false,
        message: `❌ 다운로드 실패: ${result.error}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ 다운로드 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle status command
 * /동기화 상태
 */
async function handleStatus(context: SyncCommandContext): Promise<SyncCommandResult> {
  const manager = getSyncManager(context);

  if (!manager) {
    return {
      success: false,
      message:
        "📊 동기화 상태\n\n" + "❌ 동기화가 설정되지 않았습니다.\n\n" + '"/동기화 설정 <암호>"로 시작하세요.',
    };
  }

  try {
    const status = await manager.getSyncStatus();

    const deviceList = status.devices
      .map((d) => `  • ${d.deviceName ?? d.deviceId.slice(0, 8)} (${d.deviceType ?? "unknown"})`)
      .join("\n");

    return {
      success: true,
      message:
        `📊 동기화 상태\n\n` +
        `✅ 동기화 활성화됨\n` +
        `📦 서버 버전: ${status.remoteVersion}\n` +
        `🕐 마지막 동기화: ${status.lastSyncAt ?? "없음"}\n\n` +
        `📱 연결된 기기 (${status.devices.length}개):\n` +
        (deviceList || "  없음"),
      data: status,
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ 상태 조회 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle device list command
 * /동기화 기기목록
 */
async function handleDeviceList(context: SyncCommandContext): Promise<SyncCommandResult> {
  const manager = getSyncManager(context);

  if (!manager) {
    return {
      success: false,
      message: '⚠️ 먼저 "/동기화 설정 <암호>"로 동기화를 설정해주세요.',
    };
  }

  try {
    const status = await manager.getSyncStatus();

    if (status.devices.length === 0) {
      return {
        success: true,
        message: "📱 연결된 기기\n\n" + "등록된 기기가 없습니다.",
      };
    }

    const deviceList = status.devices
      .map((d, i) => {
        const lastSync = d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString("ko-KR") : "없음";
        return `${i + 1}. ${d.deviceName ?? "이름 없음"}\n` + `   ID: ${d.deviceId.slice(0, 12)}...\n` + `   종류: ${d.deviceType ?? "알 수 없음"}\n` + `   마지막 동기화: ${lastSync}`;
      })
      .join("\n\n");

    return {
      success: true,
      message: `📱 연결된 기기 (${status.devices.length}개)\n\n${deviceList}`,
      data: status.devices,
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ 기기 목록 조회 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle delete command
 * /동기화 삭제
 */
async function handleDelete(context: SyncCommandContext, confirmed: boolean = false): Promise<SyncCommandResult> {
  if (!confirmed) {
    return {
      success: false,
      message:
        "⚠️ 정말로 모든 동기화 데이터를 삭제하시겠습니까?\n\n" +
        "이 작업은 되돌릴 수 없습니다:\n" +
        "• 모든 암호화된 메모리\n" +
        "• 모든 대화 기록\n" +
        "• 모든 기기 등록 정보\n\n" +
        '확인하려면 "/동기화 삭제 확인"을 입력하세요.',
    };
  }

  const manager = getSyncManager(context);

  if (!manager) {
    // Create temporary manager for deletion
    const tempManager = createAndCacheSyncManager(context);
    const result = await tempManager.deleteAllSyncData();

    if (result.success) {
      activeSyncManagers.delete(context.kakaoUserId);
      return {
        success: true,
        message: "✅ 모든 동기화 데이터가 삭제되었습니다.\n\n" + '새로 시작하려면 "/동기화 설정 <암호>"를 사용하세요.',
      };
    } else {
      return {
        success: false,
        message: `❌ 삭제 실패: ${result.error}`,
      };
    }
  }

  try {
    const result = await manager.deleteAllSyncData();

    if (result.success) {
      activeSyncManagers.delete(context.kakaoUserId);
      return {
        success: true,
        message: "✅ 모든 동기화 데이터가 삭제되었습니다.\n\n" + '새로 시작하려면 "/동기화 설정 <암호>"를 사용하세요.',
      };
    } else {
      return {
        success: false,
        message: `❌ 삭제 실패: ${result.error}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `❌ 삭제 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    };
  }
}

/**
 * Handle help command
 * /동기화 or /동기화 도움말
 */
function handleHelp(): SyncCommandResult {
  return {
    success: true,
    message:
      `🔄 메모리 동기화 도움말\n\n` +
      `여러 기기에서 AI 메모리를 동기화할 수 있습니다.\n` +
      `모든 데이터는 암호화되어 저장됩니다.\n\n` +
      `📋 사용 가능한 명령어:\n\n` +
      `/동기화 설정 <암호>\n` +
      `  → 동기화 시작 (8자 이상)\n\n` +
      `/동기화 업로드\n` +
      `  → 현재 기기 메모리 업로드\n\n` +
      `/동기화 다운로드\n` +
      `  → 클라우드에서 메모리 가져오기\n\n` +
      `/동기화 상태\n` +
      `  → 동기화 상태 확인\n\n` +
      `/동기화 기기목록\n` +
      `  → 연결된 기기 목록\n\n` +
      `/동기화 삭제\n` +
      `  → 모든 동기화 데이터 삭제`,
  };
}

/**
 * Main command handler
 */
export async function handleSyncCommand(
  context: SyncCommandContext,
  message: string,
  options?: {
    memoryData?: MemoryData;
    conversationData?: ConversationData;
  },
): Promise<SyncCommandResult> {
  const parsed = parseSyncCommand(message);

  if (!parsed) {
    return { success: false, message: "Invalid command" };
  }

  const { command, args } = parsed;

  switch (command) {
    case "설정":
    case "setup":
    case "init":
      return handleSetup(context, args.join(" "));

    case "업로드":
    case "upload":
    case "push":
      return handleUpload(context, options?.memoryData);

    case "다운로드":
    case "download":
    case "pull":
      return handleDownload(context);

    case "상태":
    case "status":
      return handleStatus(context);

    case "기기목록":
    case "devices":
      return handleDeviceList(context);

    case "삭제":
    case "delete":
    case "reset":
      return handleDelete(context, args[0] === "확인" || args[0] === "confirm");

    case "도움말":
    case "help":
    default:
      return handleHelp();
  }
}

/**
 * Check if message is a sync command
 */
export function isSyncCommand(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith("/동기화") || trimmed.startsWith("/sync");
}
