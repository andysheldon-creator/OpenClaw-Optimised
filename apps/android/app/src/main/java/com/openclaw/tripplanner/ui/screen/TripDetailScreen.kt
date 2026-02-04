/**
 * Android - 行程詳情 UI
 */

package com.openclaw.tripplanner.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.tripplanner.model.Trip
import com.openclaw.tripplanner.model.Itinerary
import com.openclaw.tripplanner.viewmodel.TripDetailViewModel
import java.time.format.DateTimeFormatter

@Composable
fun TripDetailScreen(
    tripId: String,
    viewModel: TripDetailViewModel = viewModel(),
    onBackClick: () -> Unit
) {
    val trip by viewModel.trip.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    
    LaunchedEffect(tripId) {
        viewModel.loadTrip(tripId)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(trip?.title ?: "行程詳情") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
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
        } else if (trip != null) {
            TripDetailContent(
                trip = trip!!,
                viewModel = viewModel,
                modifier = Modifier.padding(padding)
            )
        }
    }
}

@Composable
fun TripDetailContent(
    trip: Trip,
    viewModel: TripDetailViewModel,
    modifier: Modifier = Modifier
) {
    val pagerState = rememberPagerState(pageCount = { 4 })
    val tabTitles = listOf("行程", "地圖", "預算", "共享")
    
    Column(modifier = modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = pagerState.currentPage) {
            tabTitles.forEachIndexed { index, title ->
                Tab(
                    text = { Text(title) },
                    selected = pagerState.currentPage == index,
                    onClick = {}
                )
            }
        }
        
        HorizontalPager(state = pagerState) { page ->
            when (page) {
                0 -> ItineraryTab(trip, viewModel)
                1 -> MapTab(trip)
                2 -> BudgetTab(trip)
                3 -> SharingTab(trip)
            }
        }
    }
}

@Composable
fun ItineraryTab(trip: Trip, viewModel: TripDetailViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        items(trip.itineraries.sortedBy { it.order }) { itinerary ->
            ItineraryItem(itinerary, trip.locations) {
                viewModel.deleteItinerary(itinerary.id)
            }
        }
    }
    
    if (showAddDialog) {
        AddItineraryDialog(
            trip = trip,
            onDismiss = { showAddDialog = false },
            onAdd = { itinerary ->
                viewModel.addItinerary(itinerary)
                showAddDialog = false
            }
        )
    }
}

@Composable
fun ItineraryItem(
    itinerary: Itinerary,
    locations: List<com.openclaw.tripplanner.model.Location>,
    onDelete: () -> Unit
) {
    val location = locations.find { it.id == itinerary.locationId }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp)
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
                        location?.name ?: "未知地點",
                        style = MaterialTheme.typography.titleMedium
                    )
                    
                    Text(
                        location?.address ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
                
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "刪除",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")
            Text(
                "${itinerary.startTime.format(timeFormatter)} - ${itinerary.endTime.format(timeFormatter)}",
                style = MaterialTheme.typography.bodySmall
            )
            
            if (itinerary.budget != null) {
                Text(
                    "預算：$${itinerary.budget.toInt()}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
fun MapTab(trip: Trip) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.LocationOn,
                contentDescription = null,
                modifier = Modifier.size(48.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                if (trip.locations.isEmpty()) "尚未新增地點" else "地圖視圖（待實現）",
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun BudgetTab(trip: Trip) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Card {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("總預算")
                    Text("$${trip.totalBudget.toInt()}")
                }
                
                Row(
                    modifier = Modifier.padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("已花費")
                    Text("$${trip.spentBudget.toInt()}")
                }
                
                Divider()
                
                Row(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("剩餘")
                    Text("$${trip.remainingBudget.toInt()}")
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        LinearProgressIndicator(
            progress = { trip.spentBudget / trip.totalBudget },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun SharingTab(trip: Trip) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        if (trip.sharedWith.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("尚未分享此行程")
            }
        } else {
            LazyColumn {
                items(trip.sharedWith) { userId ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(userId)
                            Icon(Icons.Default.Check, contentDescription = null)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AddItineraryDialog(
    trip: Trip,
    onDismiss: () -> Unit,
    onAdd: (Itinerary) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新增行程") },
        text = { Text("待實現") },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("關閉")
            }
        }
    )
}
