/**
 * Android - API 服務
 */

package com.openclaw.tripplanner.api

import com.openclaw.tripplanner.model.*
import retrofit2.Response
import retrofit2.http.*

interface TripPlannerService {
    
    // ============ 行程管理 ============
    
    @POST("trips")
    suspend fun createTrip(@Body trip: Trip): Response<Trip>
    
    @GET("trips/{tripId}")
    suspend fun getTrip(@Path("tripId") tripId: String): Response<Trip>
    
    @PUT("trips/{tripId}")
    suspend fun updateTrip(
        @Path("tripId") tripId: String,
        @Body trip: Trip
    ): Response<Trip>
    
    @DELETE("trips/{tripId}")
    suspend fun deleteTrip(@Path("tripId") tripId: String): Response<Unit>
    
    @GET("users/{userId}/trips")
    suspend fun getUserTrips(@Path("userId") userId: String): Response<List<Trip>>
    
    // ============ 地點管理 ============
    
    @POST("trips/{tripId}/locations")
    suspend fun addLocation(
        @Path("tripId") tripId: String,
        @Body location: Location
    ): Response<Location>
    
    @DELETE("trips/{tripId}/locations/{locationId}")
    suspend fun deleteLocation(
        @Path("tripId") tripId: String,
        @Path("locationId") locationId: String
    ): Response<Unit>
    
    // ============ 行程詳情 ============
    
    @POST("trips/{tripId}/itineraries")
    suspend fun addItinerary(
        @Path("tripId") tripId: String,
        @Body itinerary: Itinerary
    ): Response<Itinerary>
    
    @PUT("itineraries/{itineraryId}")
    suspend fun updateItinerary(
        @Path("itineraryId") itineraryId: String,
        @Body itinerary: Itinerary
    ): Response<Itinerary>
    
    @DELETE("itineraries/{itineraryId}")
    suspend fun deleteItinerary(
        @Path("itineraryId") itineraryId: String
    ): Response<Unit>
    
    // ============ 預算管理 ============
    
    @GET("trips/{tripId}/budget")
    suspend fun getBudgetSummary(@Path("tripId") tripId: String): Response<BudgetSummary>
    
    data class BudgetSummary(
        val tripId: String,
        val totalBudget: Double,
        val spentBudget: Double,
        val remaining: Double,
        val byCategory: Map<String, Double>
    )
    
    // ============ 行程共享 ============
    
    @POST("trips/{tripId}/share")
    suspend fun shareTrip(
        @Path("tripId") tripId: String,
        @Body shareRequest: ShareRequest
    ): Response<TripShare>
    
    @DELETE("trips/{tripId}/share/{userId}")
    suspend fun revokeShare(
        @Path("tripId") tripId: String,
        @Path("userId") userId: String
    ): Response<Unit>
    
    data class ShareRequest(
        val userId: String,
        val permission: String = "view"
    )
    
    @GET("trips/shared")
    suspend fun getSharedTrips(): Response<List<Trip>>
    
    // ============ 天氣 ============
    
    @GET("weather")
    suspend fun getWeather(
        @Query("location") location: String,
        @Query("date") date: String
    ): Response<WeatherData>
    
    // ============ 景點評分 ============
    
    @POST("locations/{locationId}/reviews")
    suspend fun addReview(
        @Path("locationId") locationId: String,
        @Body review: PlaceReview
    ): Response<PlaceReview>
    
    @GET("locations/{locationId}/reviews")
    suspend fun getReviews(@Path("locationId") locationId: String): Response<ReviewsResponse>
    
    data class ReviewsResponse(
        val locationId: String,
        val reviews: List<PlaceReview>,
        val averageRating: Double
    )
}
