/**
 * Android - 行程詳情視圖模型
 */

package com.openclaw.tripplanner.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.tripplanner.model.Trip
import com.openclaw.tripplanner.model.Itinerary
import com.openclaw.tripplanner.api.TripPlannerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TripDetailViewModel(private val service: TripPlannerService) : ViewModel() {
    
    private val _trip = MutableStateFlow<Trip?>(null)
    val trip: StateFlow<Trip?> = _trip.asStateFlow()
    
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    fun loadTrip(tripId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = service.getTrip(tripId)
                if (response.isSuccessful) {
                    _trip.value = response.body()
                    _error.value = null
                } else {
                    _error.value = "無法加載行程詳情"
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _isLoading.value = false
            }
        }
    }
    
    fun updateTrip(updatedTrip: Trip) {
        viewModelScope.launch {
            try {
                val response = service.updateTrip(updatedTrip.id, updatedTrip)
                if (response.isSuccessful) {
                    _trip.value = response.body()
                    _error.value = null
                } else {
                    _error.value = "無法更新行程"
                }
            } catch (e: Exception) {
                _error.value = e.message
            }
        }
    }
    
    fun addItinerary(itinerary: Itinerary) {
        viewModelScope.launch {
            val currentTrip = _trip.value ?: return@launch
            try {
                val response = service.addItinerary(currentTrip.id, itinerary)
                if (response.isSuccessful) {
                    currentTrip.itineraries.add(response.body() ?: itinerary)
                    _trip.value = currentTrip.copy()
                } else {
                    _error.value = "無法新增行程詳情"
                }
            } catch (e: Exception) {
                _error.value = e.message
            }
        }
    }
    
    fun deleteItinerary(itineraryId: String) {
        viewModelScope.launch {
            val currentTrip = _trip.value ?: return@launch
            try {
                val response = service.deleteItinerary(itineraryId)
                if (response.isSuccessful) {
                    currentTrip.itineraries.removeAll { it.id == itineraryId }
                    _trip.value = currentTrip.copy()
                } else {
                    _error.value = "無法刪除行程詳情"
                }
            } catch (e: Exception) {
                _error.value = e.message
            }
        }
    }
    
    fun clearError() {
        _error.value = null
    }
}
