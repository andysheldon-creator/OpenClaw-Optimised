/**
 * iOS - 行程詳情視圖
 */

import SwiftUI
import MapKit

@Observable
class TripDetailViewModel {
    var trip: Trip
    var selectedTab: TabSelection = .itinerary
    var showingAddLocation = false
    var showingMapSheet = false
    
    enum TabSelection {
        case itinerary
        case map
        case budget
        case sharing
    }
    
    init(trip: Trip) {
        self.trip = trip
    }
    
    func updateTrip() {
        // TODO: 調用更新 API
    }
    
    func addItinerary(_ itinerary: Itinerary) {
        trip.itineraries.append(itinerary)
        updateTrip()
    }
}

struct TripDetailView: View {
    let trip: Trip
    @State private var viewModel: TripDetailViewModel
    
    init(trip: Trip) {
        self.trip = trip
        _viewModel = State(initialValue: TripDetailViewModel(trip: trip))
    }
    
    var body: some View {
        NavigationStack {
            TabView(selection: $viewModel.selectedTab) {
                // 行程列表
                ItineraryTabView(trip: $viewModel.trip)
                    .tag(TripDetailViewModel.TabSelection.itinerary)
                
                // 地圖
                MapTabView(trip: viewModel.trip)
                    .tag(TripDetailViewModel.TabSelection.map)
                
                // 預算
                BudgetTabView(trip: viewModel.trip)
                    .tag(TripDetailViewModel.TabSelection.budget)
                
                // 共享
                SharingTabView(trip: viewModel.trip)
                    .tag(TripDetailViewModel.TabSelection.sharing)
            }
            .tabViewStyle(.page)
            .navigationTitle(trip.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - 行程列表標籤
struct ItineraryTabView: View {
    @Binding var trip: Trip
    @State private var showingAddItinerary = false
    
    var sortedItineraries: [Itinerary] {
        trip.itineraries.sorted { $0.order < $1.order }
    }
    
    var body: some View {
        VStack {
            List {
                ForEach(sortedItineraries) { itinerary in
                    ItineraryRow(itinerary: itinerary, locations: trip.locations)
                }
                .onDelete { indices in
                    indices.forEach { index in
                        if let idx = trip.itineraries.firstIndex(where: { $0.id == sortedItineraries[$0].id }) {
                            trip.itineraries.remove(at: idx)
                        }
                    }
                }
            }
            
            Button(action: { showingAddItinerary = true }) {
                Label("新增行程", systemImage: "plus.circle.fill")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
            .padding()
        }
        .sheet(isPresented: $showingAddItinerary) {
            AddItinerarySheet(trip: $trip, isPresented: $showingAddItinerary)
        }
    }
}

struct ItineraryRow: View {
    let itinerary: Itinerary
    let locations: [Trip.Location]
    
    var location: Trip.Location? {
        locations.first { $0.id == itinerary.locationId }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(location?.name ?? "未知地點")
                        .font(.headline)
                    
                    Text(location?.address ?? "")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text(timeRange(itinerary))
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    if let budget = itinerary.budget {
                        Text("$\(Int(budget))")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                }
            }
            
            if let notes = itinerary.notes {
                Text(notes)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
    
    private func timeRange(_ itinerary: Itinerary) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return "\(formatter.string(from: itinerary.startTime)) - \(formatter.string(from: itinerary.endTime))"
    }
}

// MARK: - 地圖標籤
struct MapTabView: View {
    let trip: Trip
    
    var body: some View {
        VStack {
            if !trip.locations.isEmpty {
                Map {
                    ForEach(trip.locations) { location in
                        Marker(location.name, coordinate: CLLocationCoordinate2D(
                            latitude: location.latitude,
                            longitude: location.longitude
                        ))
                    }
                }
            } else {
                VStack {
                    Image(systemName: "map")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    
                    Text("尚未新增地點")
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - 預算標籤
struct BudgetTabView: View {
    let trip: Trip
    
    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 8) {
                HStack {
                    Text("總預算")
                    Spacer()
                    Text("$\(Int(trip.totalBudget))")
                        .fontWeight(.bold)
                }
                
                HStack {
                    Text("已花費")
                    Spacer()
                    Text("$\(Int(trip.spentBudget))")
                        .fontWeight(.bold)
                        .foregroundColor(.red)
                }
                
                Divider()
                
                HStack {
                    Text("剩餘")
                    Spacer()
                    Text("$\(Int(trip.remainingBudget))")
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                }
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)
            
            ProgressView(value: trip.spentBudget / trip.totalBudget)
                .padding()
            
            Spacer()
        }
        .padding()
    }
}

// MARK: - 共享標籤
struct SharingTabView: View {
    let trip: Trip
    @State private var showingShareSheet = false
    
    var body: some View {
        VStack(spacing: 16) {
            if trip.sharedWith.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                    
                    Text("尚未分享")
                        .foregroundColor(.secondary)
                }
                .frame(maxHeight: .infinity)
            } else {
                List {
                    ForEach(trip.sharedWith, id: \.self) { userId in
                        HStack {
                            Image(systemName: "person.circle.fill")
                            Text(userId)
                            Spacer()
                            Image(systemName: "checkmark")
                                .foregroundColor(.green)
                        }
                    }
                }
            }
            
            Button(action: { showingShareSheet = true }) {
                Label("分享行程", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
            .padding()
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareTripSheet(trip: trip, isPresented: $showingShareSheet)
        }
    }
}

// MARK: - 新增行程表單
struct AddItinerarySheet: View {
    @Binding var trip: Trip
    @Binding var isPresented: Bool
    @State private var selectedLocation: Trip.Location?
    @State private var startTime = Date()
    @State private var endTime = Date().addingTimeInterval(3600)
    @State private var budget = ""
    @State private var notes = ""
    
    var body: some View {
        NavigationStack {
            Form {
                Picker("地點", selection: $selectedLocation) {
                    ForEach(trip.locations) { location in
                        Text(location.name).tag(location as Trip.Location?)
                    }
                }
                
                DatePicker("開始時間", selection: $startTime)
                DatePicker("結束時間", selection: $endTime)
                
                TextField("預算", text: $budget)
                    .keyboardType(.decimalPad)
                
                TextField("筆記", text: $notes, axis: .vertical)
                    .lineLimit(3...)
            }
            .navigationTitle("新增行程")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { isPresented = false }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button("保存") {
                        // TODO: 保存行程詳情
                        isPresented = false
                    }
                }
            }
        }
    }
}

// MARK: - 分享表單
struct ShareTripSheet: View {
    let trip: Trip
    @Binding var isPresented: Bool
    @State private var email = ""
    @State private var permission = "view"
    
    var body: some View {
        NavigationStack {
            Form {
                TextField("郵箱地址", text: $email)
                    .keyboardType(.emailAddress)
                
                Picker("權限", selection: $permission) {
                    Text("查看").tag("view")
                    Text("編輯").tag("edit")
                }
            }
            .navigationTitle("分享行程")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { isPresented = false }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button("分享") {
                        // TODO: 發送分享邀請
                        isPresented = false
                    }
                }
            }
        }
    }
}

#Preview {
    TripDetailView(trip: Trip(
        id: "1",
        userId: "user1",
        title: "東京之旅",
        description: nil,
        startDate: Date(),
        endDate: Date().addingTimeInterval(7 * 24 * 3600),
        locations: [],
        itineraries: [],
        sharedWith: [],
        totalBudget: 50000,
        spentBudget: 15000,
        createdAt: Date(),
        updatedAt: Date()
    ))
}
