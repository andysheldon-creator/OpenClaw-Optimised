/**
 * Android - 行程規劃數據模型 (Kotlin)
 */

package com.openclaw.tripplanner.model

import java.time.LocalDateTime
import java.time.LocalDate

data class Location(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val address: String,
    val placeId: String? = null,
    val rating: Double? = null,
    val photoUrl: String? = null
)

enum class TransportationType {
    WALKING, DRIVING, PUBLIC_TRANSIT, CYCLING;
    
    val displayName: String
        get() = when (this) {
            WALKING -> "步行"
            DRIVING -> "駕駛"
            PUBLIC_TRANSIT -> "大眾運輸"
            CYCLING -> "騎自行車"
        }
}

data class Transportation(
    val id: String,
    val type: TransportationType,
    val duration: Int, // 分鐘
    val distance: Double? = null, // 公里
    val cost: Double? = null, // 台幣
    val notes: String? = null
)

data class Itinerary(
    val id: String,
    val tripId: String,
    val locationId: String,
    val order: Int,
    val startTime: LocalDateTime,
    val endTime: LocalDateTime,
    val transportation: Transportation? = null,
    val notes: String? = null,
    val budget: Double? = null,
    val photos: List<String> = emptyList()
)

data class WeatherData(
    val location: String,
    val date: LocalDate,
    val temperature: Double,
    val condition: String,
    val humidity: Int,
    val windSpeed: Double
)

data class PlaceReview(
    val id: String,
    val locationId: String,
    val userId: String,
    val rating: Int, // 1-5
    val comment: String,
    val createdAt: LocalDateTime
)

data class Trip(
    val id: String,
    val userId: String,
    val title: String,
    val description: String? = null,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val locations: MutableList<Location> = mutableListOf(),
    val itineraries: MutableList<Itinerary> = mutableListOf(),
    val sharedWith: List<String> = emptyList(),
    val totalBudget: Double,
    val spentBudget: Double = 0.0,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime
) {
    val remainingBudget: Double
        get() = totalBudget - spentBudget
    
    val duration: Int
        get() = endDate.toEpochDay().toInt() - startDate.toEpochDay().toInt()
}

data class TripShare(
    val id: String,
    val tripId: String,
    val sharedBy: String,
    val sharedWith: String,
    val permission: String, // "view" or "edit"
    val createdAt: LocalDateTime
)

data class User(
    val id: String,
    val email: String,
    val name: String,
    val avatar: String? = null,
    val createdAt: LocalDateTime
)
