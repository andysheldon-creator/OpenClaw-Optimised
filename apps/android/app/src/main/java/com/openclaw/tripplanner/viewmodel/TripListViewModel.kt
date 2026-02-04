/**
 * Android - 行程列表視圖模型
 */

package com.openclaw.tripplanner.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.tripplanner.model.Trip
import com.openclaw.tripplanner.api.TripPlannerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TripListViewModel(private val service: TripPlannerService) : ViewModel() {
    
    private val _trips = MutableStateFlow<List<Trip>>(emptyList())
    val trips: StateFlow<List<Trip>> = _trips.asStateFlow()
    
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    fun loadTrips(userId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = service.getUserTrips(userId)
                if (response.isSuccessful) {
                    _trips.value = response.body() ?: emptyList()
                    _error.value = null
                } else {
                    _error.value = "無法加載行程"
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _isLoading.value = false
            }
        }
    }
    
    fun deleteTrip(tripId: String) {
        viewModelScope.launch {
            try {
                val response = service.deleteTrip(tripId)
                if (response.isSuccessful) {
                    _trips.value = _trips.value.filter { it.id != tripId }
                } else {
                    _error.value = "無法刪除行程"
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
