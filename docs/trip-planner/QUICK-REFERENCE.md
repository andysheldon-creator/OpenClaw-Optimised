# 旅遊行程規劃 — 快速參考

此文件為開發與本地執行的最小快照，方便快速上手和偵錯。

## 快速啟動

- **克隆並安裝依賴**:

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
```

- **啟動後端（開發）**:

```bash
cp src/trip-planner/.env.example src/trip-planner/.env.local
# 編輯 src/trip-planner/.env.local，填入 API keys
pnpm --filter ./src/trip-planner dev
```

- **檢查健康狀態**:

```bash
curl http://localhost:3000/health
```

## 重要環境變數（範例）

- **PORT**: 後端監聽埠（預設 3000）
- **DATABASE_URL**: PostgreSQL 連線字串
- **REDIS_URL**: Redis 連線字串
- **GOOGLE_MAPS_API_KEY**: Google Maps / Places API Key
- **WEATHER_API_KEY**: 天氣服務金鑰（OpenWeatherMap 或 WeatherAPI）
- **JWT_SECRET**: 用於 JWT 簽章的秘密
- **S3_BUCKET**、**S3_REGION**、**S3_ACCESS_KEY_ID**、**S3_SECRET_ACCESS_KEY**: 照片儲存

（請參考 `src/trip-planner/.env.example` 以獲得完整欄位）

## 常用命令

- 安裝依賴: `pnpm install`
- 啟動後端: `pnpm --filter ./src/trip-planner dev`
- 後端遷移: `pnpm --filter ./src/trip-planner db:migrate`
- 單元測試: `pnpm test`
- E2E 測試: `pnpm test:docker:onboard`

## 核心 API 快查

- 認證: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- 行程: `GET /trips`, `POST /trips`, `GET /trips/:id`, `PUT /trips/:id`
- 行程項目: `GET /trips/:id/itinerary`, `POST /trips/:id/itinerary`, `PUT /trips/:id/itinerary/reorder`
- 分享: `POST /trips/:id/share`, `GET /share/:token`
- 照片: `POST /trips/:id/photos`, `GET /trips/:id/photos`

## 本地開發提示

- 若使用 Google Maps，請確認 billing 啟用並將 `GOOGLE_MAPS_API_KEY` 填入 `.env.local`。
- 上傳照片建議在開發時指向本地模擬 S3（或使用 Firebase Storage emulator）。
- 若要測試推播/通知，可使用 Firebase Cloud Messaging（開發用 emulator 或測試專案）。

## 文件與參考

- 專案總結: [docs/trip-planner/SUMMARY.md](docs/trip-planner/SUMMARY.md)
- 範例環境變數: [src/trip-planner/.env.example](src/trip-planner/.env.example)
- 開發指南與 API: [docs/trip-planner/SUMMARY.md](docs/trip-planner/SUMMARY.md)

---
快速參考已建立，若需我把這份加入 README 範本或建立對應的 CI 檢查，我可以接著實作。
# 旅遊行程規劃應用 - 快速參考

## 🎯 項目一覽

**應用名稱**: Trip Planner (旅遊行程規劃應用)  
**平台**: iOS + Android  
**後端**: Node.js + Express + PostgreSQL  
**主要功能**: 8 大核心功能 + 3 個擴展功能

---

## 📂 文件位置

```
/workspaces/openclaw/
├── src/trip-planner/                    # 後端代碼
│   ├── types.ts                         # 數據類型
│   ├── api.ts                           # API 端點
│   ├── sharing.ts                       # 共享邏輯
│   └── third-party-integration.ts       # 第三方集成
├── apps/ios/Sources/TripPlanner/        # iOS 應用
├── apps/android/app/src/main/java/com/openclaw/tripplanner/  # Android
└── docs/trip-planner/                   # 文檔
    ├── SUMMARY.md                       # 📍 本文件
    ├── ARCHITECTURE.md                  # 架構細節
    └── README.md                        # 實現指南
```

---

## 🚀 快速命令

### 開發

```bash
# 安裝所有依賴
pnpm install

# 啟動後端開發服務器
pnpm dev

# 類型檢查 + 構建
pnpm build

# 運行測試
pnpm test
pnpm test:coverage
```

### iOS

```bash
cd apps/ios
open OpenClaw.xcworkspace  # Xcode 中按 Cmd+R 運行
```

### Android

```bash
cd apps/android
./gradlew installDebug  # 安裝到設備
```

### 數據庫

```bash
# 數據庫遷移
pnpm db:migrate

# 種子數據
pnpm db:seed

# 重置數據庫
pnpm db:reset
```

---

## 🔑 環境變數必需

```bash
# Google APIs
GOOGLE_MAPS_API_KEY=...
GOOGLE_PLACES_API_KEY=...

# 天氣
WEATHER_API_KEY=...

# 數據庫
DATABASE_URL=postgresql://user:pass@localhost:5432/tripplanner

# Firebase (可選)
FIREBASE_CONFIG=...

# AWS S3 (可選)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## 🏛️ 核心類型

### Trip (行程)
```typescript
{
  id: UUID
  userId: UUID
  title: string
  destination: string
  startDate: Date
  endDate: Date
  budget: number
  currency: string
}
```

### TripItinerary (行程項目)
```typescript
{
  id: UUID
  tripId: UUID
  name: string
  location: {lat, lng}
  startTime: DateTime
  endTime: DateTime
  cost: number
  photos: string[]
  notes: string
  order: number
}
```

### BudgetEntry (花費)
```typescript
{
  id: UUID
  tripId: UUID
  category: string
  amount: number
  date: DateTime
}
```

### TripShare (共享)
```typescript
{
  id: UUID
  tripId: UUID
  sharedWith: UUID[]
  permission: 'VIEW' | 'EDIT'
  shareToken: string
  qrCode: string
}
```

---

## 🔌 第三方 API 端點

| 服務 | 端點 | 用途 |
|------|------|------|
| Google Maps | `/maps/api/place/` | 地點搜索 |
| Google Places | `/maps/api/place/details` | 景點詳情 |
| Weather API | `/data/2.5/weather` | 實時天氣 |
| Google Routes | `/routes/v1/directions` | 路線規劃 |

---

## 📡 主要 API 路由

### 認證
```
POST   /auth/register        - 註冊
POST   /auth/login           - 登錄
POST   /auth/refresh         - 刷新令牌
POST   /auth/logout          - 登出
```

### 行程
```
GET    /trips                - 列表
POST   /trips                - 新增
GET    /trips/:id            - 詳情
PUT    /trips/:id            - 更新
DELETE /trips/:id            - 刪除
```

### 行程項目
```
GET    /trips/:id/itinerary           - 列表
POST   /trips/:id/itinerary           - 新增
PUT    /trips/:id/itinerary/:itemId   - 更新
DELETE /trips/:id/itinerary/:itemId   - 刪除
PUT    /trips/:id/itinerary/reorder   - 排序
```

### 預算
```
GET    /trips/:id/budget              - 統計
POST   /trips/:id/budget              - 新增花費
DELETE /trips/:id/budget/:entryId     - 刪除
```

### 共享
```
POST   /trips/:id/share                   - 建立分享
GET    /share/:token                      - 訪問分享
PUT    /trips/:id/share/permission        - 更新權限
```

### 照片
```
POST   /trips/:id/photos              - 上傳
GET    /trips/:id/photos              - 列表
DELETE /trips/:id/photos/:photoId     - 刪除
```

---

## 🎨 UI 元件結構

### iOS (SwiftUI)

```swift
// 主要 Views
- TripListView          // 行程列表
- TripDetailView        // 行程詳情
- MapView               // 地圖視圖
- TimelineView          // 時間軸
- BudgetView            // 預算表
- ShareTripView         // 分享界面
```

### Android (Compose)

```kotlin
// 主要 Screens
- TripListScreen        // 行程列表
- TripDetailScreen      // 行程詳情
- MapScreen             // 地圖屏幕
- TimelineScreen        // 時間軸
- BudgetScreen          // 預算屏幕
- ShareTripScreen       // 分享屏幕
```

---

## 🧪 測試覆蓋

- **單位測試**: `pnpm test`
- **集成測試**: `pnpm test:gateway`
- **E2E 測試**: `pnpm test:docker:onboard`
- **覆蓋率目標**: > 70%

```bash
# 查看覆蓋率報告
pnpm test:coverage
open coverage/index.html
```

---

## 📊 開發時間表

| 階段 | 時間 | 重點 |
|------|------|------|
| Phase 1: MVP | 周 1-3 | API + 基礎 UI |
| Phase 2: 核心功能 | 周 4-6 | 時間軸 + 預算 + 分享 |
| Phase 3: 增強 | 周 7-8 | 推薦 + 協作 + 通知 |
| Phase 4: 上線 | 周 9-10 | 優化 + 發布 |

---

## 🔐 安全檢查清單

- ✅ JWT 認證 + 刷新令牌
- ✅ 基於角色的訪問控制
- ✅ HTTPS + TLS 1.3
- ✅ 輸入驗證 (Zod)
- ✅ 速率限制
- ✅ CORS 配置
- ✅ 環境變數隔離
- ✅ 定期安全更新

---

## 🐛 常見問題

**Q: 如何重置數據庫？**
```bash
pnpm db:reset
```

**Q: 如何本地測試 API？**
```bash
# 啟動後端
pnpm dev

# 測試端點
curl http://localhost:3000/health
```

**Q: iOS 編譯失敗？**
- 清除構建緩存: `Cmd+Shift+K`
- 刪除 Pod: `rm -rf Pods && pod install`

**Q: Android 模擬器慢？**
- 使用硬件加速
- 增加虛擬機 RAM

---

## 📖 學習資源

- [Express.js 文檔](https://expressjs.com)
- [SwiftUI 教程](https://developer.apple.com/tutorials/swiftui)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [PostgreSQL 文檔](https://www.postgresql.org/docs/)
- [Google Maps API](https://developers.google.com/maps)

---

## 👥 團隊協作

- 📌 前端: iOS + Android 開發者
- 🔧 後端: Node.js 開發者
- 🗄️ 數據庫: PostgreSQL 管理員
- 🧪 QA: 測試工程師
- 📱 DevOps: 部署和基礎設施

---

**創建日期**: 2026年2月1日  
**版本**: 1.0.0
