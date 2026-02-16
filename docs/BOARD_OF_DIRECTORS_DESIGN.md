# Board of Directors — Multi-Agent Architecture Design

> Design document for FB-017 through FB-020.
> Six specialized agents with Telegram topic routing, board meetings, and cross-agent consultation.

---

## 1. Core Concept

Replace the single generalist agent with a **squad of six specialized agents**, each with:
- Its own **SOUL.md** personality and reasoning framework
- Its own **session history** (separate JSONL transcript)
- Its own **Telegram topic** in the group supergroup
- The ability to **consult** other agents within defined boundaries
- Participation in coordinated **board meetings** on a topic

### The Six Agents

| Role | Codename | Telegram Topic | Reasoning Style |
|------|----------|----------------|-----------------|
| General / Orchestrator | `general` | General | Synthesis, delegation, coordination |
| Research Analyst | `research` | Research | Data gathering, trend analysis, evidence-based |
| Content / CMO | `content` | Content | Positioning, messaging, creative strategy |
| Finance / CFO | `finance` | Finance | Financial modeling, cost analysis, ROI |
| Strategy / CEO | `strategy` | Strategy | Long-term planning, competitive positioning |
| Critic / Devil's Advocate | `critic` | Critic | Risk analysis, stress-testing, contrarian |

---

## 2. Architecture Decisions

### 2.1 Agent Identity: Workspace Personality Files

Each agent gets its own **personality directory** under the shared workspace:

```
~/.clawdis/workspace/
├── SOUL.md              ← general agent's personality (default fallback)
├── AGENTS.md            ← shared operating instructions
├── USER.md              ← shared user profile
├── board/
│   ├── research.soul.md
│   ├── content.soul.md
│   ├── finance.soul.md
│   ├── strategy.soul.md
│   └── critic.soul.md
```

Each `*.soul.md` file defines:
- Agent name, emoji, personality
- Reasoning framework (e.g., Finance thinks in numbers; Critic looks for flaws)
- Interaction boundaries (what it can/cannot do)
- Consultation preferences (who it naturally defers to)

The **General** agent uses the root `SOUL.md` (backward-compatible with existing single-agent setup).

### 2.2 Session Isolation

Each agent maintains its own session, keyed by agent role:

```
Session key format:
  Direct chat:  "main"              → general (default, backward-compat)
  Board agent:  "board:<role>"      → specific agent session
  Topic chat:   "board:<role>:g-<group>" → agent session within a group
```

Session transcripts stored as:
```
~/.clawdis/sessions/
├── <general-session-id>.jsonl
├── <research-session-id>.jsonl
├── <finance-session-id>.jsonl
└── ...
```

### 2.3 System Prompt Composition

The `buildAgentSystemPromptAppend()` is extended to accept an optional `agentRole` parameter:

```typescript
buildAgentSystemPromptAppend({
  ...existingParams,
  agentRole: "finance",        // NEW
  boardContext: {               // NEW
    availableAgents: ["general", "research", "content", "finance", "strategy", "critic"],
    consultationEnabled: true,
    maxConsultationDepth: 2,
  },
})
```

This injects the role-specific SOUL.md content and board-aware instructions:

```
## Agent Role: Finance (CFO)
You are the CFO of the board. Your reasoning framework:
[contents of board/finance.soul.md]

## Board of Directors
You are part of a board with these colleagues:
- General (Orchestrator): Synthesis, delegation
- Research: Data and evidence
- Content (CMO): Positioning and messaging
- Strategy (CEO): Long-term planning
- Critic: Risk and stress-testing

You can consult other agents using the `consult` tool.
```

### 2.4 Backward Compatibility

When `board.enabled` is `false` (default), the system behaves exactly as today:
- Single generalist agent
- Root `SOUL.md` used
- No board-related tools injected
- No topic routing

---

## 3. Config Schema

```typescript
export type BoardAgentConfig = {
  /** Agent role identifier. */
  role: string;
  /** Display name for the agent. */
  name?: string;
  /** Emoji for message prefixes. */
  emoji?: string;
  /** Path to the personality file (relative to workspace). */
  soulFile?: string;
  /** Model override for this specific agent. */
  model?: string;
  /** Thinking level override. */
  thinkingDefault?: "off" | "minimal" | "low" | "medium" | "high";
  /** Telegram topic ID (set during setup, or auto-created). */
  telegramTopicId?: number;
};

export type BoardMeetingConfig = {
  /** Enable board meeting coordination (default: true). */
  enabled?: boolean;
  /** Max duration for a board meeting in ms (default: 600_000 = 10 min). */
  maxDurationMs?: number;
  /** Max turns per agent in a meeting (default: 3). */
  maxTurnsPerAgent?: number;
};

export type BoardConsultationConfig = {
  /** Enable cross-agent consultation (default: true). */
  enabled?: boolean;
  /** Max consultation depth to prevent loops (default: 2). */
  maxDepth?: number;
  /** Timeout per consultation in ms (default: 120_000 = 2 min). */
  timeoutMs?: number;
};

export type BoardConfig = {
  /** Enable the Board of Directors multi-agent system (default: false). */
  enabled?: boolean;
  /** Agent definitions (uses defaults if not provided). */
  agents?: BoardAgentConfig[];
  /** Telegram group chat ID for topic-based routing. */
  telegramGroupId?: number | string;
  /** Board meeting configuration. */
  meetings?: BoardMeetingConfig;
  /** Cross-agent consultation configuration. */
  consultation?: BoardConsultationConfig;
};
```

Added to `ClawdisConfig`:
```typescript
board?: BoardConfig;
```

---

## 4. Implementation Plan

### File Structure

```
src/board/
├── types.ts              — Board types, agent role definitions
├── agents.ts             — Agent registry, default agent definitions
├── personality.ts        — SOUL.md loading and injection per agent
├── router.ts             — Route messages to correct agent by role
├── session-keys.ts       — Board-aware session key resolution
├── consultation.ts       — Cross-agent consultation protocol
├── meeting.ts            — Board meeting coordination
├── meeting-store.ts      — Meeting state persistence
├── telegram-topics.ts    — Telegram topic creation and mapping
├── types.test.ts         — Type validation tests
├── agents.test.ts        — Agent registry tests
├── router.test.ts        — Routing tests
├── consultation.test.ts  — Consultation protocol tests
├── meeting.test.ts       — Meeting coordination tests
└── telegram-topics.test.ts — Topic management tests
```

### 4.1 Phase 1: Agent Definitions & Routing (FB-017)

1. **`src/board/types.ts`** — Core types
2. **`src/board/agents.ts`** — Default agent definitions with SOUL content
3. **`src/board/personality.ts`** — Load personality files, build system prompt fragments
4. **`src/board/router.ts`** — Route incoming messages to the correct agent
5. **`src/board/session-keys.ts`** — Board-aware session key derivation

Integration points:
- `src/auto-reply/reply.ts` → `getReplyFromConfig()` checks `board.enabled`, routes to agent
- `src/agents/system-prompt.ts` → Extended for agent role injection
- `src/config/config.ts` → Add `BoardConfig` type

### 4.2 Phase 2: Telegram Topic Routing (FB-018)

1. **`src/board/telegram-topics.ts`** — Create/map Telegram forum topics
2. **`src/telegram/bot.ts`** → Read `message_thread_id`, route to agent session

### 4.3 Phase 3: Board Meetings (FB-019)

1. **`src/board/meeting.ts`** — Meeting orchestrator
2. **`src/board/meeting-store.ts`** — Meeting state

Flow:
```
User → "Run a board meeting on expanding to Europe"
       ↓
General receives, creates Meeting(topic="expanding to Europe")
       ↓
General sends consultation requests to each specialist:
  Research: "Analyze European market data for expansion"
  Finance:  "Model costs and ROI for European expansion"
  Content:  "Evaluate brand positioning for European markets"
  Strategy: "Map long-term implications of European expansion"
  Critic:   "What could go wrong with European expansion?"
       ↓
Each specialist responds (parallel or sequential based on config)
       ↓
General synthesizes all perspectives into a recommendation
       ↓
Reply delivered to user with structured board decision
```

### 4.4 Phase 4: Cross-Agent Consultation (FB-020)

1. **`src/board/consultation.ts`** — Consultation protocol

Protocol:
```typescript
type ConsultationRequest = {
  fromAgent: string;       // e.g., "strategy"
  toAgent: string;         // e.g., "finance"
  question: string;
  context?: string;        // Optional background
  depth: number;           // Current consultation depth (starts at 0)
  meetingId?: string;      // If part of a board meeting
  timeoutMs: number;
};

type ConsultationResponse = {
  fromAgent: string;
  response: string;
  confidence?: number;     // 0-1 self-assessed confidence
  suggestConsult?: string;  // "You should also ask Research about this"
};
```

Depth limiting prevents infinite loops:
- `depth=0`: Original question from user
- `depth=1`: Agent A asks Agent B
- `depth=2`: Agent B asks Agent C (max default)
- `depth=3`: Blocked — return best-effort answer

---

## 5. Default Personality Templates

### General (Orchestrator)
```
You are the General — the orchestrator of the Board of Directors.
Your role: synthesize perspectives, delegate to specialists, coordinate board meetings.
Reasoning style: balanced, inclusive, decisive after hearing all sides.
You don't have deep expertise in any one area — your strength is seeing the big picture.
When asked a complex question, consider: should I consult the board?
```

### Research Analyst
```
You are the Research Analyst on the Board of Directors.
Your role: gather data, analyze trends, provide evidence-based insights.
Reasoning style: methodical, citation-heavy, skeptical of claims without data.
Always cite sources. Distinguish between verified data and speculation.
Start with "What does the data show?" before forming opinions.
```

### Content / CMO
```
You are the CMO (Chief Marketing Officer) on the Board of Directors.
Your role: brand positioning, messaging strategy, audience understanding, creative direction.
Reasoning style: empathetic, audience-first, narrative-driven.
Think about: How does this look to our audience? What's the story?
```

### Finance / CFO
```
You are the CFO (Chief Financial Officer) on the Board of Directors.
Your role: financial analysis, cost modeling, ROI calculations, budget impact.
Reasoning style: quantitative, risk-aware, ROI-focused.
Always think in numbers. What does this cost? What's the return? What's the runway impact?
```

### Strategy / CEO
```
You are the CEO (Chief Strategy Officer) on the Board of Directors.
Your role: long-term vision, competitive positioning, strategic planning.
Reasoning style: big-picture, forward-looking, competitive-aware.
Think 6-12 months ahead. What are the second-order effects? How does this position us?
```

### Critic / Devil's Advocate
```
You are the Critic (Devil's Advocate) on the Board of Directors.
Your role: stress-test ideas, find weaknesses, challenge assumptions.
Reasoning style: contrarian, thorough, constructive-critical.
Your job is to find what others miss. Ask: What could go wrong? What are we not seeing?
Never be negative for its own sake — always propose mitigations for risks you identify.
```

---

## 6. Message Flow

### Direct Message (board disabled)
```
User → Telegram DM → bot handler → getReplyFromConfig() → general agent → reply
```
(Unchanged from today)

### Direct Message (board enabled)
```
User → Telegram DM → bot handler → getReplyFromConfig() → boardRouter.route()
  → if message mentions specific agent role → route to that agent
  → else → general agent (default)
  → reply
```

### Group Topic Message (board enabled)
```
User → Telegram group topic "Finance" → bot handler
  → read message_thread_id → map to agent role via telegramTopicId
  → getReplyFromConfig() with agentRole="finance"
  → finance agent session → reply (in same topic thread)
```

### Board Meeting
```
User → "Run a board meeting on X" → general agent detects meeting trigger
  → creates Meeting object
  → dispatches consultation requests to all specialists
  → collects responses (with timeout)
  → synthesizes final recommendation
  → delivers structured reply
```

---

## 7. Wire-Up Points

### `src/auto-reply/reply.ts`
```typescript
// After session resolution, before agent invocation:
if (boardEnabled) {
  const agentRole = boardRouter.resolveAgent(ctx, sessionKey, cfg.board);
  // Use agent-specific session key
  sessionKey = boardSessionKey(sessionKey, agentRole);
  // Inject agent personality into system prompt
  extraSystemPrompt = buildBoardSystemPrompt(agentRole, cfg.board);
}
```

### `src/telegram/bot.ts`
```typescript
// In message handler, after resolving chatId:
const threadId = msg.message_thread_id;
if (threadId && boardEnabled) {
  const agentRole = resolveAgentFromTopicId(threadId, cfg.board);
  if (agentRole) {
    ctxPayload.AgentRole = agentRole;  // New field on MsgContext
    ctxPayload.From = `group:${chatId}:topic:${threadId}`;
  }
}
```

### `src/agents/system-prompt.ts`
```typescript
// Extended to accept board context:
buildAgentSystemPromptAppend({
  ...params,
  agentRole,
  boardPersonality,  // Contents of the agent's soul file
})
```
