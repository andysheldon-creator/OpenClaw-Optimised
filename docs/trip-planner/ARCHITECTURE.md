/**
 * 旅遊行程規劃應用 - 技術規範
 * Version: 1.0.0
 */

## 架構設計

### 分層架構

```
┌─────────────────────────────┐
│   用戶界面層 (UI Layer)      │
│  iOS (SwiftUI) / Android    │
│  (Compose)                   │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  業務邏輯層 (Business Logic) │
│  ViewModel / UseCase         │
│  Permission Validator        │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│   數據層 (Data Layer)        │
│  API Client / Repository     │
│  Local Database              │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  後端 API (Node.js/Express)  │
│  Business Logic              │
│  Database (PostgreSQL)       │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  外部服務集成               │
│  Google Maps, Weather API    │
│  Firebase, S3, etc.         │
└─────────────────────────────┘
```

## 技術棧

### 後端
- **Runtime**: Node.js 22+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: TypeORM 或 Prisma
- **Authentication**: Firebase / Auth0
- **Caching**: Redis
- **File Storage**: AWS S3 / Firebase Storage

### iOS
- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Architecture**: MVVM + Observation
- **Networking**: URLSession + Codable
- **Maps**: MapKit
- **Storage**: Core Data / CloudKit

### Android
- **Language**: Kotlin
- **UI Framework**: Jetpack Compose
- **Architecture**: MVVM + StateFlow
- **Networking**: Retrofit + OkHttp
- **Maps**: Google Maps SDK
- **Storage**: Room Database
- **DI**: Hilt

## API 設計規範

### 請求/響應格式

**成功響應 (200 OK)**
```json
{
  "data": { /* 實際數據 */ },
  "meta": {
    "timestamp": "2026-02-01T10:00:00Z",
    "version": "1.0"
  }
}
```

**錯誤響應 (4xx/5xx)**
```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "用戶友好的錯誤消息",
    "details": { /* 詳細信息 */ }
  }
}
```

### 分頁

```
GET /trips?page=1&limit=20&sort=-createdAt

Response:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

## 數據庫架構

### 主要表

```sql
-- 用戶表
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 行程表
CREATE TABLE trips (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_budget DECIMAL(10, 2),
  spent_budget DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 地點表
CREATE TABLE locations (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id),
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  place_id VARCHAR(255),
  rating DECIMAL(3, 2),
  photo_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

-- 行程詳情表
CREATE TABLE itineraries (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  "order" INT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  transportation_type VARCHAR(50),
  transportation_duration INT,
  transportation_cost DECIMAL(10, 2),
  budget DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- 行程分享表
CREATE TABLE trip_shares (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id),
  shared_by UUID NOT NULL REFERENCES users(id),
  shared_with UUID NOT NULL REFERENCES users(id),
  permission VARCHAR(50) NOT NULL, -- 'view' or 'edit'
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(trip_id, shared_with)
);

-- 景點評論表
CREATE TABLE place_reviews (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_locations_trip_id ON locations(trip_id);
CREATE INDEX idx_itineraries_trip_id ON itineraries(trip_id);
CREATE INDEX idx_itineraries_location_id ON itineraries(location_id);
CREATE INDEX idx_trip_shares_shared_with ON trip_shares(shared_with);
CREATE INDEX idx_place_reviews_location_id ON place_reviews(location_id);
```

## 安全性清單

- [ ] 使用 HTTPS/TLS 加密所有通信
- [ ] 實現速率限制防止 API 濫用
- [ ] 使用 JWT 或 OAuth 2.0 進行身份驗證
- [ ] 實現 CORS 策略
- [ ] 驗證和淨化所有用戶輸入
- [ ] 使用密碼雜湊（bcrypt）存儲密碼
- [ ] 為敏感端點實現 2FA
- [ ] 定期進行安全審計和滲透測試
- [ ] 實現日誌記錄和監控
- [ ] 遵守 GDPR/隱私法規

## 性能基準

| 指標 | 目標 | 測試方法 |
|-----|------|---------|
| API 響應時間 | < 200ms | 平均響應時間 |
| 數據庫查詢時間 | < 50ms | 單個查詢 |
| 首屏加載時間 | < 3s | Lighthouse |
| 移動應用啟動時間 | < 2s | 實際設備測試 |
| 90% 磁盤 I/O | < 100ms | 數據庫監控 |

## 監控和日誌

### 日誌級別
- ERROR: 系統錯誤
- WARN: 警告，不影響功能
- INFO: 信息性事件
- DEBUG: 調試信息

### 監控指標
- API 響應時間
- 錯誤率
- 活躍用戶數
- 存儲使用量
- 數據庫連接池

## 部署流程

### 開發環境
```bash
pnpm install
pnpm dev
```

### 測試環境
```bash
pnpm build
pnpm test
NODE_ENV=staging pnpm start
```

### 生產環境
```bash
# Docker 部署
docker build -t trip-planner:latest .
docker push trip-planner:latest

# Kubernetes 部署
kubectl apply -f k8s/deployment.yaml
```

## 版本控制

遵循 Semantic Versioning (SemVer)

- MAJOR.MINOR.PATCH (例如: 1.0.0)
- MAJOR: 不兼容的 API 變更
- MINOR: 新增功能（向後兼容）
- PATCH: Bug 修復

## 項目時間估計

| 模塊 | 估計時間 |
|------|---------|
| 後端 API 實現 | 2-3 週 |
| 數據庫設計和優化 | 1 週 |
| iOS 應用 | 3-4 週 |
| Android 應用 | 3-4 週 |
| 第三方集成 | 2 週 |
| 測試和 QA | 2-3 週 |
| 文檔和部署 | 1 週 |
| **總計** | **14-19 週** |

## 常見問題

**Q: 支持離線模式嗎？**
A: 基礎版本不包括，但可以在 v1.1 中添加。

**Q: 如何處理大文件上傳？**
A: 使用分塊上傳到 S3 或 Firebase Storage。

**Q: 支持哪些語言？**
A: 目前支持繁體中文和英文，可擴展。

**Q: 數據備份策略是什麼？**
A: 自動每日備份到 S3，保留 30 天。

---

**維護者**: OpenClaw 開發團隊  
**最後更新**: 2026-02-01  
**許可證**: MIT
