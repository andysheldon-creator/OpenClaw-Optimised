/**
 * 旅遊行程規劃共享模型 (Swift)
 */

import Foundation

// MARK: - 地點
struct Location: Codable, Identifiable {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double
    let address: String
    let placeId: String?
    let rating: Double?
    let photoUrl: String?
}

// MARK: - 交通方式
enum TransportationType: String, Codable {
    case walking
    case driving
    case publicTransit = "public_transit"
    case cycling
    
    var displayName: String {
        switch self {
        case .walking: return "步行"
        case .driving: return "駕駛"
        case .publicTransit: return "大眾運輸"
        case .cycling: return "騎自行車"
        }
    }
}

struct Transportation: Codable {
    let id: String
    let type: TransportationType
    let duration: Int // 分鐘
    let distance: Double? // 公里
    let cost: Double? // 台幣
    let notes: String?
}

// MARK: - 行程詳情
struct Itinerary: Codable, Identifiable {
    let id: String
    let tripId: String
    let locationId: String
    let order: Int
    let startTime: Date
    let endTime: Date
    let transportation: Transportation?
    let notes: String?
    let budget: Double?
    let photos: [String]
}

// MARK: - 天氣
struct WeatherData: Codable {
    let location: String
    let date: Date
    let temperature: Double
    let condition: String
    let humidity: Int
    let windSpeed: Double
}

// MARK: - 地點評論
struct PlaceReview: Codable, Identifiable {
    let id: String
    let locationId: String
    let userId: String
    let rating: Int // 1-5
    let comment: String
    let createdAt: Date
}

// MARK: - 行程
struct Trip: Codable, Identifiable {
    let id: String
    let userId: String
    let title: String
    let description: String?
    let startDate: Date
    let endDate: Date
    var locations: [Location]
    var itineraries: [Itinerary]
    let sharedWith: [String]
    var totalBudget: Double
    var spentBudget: Double
    let createdAt: Date
    let updatedAt: Date
    
    var remainingBudget: Double {
        totalBudget - spentBudget
    }
    
    var duration: Int {
        Int(endDate.timeIntervalSince(startDate) / (24 * 3600))
    }
}

// MARK: - 行程分享
struct TripShare: Codable, Identifiable {
    let id: String
    let tripId: String
    let sharedBy: String
    let sharedWith: String
    let permission: String // "view" or "edit"
    let createdAt: Date
}
