# Multi-Bot Architecture

> **Scaling to 100+ bots with shared resources**

## Vision

Transform OpenClaw from a single-bot system to a **multi-bot platform** where:
- Each bot has independent personality and context
- All bots share: Ollama instance, Vector DB, cache layer
- Central orchestration handles routing and resource management
- Bot-to-bot communication enables collaboration

**Target**: Support 100+ bots on single infrastructure

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│          Orchestration Layer                     │
│  - Bot Registry                                  │
│  - Message Routing                               │
│  - Cost Tracking                                 │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┐
      │   Message   │
      │   Bus       │
      └──────┬──────┘
             │
  ┌──────────┼──────────┐
  │          │          │
  ▼          ▼          ▼
┌────┐    ┌────┐    ┌────┐
│Bot1│    │Bot2│    │BotN│
└────┘    └────┘    └────┘
  │          │          │
  └──────────┼──────────┘
             │
  ┌──────────▼──────────┐
  │  Resource Manager    │
  │  - Shared Ollama     │
  │  - Shared Vector DB  │
  │  - Shared Cache      │
  └─────────────────────┘
```

---

## Core Components

### 1. Bot Registry

```typescript
// src/orchestrator/BotRegistry.ts
interface BotConfig {
  id: string;
  name: string;
  personality: string;
  platforms: ('telegram' | 'whatsapp' | 'discord')[];
  costLimit: number; // £/month
  priority: 'low' | 'medium' | 'high';
}

export class BotRegistry {
  private bots: Map<string, BotConfig> = new Map();

  registerBot(config: BotConfig): void {
    this.bots.set(config.id, config);
  }

  getBot(id: string): BotConfig | undefined {
    return this.bots.get(id);
  }

  getAllBots(): BotConfig[] {
    return Array.from(this.bots.values());
  }
}
```

### 2. Message Bus

```typescript
// src/orchestrator/MessageBus.ts
interface Message {
  botId: string;
  userId: string;
  content: string;
  timestamp: number;
}

export class MessageBus {
  private subscribers: Map<string, Function[]> = new Map();

  subscribe(botId: string, handler: (msg: Message) => void): void {
    if (!this.subscribers.has(botId)) {
      this.subscribers.set(botId, []);
    }
    this.subscribers.get(botId)!.push(handler);
  }

  async publish(message: Message): Promise<void> {
    const handlers = this.subscribers.get(message.botId) || [];
    await Promise.all(handlers.map(h => h(message)));
  }
}
```

### 3. Resource Manager

```typescript
// src/orchestrator/ResourceManager.ts
export class ResourceManager {
  private ollama: Ollama;
  private vectorDB: VectorDBService;
  private cache: HotCacheService;
  private usage: Map<string, number> = new Map(); // botId → token count

  constructor() {
    // Shared instances
    this.ollama = new Ollama();
    this.vectorDB = new VectorDBService();
    this.cache = new HotCacheService();
  }

  async processMessage(botId: string, message: string): Promise<string> {
    // Route through shared resources
    const context = await this.vectorDB.searchMessages(botId, message);
    const response = await this.ollama.chat({
      model: 'llama3.2:3b',
      messages: [...context, { role: 'user', content: message }]
    });

    // Track usage
    this.trackUsage(botId, response.tokens);

    return response.message.content;
  }

  private trackUsage(botId: string, tokens: number): void {
    const current = this.usage.get(botId) || 0;
    this.usage.set(botId, current + tokens);
  }

  getUsage(botId: string): number {
    return this.usage.get(botId) || 0;
  }
}
```

### 4. Bot-to-Bot Communication

```typescript
// src/orchestrator/BotCommunication.ts
export class BotCommunication {
  private messageBus: MessageBus;

  async sendToBotDirect(
    fromBotId: string,
    toBotId: string,
    message: string
  ): Promise<string> {
    // Direct bot-to-bot message
    await this.messageBus.publish({
      botId: toBotId,
      userId: `bot:${fromBotId}`,
      content: message,
      timestamp: Date.now()
    });

    // Wait for response...
  }

  async broadcast(
    fromBotId: string,
    message: string,
    filter?: (bot: BotConfig) => boolean
  ): Promise<void> {
    // Broadcast to all bots (or filtered subset)
    const bots = registry.getAllBots().filter(filter || (() => true));
    
    await Promise.all(
      bots.map(bot => this.sendToBotDirect(fromBotId, bot.id, message))
    );
  }
}
```

### 5. Orchestrator Service

```typescript
// src/orchestrator/OrchestratorService.ts
export class OrchestratorService {
  private registry: BotRegistry;
  private messageBus: MessageBus;
  private resourceManager: ResourceManager;
  private communication: BotCommunication;

  async handleIncomingMessage(
    platform: string,
    userId: string,
    message: string
  ): Promise<string> {
    // 1. Identify which bot should handle this
    const botId = this.routeToBot(platform, userId);
    
    // 2. Get bot configuration
    const bot = this.registry.getBot(botId);
    if (!bot) throw new Error('Bot not found');

    // 3. Check cost limits
    const usage = this.resourceManager.getUsage(botId);
    if (usage > bot.costLimit) {
      return 'Bot has exceeded cost limit for this month';
    }

    // 4. Process through resource manager
    const response = await this.resourceManager.processMessage(
      botId,
      message
    );

    return response;
  }

  private routeToBot(platform: string, userId: string): string {
    // Routing logic (could be based on platform, user, time, etc.)
    return 'default-bot';
  }
}
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│  Load Balancer                          │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┼─────────┐
     │         │         │
     ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Gateway 1│ │Gateway 2│ │Gateway 3│
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
      ┌──────────▼──────────┐
      │   Orchestrator      │
      │   (Stateless)       │
      └──────────┬──────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌─────────┐
│ Ollama │  │ChromaDB│  │  Redis  │
│(Shared)│  │(Shared)│  │(Shared) │
└────────┘  └────────┘  └─────────┘
```

---

## Scaling Strategy

### Phase 1: 1-10 Bots
- Single Ollama instance
- Single ChromaDB instance
- Single Redis instance
- Cost: ~£5/month infrastructure

### Phase 2: 10-50 Bots
- Ollama with GPU (faster inference)
- ChromaDB sharding by bot group
- Redis cluster (3 nodes)
- Cost: ~£50/month infrastructure

### Phase 3: 50-100+ Bots
- Multiple Ollama instances (load balanced)
- ChromaDB distributed cluster
- Redis cluster with sentinels
- Kubernetes orchestration
- Cost: ~£200/month infrastructure

**Key Insight**: Shared resources mean adding bots has minimal incremental cost!

---

## Cost Tracking Dashboard

```typescript
// src/monitoring/CostDashboard.ts
export class CostDashboard {
  async getBotCosts(): Promise<BotCostReport[]> {
    const bots = registry.getAllBots();
    
    return Promise.all(
      bots.map(async bot => ({
        botId: bot.id,
        name: bot.name,
        ollama: await this.getOllamaCost(bot.id), // £0 (free)
        claude: await this.getClaudeCost(bot.id), // £2-10/month
        storage: await this.getStorageCost(bot.id), // £0.50/month
        total: await this.getTotalCost(bot.id)
      }))
    );
  }
}
```

---

## Migration Checklist

- [ ] Implement BotRegistry
- [ ] Implement MessageBus
- [ ] Implement ResourceManager
- [ ] Add bot-to-bot communication
- [ ] Create OrchestratorService
- [ ] Set up cost tracking
- [ ] Deploy to Kubernetes (optional)
- [ ] Create admin dashboard

---

## Summary

### Benefits
- ✅ Share expensive resources (Ollama, Vector DB)
- ✅ Add bots with minimal incremental cost
- ✅ Independent bot personalities and contexts
- ✅ Bot-to-bot collaboration
- ✅ Centralized cost tracking and limits

### Example Costs
```
1 bot:    £2/month  (Claude API only)
10 bots:  £20/month (shared resources)
100 bots: £200/month (still shared!)

vs Traditional: £6,000/month for 100 bots
Savings: 97% reduction
```

---

**Document Status**: ✅ Complete  
**Last Updated**: February 2026
