/**
 * 用戶共享功能實現
 */

import crypto from "crypto";
import type { Trip, TripShare, User } from "./types";

export interface ShareInvitation {
  id: string;
  tripId: string;
  invitedEmail: string;
  invitedBy: string;
  permission: "view" | "edit";
  token: string;
  expiresAt: Date;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
}

/**
 * 共享管理服務
 */
export class SharingManager {
  /**
   * 生成分享邀請令牌
   */
  generateShareToken(tripId: string, userId: string): string {
    const data = `${tripId}:${userId}:${Date.now()}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * 發送分享邀請
   */
  async sendShareInvitation(
    trip: Trip,
    invitedEmail: string,
    invitedBy: string,
    permission: "view" | "edit" = "view",
  ): Promise<ShareInvitation> {
    const token = this.generateShareToken(trip.id, invitedEmail);

    const invitation: ShareInvitation = {
      id: crypto.randomUUID(),
      tripId: trip.id,
      invitedEmail,
      invitedBy,
      permission,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      status: "pending",
      createdAt: new Date(),
    };

    // TODO: 發送郵件邀請
    // const emailService = new EmailService();
    // await emailService.sendShareInvitation(invitation, trip);

    // TODO: 存儲到數據庫
    console.log("Share invitation created:", invitation);

    return invitation;
  }

  /**
   * 接受分享邀請
   */
  async acceptShareInvitation(token: string, userId: string): Promise<TripShare> {
    // TODO: 從數據庫驗證 token
    // TODO: 檢查 token 是否過期
    // TODO: 創建 TripShare 記錄

    const share: TripShare = {
      id: crypto.randomUUID(),
      tripId: "trip-id",
      sharedBy: "inviter-id",
      sharedWith: userId,
      permission: "view",
      createdAt: new Date(),
    };

    return share;
  }

  /**
   * 取消分享
   */
  async revokeShare(tripId: string, sharedWithUserId: string): Promise<void> {
    // TODO: 從數據庫刪除分享記錄
    console.log(`Revoked share for trip ${tripId} with user ${sharedWithUserId}`);
  }

  /**
   * 生成可公開分享的鏈接（支持查看但無需登錄）
   */
  generatePublicShareLink(
    tripId: string,
    expiresInDays: number = 30,
  ): { link: string; token: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const baseUrl = process.env.APP_URL || "https://app.example.com";
    const link = `${baseUrl}/shared/${tripId}?token=${token}`;

    // TODO: 存儲公開鏈接令牌

    return { link, token, expiresAt };
  }

  /**
   * 獲取行程的共享列表
   */
  async getTripShares(tripId: string): Promise<TripShare[]> {
    // TODO: 從數據庫獲取所有分享記錄
    return [];
  }

  /**
   * 更新共享權限
   */
  async updateSharePermission(
    tripId: string,
    sharedWithUserId: string,
    permission: "view" | "edit",
  ): Promise<TripShare> {
    // TODO: 更新數據庫中的權限

    const share: TripShare = {
      id: crypto.randomUUID(),
      tripId,
      sharedBy: "current-user",
      sharedWith: sharedWithUserId,
      permission,
      createdAt: new Date(),
    };

    return share;
  }
}

/**
 * 權限驗證服務
 */
export class PermissionValidator {
  /**
   * 檢查用戶是否有權限訪問行程
   */
  async canAccessTrip(userId: string, tripId: string): Promise<boolean> {
    // 檢查用戶是否是行程所有者
    // TODO: const trip = await getTrip(tripId);
    // if (trip.userId === userId) return true;

    // 檢查用戶是否被分享了訪問權限
    // TODO: const shares = await getTripShares(tripId);
    // return shares.some(s => s.sharedWith === userId);

    return false;
  }

  /**
   * 檢查用戶是否有權限編輯行程
   */
  async canEditTrip(userId: string, tripId: string): Promise<boolean> {
    // 檢查用戶是否是行程所有者
    // TODO: const trip = await getTrip(tripId);
    // if (trip.userId === userId) return true;

    // 檢查用戶是否被分享了編輯權限
    // TODO: const shares = await getTripShares(tripId);
    // return shares.some(s => s.sharedWith === userId && s.permission === 'edit');

    return false;
  }

  /**
   * 檢查用戶是否有權限刪除行程
   */
  async canDeleteTrip(userId: string, tripId: string): Promise<boolean> {
    // 只有所有者可以刪除行程
    // TODO: const trip = await getTrip(tripId);
    // return trip.userId === userId;

    return false;
  }

  /**
   * 檢查用戶是否可以管理共享
   */
  async canManageSharing(userId: string, tripId: string): Promise<boolean> {
    // 只有所有者可以管理共享
    // TODO: const trip = await getTrip(tripId);
    // return trip.userId === userId;

    return false;
  }
}

export default { SharingManager, PermissionValidator };
