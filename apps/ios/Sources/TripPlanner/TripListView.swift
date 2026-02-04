/**
 * iOS - 行程列表視圖
 */

import SwiftUI

@Observable
class TripListViewModel {
    var trips: [Trip] = []
    var isLoading = false
    var error: String?
    
    func loadTrips() {
        isLoading = true
        // TODO: 從後端加載行程
        isLoading = false
    }
    
    func deleteTrip(_ trip: Trip) {
        // TODO: 調用刪除 API
        trips.removeAll { $0.id == trip.id }
    }
}

struct TripListView: View {
    @State private var viewModel = TripListViewModel()
    @State private var showingNewTripSheet = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                if viewModel.trips.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "map")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        
                        Text("沒有行程")
                            .font(.title2)
                        
                        Text("建立您的第一個旅遊行程")
                            .foregroundColor(.secondary)
                        
                        Button(action: { showingNewTripSheet = true }) {
                            Label("新增行程", systemImage: "plus.circle.fill")
                                .padding()
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                    }
                } else {
                    List {
                        ForEach(viewModel.trips) { trip in
                            NavigationLink(destination: TripDetailView(trip: trip)) {
                                TripRow(trip: trip)
                            }
                        }
                        .onDelete { indices in
                            indices.forEach { index in
                                viewModel.deleteTrip(viewModel.trips[index])
                            }
                        }
                    }
                }
            }
            .navigationTitle("旅遊行程")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showingNewTripSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewTripSheet) {
                NewTripSheet(isPresented: $showingNewTripSheet, trips: $viewModel.trips)
            }
        }
        .onAppear {
            viewModel.loadTrips()
        }
    }
}

struct TripRow: View {
    let trip: Trip
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(trip.title)
                        .font(.headline)
                    
                    HStack(spacing: 16) {
                        Label(dateRange(trip), systemImage: "calendar")
                            .font(.caption)
                        
                        Label("\(trip.locations.count) 地點", systemImage: "mappin")
                            .font(.caption)
                    }
                    .foregroundColor(.secondary)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text("$\(Int(trip.totalBudget))")
                        .font(.headline)
                    
                    ProgressView(value: trip.spentBudget / trip.totalBudget)
                        .frame(width: 80)
                }
            }
        }
        .padding(.vertical, 8)
    }
    
    private func dateRange(_ trip: Trip) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return "\(formatter.string(from: trip.startDate)) - \(formatter.string(from: trip.endDate))"
    }
}

#Preview {
    TripListView()
}
