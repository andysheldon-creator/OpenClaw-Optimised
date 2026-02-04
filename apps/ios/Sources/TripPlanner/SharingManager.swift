/**
 * iOS - 共享功能實現
 */

import Foundation

// MARK: - 共享管理器
class TripSharingManager: NSObject {
    static let shared = TripSharingManager()
    
    /// 生成分享鏈接
    func generateShareLink(for trip: Trip) -> String {
        let baseURL = URL(string: "https://app.example.com") ?? URL(fileURLWithPath: "/")
        let components = URLComponents(
            url: baseURL.appendingPathComponent("shared").appendingPathComponent(trip.id),
            resolvingAgainstBaseURL: true
        )
        return components?.url?.absoluteString ?? ""
    }
    
    /// 生成 QR 碼
    func generateQRCode(for trip: Trip) -> UIImage? {
        let link = generateShareLink(for: trip)
        guard let qrData = link.data(using: .utf8) else { return nil }
        
        let filter = CIFilter(name: "CIQRCodeGenerator")
        filter?.setValue(qrData, forKey: "inputMessage")
        
        guard let output = filter?.outputImage else { return nil }
        
        let context = CIContext()
        let cgImage = context.createCGImage(output, from: output.extent)
        
        return cgImage.map { UIImage(cgImage: $0) }
    }
    
    /// 分享行程到其他應用
    func shareTrip(_ trip: Trip, from viewController: UIViewController) {
        let link = generateShareLink(for: trip)
        let items = [
            "查看我的旅遊行程：\(trip.title)",
            link
        ]
        
        let activityVC = UIActivityViewController(
            activityItems: items,
            applicationActivities: nil
        )
        
        viewController.present(activityVC, animated: true)
    }
    
    /// 複製分享鏈接
    func copyShareLink(for trip: Trip) {
        let link = generateShareLink(for: trip)
        UIPasteboard.general.string = link
    }
}

// MARK: - 權限驗證
class PermissionValidator {
    static let shared = PermissionValidator()
    
    /// 檢查用戶是否可以查看行程
    func canView(trip: Trip, userId: String) -> Bool {
        return trip.userId == userId || trip.sharedWith.contains(userId)
    }
    
    /// 檢查用戶是否可以編輯行程
    func canEdit(trip: Trip, userId: String) -> Bool {
        // 僅所有者可以編輯
        return trip.userId == userId
    }
    
    /// 檢查用戶是否可以刪除行程
    func canDelete(trip: Trip, userId: String) -> Bool {
        // 僅所有者可以刪除
        return trip.userId == userId
    }
}

// MARK: - 邀請管理
struct ShareInvitation: Codable {
    let id: String
    let tripId: String
    let invitedEmail: String
    let invitedBy: String
    let permission: String
    let token: String
    let expiresAt: Date
    let status: String
    let createdAt: Date
}

class InvitationManager: NSObject {
    static let shared = InvitationManager()
    
    /// 複製邀請鏈接
    func copyInvitationLink(for tripId: String, token: String) {
        let baseURL = "https://app.example.com"
        let link = "\(baseURL)/invite?trip=\(tripId)&token=\(token)"
        UIPasteboard.general.string = link
    }
    
    /// 接受邀請
    func acceptInvitation(token: String) async -> Bool {
        // TODO: 調用 API 接受邀請
        return true
    }
    
    /// 拒絕邀請
    func rejectInvitation(token: String) async -> Bool {
        // TODO: 調用 API 拒絕邀請
        return true
    }
}
