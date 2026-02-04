/**
 * Android - 行程列表 UI
 */

package com.openclaw.tripplanner.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.tripplanner.model.Trip
import com.openclaw.tripplanner.viewmodel.TripListViewModel
import java.time.format.DateTimeFormatter

@Composable
fun TripListScreen(
    viewModel: TripListViewModel = viewModel(),
    onTripSelected: (Trip) -> Unit,
    onCreateTrip: () -> Unit,
    userId: String
) {
    val trips by viewModel.trips.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    
    LaunchedEffect(userId) {
        viewModel.loadTrips(userId)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("旅遊行程") },
                actions = {
                    IconButton(onClick = onCreateTrip) {
                        Icon(Icons.Default.Add, contentDescription = "新增行程")
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (trips.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Default.Map,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.outlineVariant
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Text(
                        "沒有行程",
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center
                    )
                    
                    Text(
                        "建立您的第一個旅遊行程",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.outline
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Button(onClick = onCreateTrip) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("新增行程")
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                items(trips) { trip ->
                    TripCard(
                        trip = trip,
                        onClick = { onTripSelected(trip) },
                        onDelete = { viewModel.deleteTrip(trip.id) }
                    )
                }
            }
        }
    }
    
    error?.let {
        LaunchedEffect(it) {
            viewModel.clearError()
        }
        Snackbar(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(it)
        }
    }
}

@Composable
fun TripCard(
    trip: Trip,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        trip.title,
                        style = MaterialTheme.typography.titleMedium
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    val formatter = DateTimeFormatter.ofPattern("MMM d")
                    Text(
                        "${trip.startDate.format(formatter)} - ${trip.endDate.format(formatter)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                    
                    Text(
                        "${trip.locations.size} 地點 | ${trip.duration} 天",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
                
                Column(
                    horizontalAlignment = Alignment.End
                ) {
                    Text(
                        "$${trip.totalBudget.toInt()}",
                        style = MaterialTheme.typography.titleMedium
                    )
                    
                    LinearProgressIndicator(
                        progress = { trip.spentBudget / trip.totalBudget },
                        modifier = Modifier
                            .width(80.dp)
                            .height(4.dp)
                    )
                }
            }
            
            if (trip.description != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    trip.description,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1
                )
            }
        }
    }
}
