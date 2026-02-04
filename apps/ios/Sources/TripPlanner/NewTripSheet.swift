/**
 * iOS - 新增行程表單
 */

import SwiftUI

struct NewTripSheet: View {
    @Binding var isPresented: Bool
    @Binding var trips: [Trip]
    
    @State private var title = ""
    @State private var description = ""
    @State private var startDate = Date()
    @State private var endDate = Date().addingTimeInterval(7 * 24 * 3600)
    @State private var totalBudget = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationStack {
            Form {
                Section("基本資訊") {
                    TextField("行程名稱", text: $title)
                    
                    TextField("描述", text: $description, axis: .vertical)
                        .lineLimit(3...)
                }
                
                Section("日期") {
                    DatePicker("開始日期", selection: $startDate, displayedComponents: .date)
                    
                    DatePicker("結束日期", selection: $endDate, displayedComponents: .date)
                }
                
                Section("預算") {
                    TextField("總預算（台幣）", text: $totalBudget)
                        .keyboardType(.decimalPad)
                }
                
                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("新增行程")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { isPresented = false }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: createTrip) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("建立")
                        }
                    }
                    .disabled(!isFormValid || isLoading)
                }
            }
        }
    }
    
    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !totalBudget.isEmpty &&
        startDate <= endDate
    }
    
    private func createTrip() {
        isLoading = true
        
        let newTrip = Trip(
            id: UUID().uuidString,
            userId: "current-user", // TODO: 獲取當前用戶
            title: title,
            description: description,
            startDate: startDate,
            endDate: endDate,
            locations: [],
            itineraries: [],
            sharedWith: [],
            totalBudget: Double(totalBudget) ?? 0,
            spentBudget: 0,
            createdAt: Date(),
            updatedAt: Date()
        )
        
        // TODO: 調用 API 建立行程
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            trips.append(newTrip)
            isLoading = false
            isPresented = false
        }
    }
}

#Preview {
    NewTripSheet(isPresented: .constant(true), trips: .constant([]))
}
