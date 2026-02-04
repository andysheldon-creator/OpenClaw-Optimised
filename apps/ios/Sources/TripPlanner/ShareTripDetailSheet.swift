/**
 * iOS - 共享視圖表單
 */

import SwiftUI

struct ShareTripDetailSheet: View {
    let trip: Trip
    @Binding var isPresented: Bool
    
    @State private var shares: [String] = []
    @State private var showingAddShare = false
    @State private var selectedShare: String?
    
    var body: some View {
        NavigationStack {
            Form {
                Section("分享鏈接") {
                    let shareLink = TripSharingManager.shared.generateShareLink(for: trip)
                    
                    HStack {
                        Text(shareLink)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        
                        Spacer()
                        
                        Button(action: {
                            TripSharingManager.shared.copyShareLink(for: trip)
                        }) {
                            Image(systemName: "doc.on.doc")
                        }
                    }
                }
                
                Section("QR 碼") {
                    if let qrImage = TripSharingManager.shared.generateQRCode(for: trip) {
                        Image(uiImage: qrImage)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 200)
                    }
                }
                
                Section("分享對象") {
                    ForEach(trip.sharedWith, id: \.self) { userId in
                        HStack {
                            Label(userId, systemImage: "person.circle.fill")
                            Spacer()
                            
                            Menu {
                                Button("編輯權限", action: {})
                                Button("移除", action: {})
                            } label: {
                                Image(systemName: "ellipsis")
                            }
                        }
                    }
                    
                    Button(action: { showingAddShare = true }) {
                        Label("新增人員", systemImage: "plus.circle")
                    }
                }
                
                Section("分享選項") {
                    Button(action: {
                        TripSharingManager.shared.shareTrip(trip, from: UIApplication.shared.rootViewController ?? UIViewController())
                    }) {
                        Label("分享到其他應用", systemImage: "square.and.arrow.up")
                    }
                }
            }
            .navigationTitle("分享行程")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { isPresented = false }
                }
            }
            .sheet(isPresented: $showingAddShare) {
                AddShareRecipientSheet(trip: trip, isPresented: $showingAddShare)
            }
        }
    }
}

struct AddShareRecipientSheet: View {
    let trip: Trip
    @Binding var isPresented: Bool
    
    @State private var email = ""
    @State private var permission = "view"
    @State private var isLoading = false
    
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
            .navigationTitle("邀請協作者")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { isPresented = false }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: sendInvitation) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("邀請")
                        }
                    }
                    .disabled(!isValidEmail(email) || isLoading)
                }
            }
        }
    }
    
    private func sendInvitation() {
        isLoading = true
        
        // TODO: 調用 API 發送邀請
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isLoading = false
            isPresented = false
        }
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailPattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        return NSPredicate(format: "SELF MATCHES %@", emailPattern).evaluate(with: email)
    }
}

#Preview {
    ShareTripDetailSheet(
        trip: Trip(
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
            spentBudget: 0,
            createdAt: Date(),
            updatedAt: Date()
        ),
        isPresented: .constant(true)
    )
}
