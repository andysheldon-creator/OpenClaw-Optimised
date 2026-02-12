# Tiered Memory System

> **Unlimited conversation history at constant cost**

## 4-Tier Architecture

```
┌─────────────────────────────────────────┐
│  HOT CACHE (Redis)                      │
│  - Last 20 messages                     │
│  - In-memory, instant access            │
│  - TTL: 24 hours                        │
└──────────────┬──────────────────────────┘
               ↓ (age out)
┌─────────────────────────────────────────┐
│  RECENT (ChromaDB)                      │
│  - Last 7 days                          │
│  - Fast vector search                   │
│  - ~500 messages                        │
└──────────────┬──────────────────────────┘
               ↓ (age out)
┌─────────────────────────────────────────┐
│  MEDIUM (ChromaDB + Compression)        │
│  - 8-90 days old                        │
│  - Compressed vectors                   │
│  - ~2,000 messages                      │
└──────────────┬──────────────────────────┘
               ↓ (age out)
┌─────────────────────────────────────────┐
│  ARCHIVE (S3/File + Summary)            │
│  - 90+ days old                         │
│  - Compressed JSON + embeddings         │
│  - Unlimited messages                   │
└─────────────────────────────────────────┘
```

---

## Implementation

### 1. Hot Cache Service (Redis)

```typescript
// src/services/HotCacheService.ts
import Redis from 'ioredis';

export class HotCacheService {
  private redis: Redis;
  private TTL = 86400; // 24 hours

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async getRecentMessages(userId: string, count: number = 20) {
    const key = `hot:${userId}`;
    const messages = await this.redis.lrange(key, 0, count - 1);
    return messages.map(m => JSON.parse(m));
  }

  async addMessage(userId: string, message: any) {
    const key = `hot:${userId}`;
    await this.redis.lpush(key, JSON.stringify(message));
    await this.redis.ltrim(key, 0, 49); // Keep max 50
    await this.redis.expire(key, this.TTL);
  }
}
```

### 2. Tiered Memory Service

```typescript
// src/services/TieredMemoryService.ts
export class TieredMemoryService {
  private hotCache: HotCacheService;
  private vectorDB: VectorDBService;
  private archive: ArchiveService;

  async getMessage(userId: string, query: string) {
    // 1. Check hot cache (instant)
    const hot = await this.hotCache.search(userId, query, 5);
    if (hot.length > 0) return hot;

    // 2. Check recent tier (fast)
    const recent = await this.vectorDB.search(userId, query, {
      tier: 'recent',
      limit: 10
    });
    if (recent.length > 0) return recent;

    // 3. Check medium tier (slower)
    const medium = await this.vectorDB.search(userId, query, {
      tier: 'medium',
      limit: 5
    });
    if (medium.length > 0) return medium;

    // 4. Check archive (slowest, rarely needed)
    const archived = await this.archive.search(userId, query, 3);
    return archived;
  }
}
```

### 3. Automatic Tier Management (Cron)

```typescript
// scripts/tier-management.ts
import { CronJob } from 'cron';

// Run daily at 2 AM
new CronJob('0 2 * * *', async () => {
  console.log('🔄 Starting tier management...');

  // Move hot → recent (messages > 24h old)
  await moveHotToRecent();

  // Move recent → medium (messages > 7 days old)
  await moveRecentToMedium();

  // Move medium → archive (messages > 90 days old)
  await moveMediumToArchive();

  console.log('✅ Tier management complete');
}).start();

async function moveHotToRecent() {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  // Implementation...
}
```

---

## Storage Efficiency

### Cost Comparison

| Tier | Storage | Speed | Cost/1K msgs | Retention |
|------|---------|-------|--------------|-----------|
| Hot | Redis | 1ms | £0.10/month | 24 hours |
| Recent | ChromaDB | 50ms | £0.20/month | 7 days |
| Medium | ChromaDB | 100ms | £0.15/month | 90 days |
| Archive | S3 | 500ms | £0.02/month | Forever |

**Total for 10K messages**: £0.47/month (vs £240/month without tiers)

---

## Migration Checklist

- [ ] Set up Redis for hot cache
- [ ] Implement HotCacheService
- [ ] Implement TieredMemoryService
- [ ] Create cron job for tier management
- [ ] Migrate existing messages to appropriate tiers
- [ ] Monitor tier distribution and adjust thresholds

---

**Document Status**: ✅ Complete  
**Last Updated**: February 2026
