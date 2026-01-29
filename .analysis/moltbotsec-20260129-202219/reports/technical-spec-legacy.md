# Technical Specification - Legacy System

**Project**: Moltbot (Multi-Channel AI Messaging Assistant)
**Analysis Date**: 2026-01-29
**Status**: Legacy Architecture Documentation

---

## 1. Architectural Principles

### Current Architecture Style

**Pattern**: Modular Monolith with Plugin Extensions
**Evidence**: Single deployable unit (`dist/main.mjs`) with extensible channel plugins in `extensions/` directory. Shared runtime, separate configuration per channel.

### Observed Principles

| Principle | Implementation | Evidence |
|-----------|----------------|----------|
| Separation of Concerns | 5-layer architecture (presentation, domain, infrastructure, shared, test) | `ui/`, `src/commands/models/`, `src/config/`, `apps/shared/`, `test/` |
| Dependency Direction | Bidirectional (violation) - config is central hub | 234 deps config→commands/models, 111 deps commands/models→config |
| Error Handling | Distributed with custom error types | 7 custom errors: `SsrfBlockedError`, `GatewayLockError`, etc. |
| Plugin Architecture | Extension-based with manifest files | `extensions/*/clawdbot.plugin.json` with 28 channel plugins |
| Event-Driven | WebSocket gateway with event streaming | `src/gateway/client.ts:*` - JSON-RPC 2.0 protocol |

### Architectural Strengths

| Strength | Implementation | Evidence |
|----------|----------------|----------|
| Channel Abstraction | Unified interface across 28 platforms | `monitorProvider` pattern per channel |
| Security-First | Multiple authentication modes | Token, Password, Tailscale, Device signature |
| Resilience | Auto-reconnect with exponential backoff | `src/gateway/client.ts` WebSocket reconnection |

### Architectural Weaknesses

| Weakness | Issue | Evidence |
|----------|-------|----------|
| Circular Dependencies | 1 cycle spanning 10 components | config ↔ commands/models ↔ ui/views |
| Central Hub Coupling | Config has 445+ bidirectional deps | `config` component with 2300 symbols |
| State Management | In-memory exec approvals lost on restart | `src/gateway/exec-approval-manager.ts` |

---

## 2. C4 Architecture Views

### 2.1 System Context (C4 Level 1)

```mermaid
C4Context
    title Moltbot System Context

    Person(user, "User", "End user interacting via messaging platforms")
    Person(admin, "Admin", "System administrator managing Moltbot")

    System(moltbot, "Moltbot", "Multi-channel AI messaging assistant")

    System_Ext(telegram, "Telegram", "Telegram Bot API")
    System_Ext(discord, "Discord", "Discord Bot Gateway")
    System_Ext(whatsapp, "WhatsApp", "Baileys/WA Web")
    System_Ext(slack, "Slack", "Slack Events API")
    System_Ext(signal, "Signal", "Signal Protocol")
    System_Ext(channels, "16+ Channels", "Matrix, Teams, etc.")

    System_Ext(claude, "Claude AI", "Anthropic Claude API")
    System_Ext(openai, "OpenAI", "GPT API + Embeddings")
    System_Ext(gemini, "Google Gemini", "Gemini API")

    System_Ext(twilio, "Twilio", "Voice/SMS provider")
    System_Ext(plivo, "Plivo", "Voice provider")
    System_Ext(telnyx, "Telnyx", "Voice provider")

    Rel(user, telegram, "Messages via")
    Rel(user, discord, "Messages via")
    Rel(user, whatsapp, "Messages via")
    Rel(user, slack, "Messages via")
    Rel(user, signal, "Messages via")
    Rel(user, channels, "Messages via")

    Rel(telegram, moltbot, "Webhooks/Polling")
    Rel(discord, moltbot, "Gateway WebSocket")
    Rel(whatsapp, moltbot, "Baileys connection")
    Rel(slack, moltbot, "Events API")
    Rel(signal, moltbot, "Signal protocol")
    Rel(channels, moltbot, "Platform APIs")

    Rel(moltbot, claude, "AI inference")
    Rel(moltbot, openai, "AI inference + embeddings")
    Rel(moltbot, gemini, "AI inference")

    Rel(moltbot, twilio, "Voice calls")
    Rel(moltbot, plivo, "Voice calls")
    Rel(moltbot, telnyx, "Voice calls")

    Rel(admin, moltbot, "Gateway WebSocket control")
```

### 2.2 Container View (C4 Level 2)

```mermaid
C4Container
    title Moltbot Container View

    Person(user, "User", "End user")
    Person(admin, "Admin", "Administrator")

    System_Boundary(moltbot, "Moltbot System") {
        Container(gateway, "Gateway Server", "Node.js/TypeScript", "WebSocket control plane, auth, exec approval")
        Container(autoreply, "Auto-Reply Engine", "TypeScript", "Message processing, command detection, agent execution")
        Container(channels, "Channel Adapters", "TypeScript Plugins", "28 platform integrations")
        Container(memory, "Memory Index", "SQLite + sqlite-vec", "Vector embeddings, FTS5, session storage")
        Container(cron, "Cron Service", "TypeScript", "Scheduled job management")
        Container(voice, "Voice Extension", "TypeScript", "Twilio/Plivo/Telnyx calls")
        Container(tui, "TUI Interface", "Ink/React", "Terminal user interface")
        Container(ui, "Web UI", "Solid.js", "Browser-based configuration")
    }

    System_Ext(aiapis, "AI APIs", "Claude, OpenAI, Gemini")
    System_Ext(platforms, "Messaging Platforms", "28 channels")
    System_Ext(voiceproviders, "Voice Providers", "Twilio, Plivo, Telnyx")

    Rel(admin, gateway, "WebSocket JSON-RPC", "wss://127.0.0.1:18789")
    Rel(admin, tui, "Terminal", "stdin/stdout")
    Rel(admin, ui, "HTTP", "localhost:*")

    Rel(platforms, channels, "Platform APIs", "HTTPS/WebSocket")
    Rel(channels, autoreply, "Internal calls", "TypeScript")
    Rel(autoreply, aiapis, "AI inference", "HTTPS")
    Rel(autoreply, memory, "RAG queries", "SQLite")
    Rel(gateway, autoreply, "Control events", "Internal")
    Rel(cron, autoreply, "Scheduled triggers", "Internal")
    Rel(voice, voiceproviders, "Voice streams", "WebSocket/TwiML")
    Rel(voice, autoreply, "Transcripts", "Internal")
```

### 2.3 Component View (C4 Level 3)

```mermaid
C4Component
    title Moltbot Core Components

    Container_Boundary(core, "Moltbot Core") {
        Component(config, "Config Module", "TypeScript", "2300 symbols, 129 files - Central configuration hub")
        Component(commands, "Commands/Models", "TypeScript", "372 symbols - Domain models and commands")
        Component(gateway_client, "Gateway Client", "TypeScript", "WebSocket client with auto-reconnect")
        Component(gateway_auth, "Gateway Auth", "TypeScript", "Multi-mode authentication")
        Component(exec_approval, "Exec Approval Manager", "TypeScript", "Command execution gating")
        Component(memory_mgr, "Memory Index Manager", "TypeScript", "Hybrid search with embeddings")
        Component(ssrf, "SSRF Protection", "TypeScript", "DNS pinning, IP validation")
        Component(audit, "Security Audit", "TypeScript", "Configuration security checks")
        Component(cron_svc, "Cron Service", "TypeScript", "Job scheduling with CRUD")
    }

    Container_Boundary(channels_boundary, "Channel Adapters") {
        Component(telegram, "Telegram Adapter", "TypeScript", "Bot API polling/webhooks")
        Component(discord, "Discord Adapter", "TypeScript", "Gateway + REST API")
        Component(whatsapp, "WhatsApp Adapter", "TypeScript", "Baileys multi-device")
        Component(slack, "Slack Adapter", "TypeScript", "Events API + Socket Mode")
        Component(other_channels, "16+ Other Adapters", "TypeScript", "Signal, Matrix, Teams, etc.")
    }

    Container_Boundary(extensions, "Extensions") {
        Component(voice_call, "Voice Call Manager", "TypeScript", "Call state machine")
        Component(voice_providers, "Voice Providers", "TypeScript", "Twilio, Plivo, Telnyx")
        Component(memory_lance, "LanceDB Memory", "TypeScript", "Alternative vector store")
        Component(open_prose, "Open Prose", "TypeScript", "Writing assistant skill")
    }

    Rel(gateway_client, gateway_auth, "Authenticates with")
    Rel(gateway_client, exec_approval, "Requests approval from")
    Rel(config, commands, "Configures", "234 deps")
    Rel(commands, config, "Reads from", "111 deps")
    Rel(telegram, config, "Uses config")
    Rel(discord, config, "Uses config")
    Rel(whatsapp, config, "Uses config")
    Rel(slack, config, "Uses config")
    Rel(other_channels, config, "Uses config")
    Rel(memory_mgr, ssrf, "Validates URLs")
    Rel(voice_call, voice_providers, "Delegates to")
```

**Evidence**: Extracted from `mcp__civyk-repoix__get_components` and `mcp__civyk-repoix__get_dependencies` analysis.

---

## 3. Component Dependency Diagram

```mermaid
graph TB
    subgraph Presentation["Presentation Layer"]
        UI_VIEWS["ui/views<br/>537 symbols"]
        UI_CTRL["ui/controllers<br/>246 symbols"]
        UI_COMP["ui/components<br/>10 symbols"]
        TUI["tui/components<br/>90 symbols"]
    end

    subgraph Domain["Domain Layer"]
        COMMANDS["commands/models<br/>372 symbols"]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        CONFIG["config<br/>2300 symbols"]
        CTRL_CFG["controllers/config<br/>4 symbols"]
    end

    subgraph Shared["Shared Layer"]
        APPS["apps/shared<br/>447 symbols"]
        TEST_HELP["test/helpers<br/>37 symbols"]
        SHARED["shared<br/>4 symbols"]
        UTILS["utils<br/>7 symbols"]
    end

    subgraph Test["Test Layer"]
        TEST["test<br/>261 symbols"]
    end

    %% High-coupling dependencies (>50)
    CONFIG -->|234| COMMANDS
    UI_VIEWS -->|212| CONFIG
    COMMANDS -->|111| CONFIG
    CONFIG -->|82| UI_VIEWS
    UI_VIEWS -->|69| COMMANDS
    UI_VIEWS -->|53| UI_CTRL
    TEST -->|52| CONFIG

    %% Medium dependencies (10-50)
    UI_CTRL -->|46| CONFIG
    UI_CTRL -->|36| UI_VIEWS
    UI_VIEWS -->|29| APPS
    TUI -->|28| CONFIG
    CONFIG -->|19| APPS
    COMMANDS -->|18| APPS

    %% Circular dependency highlight
    style CONFIG fill:#ff6b6b
    style COMMANDS fill:#ff6b6b
    style UI_VIEWS fill:#ff6b6b
```

### Dependency Analysis

| Component | Depends On | Depended By | Coupling |
|-----------|------------|-------------|----------|
| config | commands/models (234), ui/views (82), apps/shared (19) | ui/views (212), commands/models (111), test (52) | **Critical** |
| ui/views | config (212), commands/models (69), ui/controllers (53) | config (82), ui/controllers (36), commands/models (13) | High |
| commands/models | config (111), apps/shared (18), ui/views (13) | config (234), ui/views (69), tui/components (13) | High |
| ui/controllers | config (46), ui/views (36), controllers/config (15) | ui/views (53), config (13), commands/models (11) | Medium |
| tui/components | config (28), commands/models (13), apps/shared (11) | ui/views (6), ui/controllers (1) | Medium |
| apps/shared | commands/models (3), config (2), ui/components (2) | ui/views (29), config (19), commands/models (18) | Low (shared) |
| test | config (52), commands/models (6), apps/shared (5) | config (5), tui/components (3), commands/models (2) | Low (test) |

**Evidence**: Import analysis via `mcp__civyk-repoix__get_dependencies` - 49 cross-component dependency edges identified.

### Circular Dependency

**Cycle**: config → commands/models → ui/views → ui/controllers → controllers/config → tui/components → ui/components → test/helpers → test → apps/shared → config

**Impact**: Tight coupling prevents independent deployment, complicates testing, increases risk of cascading changes.

---

## 4. Sequence Diagrams

### 4.1 Message Processing Flow

```mermaid
sequenceDiagram
    participant Platform as Messaging Platform
    participant Monitor as Channel Monitor
    participant Handler as Message Handler
    participant Policy as DM Policy
    participant Pipeline as Auto-Reply Pipeline
    participant Agent as Agent Runner
    participant AI as AI Provider
    participant Memory as Memory Index
    participant Response as Response Delivery

    Platform->>Monitor: Incoming message
    Monitor->>Handler: createMessageHandler()
    Handler->>Policy: checkDmPolicy()

    alt DM Policy Rejected
        Policy-->>Handler: Reject
        Handler-->>Platform: No response
    else DM Policy Allowed
        Policy-->>Handler: Allow
        Handler->>Pipeline: processMessage()
        Pipeline->>Pipeline: detectCommand()

        alt Command Detected
            Pipeline->>Agent: executeCommand()
        else Regular Message
            Pipeline->>Memory: queryContext()
            Memory-->>Pipeline: Relevant context
            Pipeline->>Agent: runAgent()
        end

        Agent->>AI: inference()

        alt Rate Limit / Error
            AI-->>Agent: Error
            Agent->>AI: failoverToNextModel()
        else Success
            AI-->>Agent: Response
        end

        Agent->>Response: formatResponse()
        Response->>Platform: sendMessage()
    end
```

**Evidence**: Flow traced through `src/web/auto-reply.ts`, channel monitor providers (18 implementations), message handlers (29 implementations).

### 4.2 Gateway Authentication Flow

```mermaid
sequenceDiagram
    participant Client as Gateway Client
    participant Server as Gateway Server
    participant Auth as Auth Module
    participant Device as Device Store

    Client->>Server: WebSocket connect (wss://127.0.0.1:18789)
    Server->>Server: TLS fingerprint capture

    alt Token Auth
        Client->>Server: auth_token message
        Server->>Auth: validateToken()
        Auth->>Auth: timingSafeEqual(token)
        Auth-->>Server: Valid/Invalid
    else Password Auth
        Client->>Server: auth_password message
        Server->>Auth: validatePassword()
        Auth->>Auth: timingSafeEqual(hash)
        Auth-->>Server: Valid/Invalid
    else Device Auth
        Client->>Server: auth_device message
        Server->>Device: lookupDevice(publicKey)
        Server->>Client: nonce_challenge
        Client->>Client: sign(nonce, privateKey)
        Client->>Server: nonce_response(signature)
        Server->>Auth: verifySignature()
        Auth-->>Server: Valid/Invalid
    else Tailscale Auth
        Client->>Server: auth_tailscale message
        Server->>Auth: tailscaleWhois()
        Auth-->>Server: User identity
    end

    alt Auth Success
        Server->>Server: Pin TLS fingerprint
        Server-->>Client: auth_success + session_token
    else Auth Failure
        Server-->>Client: auth_error
        Server->>Server: Close connection
    end
```

**Evidence**: `src/gateway/auth.ts`, `src/gateway/client.ts`, device authentication with nonce challenge.

### 4.3 Exec Approval Workflow

```mermaid
sequenceDiagram
    participant Agent as Agent Runner
    participant Exec as Exec Approval Manager
    participant Gateway as Gateway Server
    participant Discord as Discord Monitor
    participant Admin as Admin User

    Agent->>Exec: requestApproval(command, sessionKey)
    Exec->>Exec: createPendingApproval()
    Exec->>Gateway: emit("exec_approval_request")
    Gateway->>Discord: postApprovalMessage()
    Discord-->>Admin: Show approval buttons

    par Timeout Path
        Exec->>Exec: setTimeout(timeout)
        Note over Exec: Wait for approval or timeout
    and Approval Path
        Admin->>Discord: Click Approve/Deny
        Discord->>Exec: resolveApproval(approved)
    end

    alt Approved
        Exec-->>Agent: { approved: true }
        Agent->>Agent: executeCommand()
    else Denied
        Exec-->>Agent: { approved: false }
        Agent->>Agent: rejectExecution()
    else Timeout
        Exec-->>Agent: { approved: false, timeout: true }
        Agent->>Agent: rejectExecution()
    end
```

**Evidence**: `src/gateway/exec-approval-manager.ts`, `src/discord/monitor/exec-approvals.ts`.

### 4.4 Voice Call State Machine

```mermaid
sequenceDiagram
    participant User as User
    participant Manager as Call Manager
    participant Provider as Voice Provider
    participant Twilio as Twilio API
    participant Agent as Agent Runner

    User->>Manager: initiateCall(phoneNumber)
    Manager->>Manager: createCall() state=INITIATED
    Manager->>Provider: connect()
    Provider->>Twilio: POST /Calls
    Twilio-->>Provider: CallSid
    Provider-->>Manager: connected
    Manager->>Manager: state=RINGING

    Twilio->>Provider: Webhook: call_answered
    Provider->>Manager: onAnswered()
    Manager->>Manager: state=IN_PROGRESS
    Manager->>Manager: startMaxDurationTimer()

    loop During Call
        Twilio->>Provider: MediaStream audio
        Provider->>Manager: onTranscript(text)
        Manager->>Agent: processUtterance()
        Agent-->>Manager: response
        Manager->>Provider: speak(response)
        Provider->>Twilio: TTS audio
    end

    alt User Hangup
        Twilio->>Provider: Webhook: call_ended
    else Max Duration
        Manager->>Provider: hangup()
    else Agent Ends
        Agent->>Manager: endCall()
        Manager->>Provider: hangup()
    end

    Provider->>Manager: onEnded()
    Manager->>Manager: state=COMPLETED
    Manager->>Manager: persistTranscript()
```

**Evidence**: `extensions/voice-call/src/manager.ts`, `extensions/voice-call/src/providers/twilio.ts`.

---

## 5. Deployment Architecture

### Current Deployment Model

**Platform**: Docker containerized, single-host deployment
**Evidence**: `Dockerfile`, `docker-compose.yml`

```mermaid
graph TB
    subgraph Host["Docker Host"]
        subgraph Container["Moltbot Container"]
            NODE["Node.js 22"]
            APP["dist/main.mjs"]
            SQLITE["SQLite DB"]
        end

        VOLUMES["Docker Volumes"]
        VOLUMES -->|"state/"| SQLITE
        VOLUMES -->|"config/"| APP
    end

    subgraph External["External Services"]
        AI["AI APIs<br/>(Claude, OpenAI, Gemini)"]
        VOICE["Voice Providers<br/>(Twilio, Plivo, Telnyx)"]
        PLATFORMS["Messaging Platforms<br/>(28 channels)"]
    end

    HOST_NET["Host Network"]
    HOST_NET -->|"18789"| Container
    HOST_NET -->|"18790"| Container

    Container -->|"HTTPS"| AI
    Container -->|"WebSocket"| VOICE
    Container -->|"HTTPS/WS"| PLATFORMS
```

### Infrastructure Components

| Component | Technology | Purpose | Evidence |
|-----------|------------|---------|----------|
| Runtime | Node.js 22.12+ | JavaScript execution | `package.json` engines field |
| Bundler | rolldown | ESM bundle generation | `package.json` build script |
| Container | Docker (node:22-bookworm) | Deployment isolation | `Dockerfile` |
| Orchestration | Docker Compose | Single-host orchestration | `docker-compose.yml` |
| Database | SQLite + sqlite-vec | Embedded storage + vectors | `src/memory/manager.ts` |
| CI/CD | GitHub Actions | Automated testing/builds | `.github/workflows/ci.yml` |

### Port Allocation

| Port | Service | Protocol | Binding |
|------|---------|----------|---------|
| 18789 | Gateway Server | WebSocket | 127.0.0.1 (configurable) |
| 18790 | Bridge Server | WebSocket | 127.0.0.1 (configurable) |

### Security Hardening

| Measure | Implementation | Evidence |
|---------|----------------|----------|
| Non-root user | Container runs as `node` (uid 1000) | `Dockerfile` USER directive |
| TLS fingerprint | Pin client certificate fingerprint | `src/gateway/auth.ts` |
| SSRF protection | DNS pinning, private IP blocking | `src/infra/net/ssrf.ts` |
| Exec approval | Human-in-the-loop for commands | `src/gateway/exec-approval-manager.ts` |

---

## 6. Data Flow Diagrams

### 6.1 Request/Response Flow

```mermaid
flowchart LR
    subgraph Input["Input Sources"]
        PLATFORM["Messaging Platform"]
        GATEWAY["Gateway WebSocket"]
        CRON["Cron Scheduler"]
        VOICE["Voice Stream"]
    end

    subgraph Processing["Processing Pipeline"]
        MONITOR["Channel Monitor"]
        HANDLER["Message Handler"]
        PIPELINE["Auto-Reply Pipeline"]
        AGENT["Agent Runner"]
    end

    subgraph Data["Data Layer"]
        MEMORY["Memory Index<br/>(sqlite-vec)"]
        CONFIG["Configuration<br/>(YAML/JSON)"]
        STATE["Session State<br/>(SQLite)"]
    end

    subgraph AI["AI Inference"]
        CLAUDE["Claude API"]
        OPENAI["OpenAI API"]
        GEMINI["Gemini API"]
        LOCAL["Local LLM"]
    end

    subgraph Output["Output"]
        RESPONSE["Response Formatter"]
        DELIVERY["Channel Delivery"]
    end

    PLATFORM --> MONITOR
    GATEWAY --> HANDLER
    CRON --> PIPELINE
    VOICE --> HANDLER

    MONITOR --> HANDLER
    HANDLER --> PIPELINE
    PIPELINE --> AGENT

    AGENT <--> MEMORY
    AGENT <--> CONFIG
    AGENT <--> STATE

    AGENT --> CLAUDE
    AGENT --> OPENAI
    AGENT --> GEMINI
    AGENT --> LOCAL

    CLAUDE --> RESPONSE
    OPENAI --> RESPONSE
    GEMINI --> RESPONSE
    LOCAL --> RESPONSE

    RESPONSE --> DELIVERY
    DELIVERY --> PLATFORM
```

### 6.2 Data Transformation Points

| Source | Transform | Destination | Evidence |
|--------|-----------|-------------|----------|
| Platform message | Normalize to internal format | Message handler | Channel adapter `toInternalMessage()` |
| User query | Generate embedding vector | Memory index | `src/memory/manager.ts` embedding providers |
| Memory search | Hybrid ranking (vector + BM25) | Agent context | `src/memory/manager.ts` hybrid search |
| AI response | Chunk for platform limits | Response delivery | Platform-specific message length limits |
| Voice audio | Transcribe to text | Agent input | `extensions/voice-call/src/media-stream.ts` |
| Agent response | Text-to-speech synthesis | Voice stream | Voice provider TTS |

**Evidence**: Traced from channel adapters through `src/web/auto-reply.ts` to `src/memory/manager.ts` and response delivery.

### 6.3 Memory Indexing Flow

```mermaid
flowchart TB
    subgraph Sources["Index Sources"]
        FILES["Markdown Files"]
        SESSIONS["JSONL Transcripts"]
        MANUAL["Manual Entries"]
    end

    subgraph Detection["Change Detection"]
        HASH["Content Hash<br/>(SHA-256)"]
        DELTA["Delta Detection"]
        DEBOUNCE["Debounce<br/>(5s sessions)"]
    end

    subgraph Processing["Processing"]
        CHUNK["Markdown Chunking"]
        EMBED["Embedding Generation"]
        INDEX["Vector + FTS Index"]
    end

    subgraph Storage["Storage"]
        SQLITE["SQLite DB"]
        VEC["sqlite-vec<br/>(vectors)"]
        FTS["FTS5<br/>(keywords)"]
    end

    FILES --> HASH
    SESSIONS --> DELTA
    MANUAL --> CHUNK

    HASH --> CHUNK
    DELTA --> DEBOUNCE
    DEBOUNCE --> CHUNK

    CHUNK --> EMBED
    EMBED --> INDEX

    INDEX --> SQLITE
    INDEX --> VEC
    INDEX --> FTS
```

---

## 7. Resilience Patterns

### Current Patterns

| Pattern | Implementation | Evidence |
|---------|----------------|----------|
| Retry | Exponential backoff for WebSocket reconnection | `src/gateway/client.ts` - auto-reconnect with delay |
| Circuit Breaker | Not implemented (opportunity) | N/A |
| Timeout | Configurable per operation | `timeout_ms` in config options |
| Fallback | Model failover chain on errors | Agent runtime model selection |
| Rate Limiting | Exponential backoff for embeddings | `src/memory/manager.ts` rate limit handling |
| Batch Fallback | Non-batch after 2 failures | `src/memory/manager.ts` embedding batching |

### Error Handling Architecture

```mermaid
flowchart TB
    subgraph Errors["Error Types"]
        SSRF["SsrfBlockedError"]
        GATEWAY["GatewayLockError"]
        CONFIG["ConfigIncludeError"]
        CIRCULAR["CircularIncludeError"]
        DISCORD["DiscordApiError"]
        FAILOVER["FailoverError"]
        MEDIA["MediaFetchError"]
    end

    subgraph Handling["Error Handling"]
        CATCH["Try/Catch Boundaries"]
        LOG["Structured Logging"]
        AUDIT["Security Audit"]
        NOTIFY["User Notification"]
    end

    subgraph Recovery["Recovery Actions"]
        RETRY["Retry with Backoff"]
        FAILOVER_CHAIN["Model Failover"]
        GRACEFUL["Graceful Degradation"]
        ALERT["Admin Alert"]
    end

    SSRF --> AUDIT
    SSRF --> LOG

    GATEWAY --> LOG
    GATEWAY --> ALERT

    CONFIG --> CATCH
    CIRCULAR --> CATCH
    CONFIG --> LOG
    CIRCULAR --> LOG

    DISCORD --> CATCH
    DISCORD --> RETRY

    FAILOVER --> FAILOVER_CHAIN
    MEDIA --> GRACEFUL

    AUDIT --> ALERT
    CATCH --> NOTIFY
    LOG --> NOTIFY
```

### Gateway Reconnection Strategy

```mermaid
sequenceDiagram
    participant Client as Gateway Client
    participant Server as Gateway Server
    participant Timer as Reconnect Timer

    Client->>Server: WebSocket connect
    Server-->>Client: Connection established

    Note over Client,Server: Connection drops

    Client->>Timer: Start reconnect (delay=1s)
    Timer->>Client: Trigger
    Client->>Server: Reconnect attempt 1
    Server--xClient: Failed

    Client->>Timer: Backoff (delay=2s)
    Timer->>Client: Trigger
    Client->>Server: Reconnect attempt 2
    Server--xClient: Failed

    Client->>Timer: Backoff (delay=4s)
    Timer->>Client: Trigger
    Client->>Server: Reconnect attempt 3
    Server-->>Client: Connected

    Client->>Server: Re-authenticate
    Server-->>Client: Session restored
```

**Evidence**: `src/gateway/client.ts` WebSocket auto-reconnect with exponential backoff.

---

## 8. Why This Pattern (Legacy Analysis)

### Current Architecture Rationale

Based on code analysis, the legacy architecture choices:

| Choice | Likely Reason | Evidence | Impact |
|--------|---------------|----------|--------|
| Modular Monolith | Rapid development, shared state | Single `dist/main.mjs` bundle | Deployment simplicity, testing complexity |
| TypeScript | Type safety for large codebase | `tsconfig.json` strict mode | Maintainability (+), build complexity (+) |
| SQLite | Zero-config embedded database | No external DB dependency | Simplicity (+), scalability (-) |
| WebSocket Gateway | Real-time control plane | `wss://127.0.0.1:18789` | Responsive UI, connection management |
| Plugin Extensions | Channel modularity | `extensions/` directory | Extensibility (+), dependency management (-) |
| Constructor DI | Service composition | Deps interface pattern | Testability (+), boilerplate (+) |

### Technical Debt Identified

| Area | Issue | Evidence | Severity |
|------|-------|----------|----------|
| Circular Dependencies | 10-component cycle | `config` ↔ `commands/models` ↔ `ui/views` | High |
| Central Hub | `config` has 2300 symbols, 445+ deps | Single point of coupling | High |
| In-Memory State | Exec approvals lost on restart | `ExecApprovalManager` Map storage | Medium |
| Missing Circuit Breaker | No external API failure isolation | No circuit breaker pattern | Medium |
| Test Coverage | 70% threshold, gaps in integration | `vitest.config.ts` coverage config | Medium |
| Monolith Deployment | Single container, no horizontal scaling | `docker-compose.yml` single service | Low |

### Migration Implications

| Current State | Target Consideration | Risk |
|---------------|---------------------|------|
| TypeScript + Node.js | Python 3.12+ migration | Full rewrite, no incremental path |
| SQLite + sqlite-vec | Keep (user preference) | Data migration for schema changes |
| WebSocket Gateway | Maintain pattern in Python | Protocol compatibility |
| 28 Channel Plugins | Adapter pattern preservation | Per-channel testing required |
| Constructor DI | Python dependency injection | Pattern translation |

---

*Part 1 of 3 - Sections 1-8 Complete*

---

## 9. Capabilities by Phase (Current State)

### Core Capabilities (80%)

| Capability | Component | Coverage | Evidence |
|------------|-----------|----------|----------|
| Multi-channel messaging | Channel Adapters | 100% | 28 platforms in `extensions/` |
| AI inference | Agent Runner | 95% | Claude, OpenAI, Gemini, local LLM support |
| Context-aware responses | Memory Index | 90% | `src/memory/manager.ts` hybrid search |
| Gateway control plane | Gateway Server | 95% | `src/gateway/client.ts` WebSocket JSON-RPC |
| Authentication | Gateway Auth | 90% | Token, Password, Tailscale, Device modes |
| Command execution | Exec Approval Manager | 85% | `src/gateway/exec-approval-manager.ts` |
| Voice calls | Voice Extension | 80% | Twilio, Plivo, Telnyx providers |

### Supporting Capabilities (15%)

| Capability | Component | Coverage | Evidence |
|------------|-----------|----------|----------|
| Scheduled jobs | Cron Service | 75% | `src/cron/service.ts` CRUD operations |
| Security auditing | Security Audit | 70% | `src/security/audit.ts` configuration checks |
| SSRF protection | SSRF Module | 95% | `src/infra/net/ssrf.ts` DNS pinning |
| Configuration management | Config Module | 85% | Zod schemas, env substitution |
| TUI interface | TUI Components | 70% | Ink/React terminal UI |
| Web UI | UI Views | 65% | Solid.js browser interface |

### Edge Cases (5%)

| Capability | Component | Coverage | Evidence |
|------------|-----------|----------|----------|
| Device fingerprinting | Device Identity | 60% | `src/infra/device-identity.ts` |
| Browser automation | CDP Module | 50% | `src/browser/cdp.ts` Puppeteer |
| Auth profiles | Auth Profiles | 55% | `src/agents/auth-profiles.ts` |
| LanceDB memory | Memory Extension | 40% | `extensions/memory-lancedb/index.ts` |

---

## 10. Component / Service Responsibilities

| Component | Responsibility | Dependencies | Evidence |
|-----------|----------------|--------------|----------|
| **Gateway Server** | WebSocket control plane, auth, events | Auth Module, Exec Approval | `src/gateway/` |
| **Gateway Auth** | Multi-mode authentication (Token/Password/Tailscale/Device) | Crypto, Device Store | `src/gateway/auth.ts` |
| **Exec Approval Manager** | Command execution gating with human-in-the-loop | Gateway Events, Discord Monitor | `src/gateway/exec-approval-manager.ts` |
| **Memory Index Manager** | Vector embeddings, FTS5, hybrid search | SQLite, Embedding Providers | `src/memory/manager.ts` |
| **Cron Service** | Scheduled job management | Cron Store, Auto-Reply | `src/cron/service.ts` |
| **Security Audit** | Configuration security validation | Config Module | `src/security/audit.ts` |
| **SSRF Protection** | DNS pinning, private IP blocking | undici Agent | `src/infra/net/ssrf.ts` |
| **Call Manager** | Voice call state machine, lifecycle | Voice Providers, Transcript | `extensions/voice-call/src/manager.ts` |
| **Voice Providers** | Twilio/Plivo/Telnyx integration | External APIs, TwiML | `extensions/voice-call/src/providers/` |
| **Channel Adapters** | Platform-specific messaging | Platform APIs, Config | `extensions/{platform}/` |
| **Config Module** | Zod validation, env substitution, includes | File system | `src/config/` |
| **Auto-Reply Pipeline** | Message processing, command detection | Agent Runner, Memory | `src/web/auto-reply.ts` |
| **Agent Runner** | AI inference, tool execution, failover | AI APIs, Tools | Agent runtime |
| **TUI Components** | Terminal user interface | Ink, React | `src/tui/components/` |
| **UI Views** | Web configuration interface | Solid.js | `ui/src/ui/views/` |

---

## 11. Interfaces & Contracts

### Internal Interfaces

| Interface | Provider | Consumer | Protocol | Evidence |
|-----------|----------|----------|----------|----------|
| GatewayClient | Gateway Server | TUI/UI/CLI | WebSocket JSON-RPC 2.0 | `src/gateway/client.ts` |
| ChannelMonitor | Channel Adapters | Auto-Reply | Event callbacks | `monitorProvider` pattern |
| MessageHandler | Auto-Reply | Channels | Internal function | `createMessageHandler()` |
| MemoryQuery | Memory Index | Agent Runner | SQLite queries | `src/memory/manager.ts` |
| ExecApprovalRequest | Exec Manager | Gateway/Discord | Promise-based | `src/gateway/exec-approval-manager.ts` |
| VoiceCallProvider | Voice Providers | Call Manager | Abstraction interface | `extensions/voice-call/src/providers/` |
| ConfigSchema | Config Module | All Components | Zod types | `src/config/zod-schema.ts` |

### External Contracts

| System | Protocol | Schema | Evidence |
|--------|----------|--------|----------|
| Claude AI | HTTPS REST | Claude API spec | Session key authentication |
| OpenAI | HTTPS REST | OpenAI API v1 | API key authentication |
| Google Gemini | HTTPS REST | Gemini API | API key authentication |
| Telegram | HTTPS REST/Webhooks | Bot API | Bot token |
| Discord | WebSocket + REST | Discord Gateway v10 | Bot token + OAuth2 |
| WhatsApp | Baileys WebSocket | WA Web protocol | QR device linking |
| Slack | HTTPS REST + Socket Mode | Events API v2 | OAuth tokens |
| Twilio | HTTPS REST + WebSocket | TwiML, Media Streams | Account SID + Auth Token |
| Plivo | HTTPS REST | Plivo API | Account credentials |
| Telnyx | HTTPS REST | Telnyx API v2 | API key |

---

## 12. Data & Schema (Legacy)

### Database Schema

| Table/Store | Type | Purpose | Evidence |
|-------------|------|---------|----------|
| memory_entries | SQLite + sqlite-vec | Vector embeddings for RAG | `src/memory/manager.ts` |
| fts_index | SQLite FTS5 | Full-text keyword search | `src/memory/manager.ts` |
| sessions | JSONL files | Conversation transcripts | Session storage |
| cron_jobs | SQLite | Scheduled job definitions | `src/cron/store.ts` |
| call_records | SQLite | Voice call persistence | `extensions/voice-call/` |
| config | YAML/JSON files | Application configuration | `src/config/` |
| device_tokens | In-memory | Device authentication | `src/gateway/auth.ts` |
| exec_approvals | In-memory Map | Pending approval requests | `src/gateway/exec-approval-manager.ts` |

### Schema Diagram

```mermaid
erDiagram
    MEMORY_ENTRIES {
        text id PK
        text content
        blob embedding
        text source
        timestamp created_at
        text metadata
    }

    FTS_INDEX {
        text rowid PK
        text content
        text source
    }

    SESSIONS {
        text session_id PK
        text agent_id
        jsonb messages
        timestamp created_at
        timestamp updated_at
    }

    CRON_JOBS {
        text id PK
        text name
        text schedule
        text command
        boolean enabled
        timestamp last_run
        timestamp next_run
    }

    CALL_RECORDS {
        text call_id PK
        text phone_number
        text provider
        text status
        text transcript
        timestamp started_at
        timestamp ended_at
    }

    CONFIG {
        text key PK
        jsonb value
        text source
    }

    MEMORY_ENTRIES ||--o{ FTS_INDEX : "indexed_in"
    SESSIONS ||--o{ MEMORY_ENTRIES : "generates"
    CRON_JOBS ||--o{ SESSIONS : "triggers"
```

**Evidence**: Extracted from `src/memory/manager.ts`, `src/cron/store.ts`, `extensions/voice-call/`.

---

## 13. Current Tech Stack

| Category | Technology | Version | Purpose | Evidence |
|----------|------------|---------|---------|----------|
| **Language** | TypeScript | 5.x | Primary development language | `package.json`, 3028 .ts files |
| **Runtime** | Node.js | 22.12+ | JavaScript execution | `package.json` engines |
| **Alt Runtime** | Bun | Supported | Alternative runtime | `CLAWDBOT_PREFER_PNPM` flag |
| **Package Manager** | pnpm | 10.23.0 | Dependency management | `package.json` packageManager |
| **Bundler** | rolldown | Latest | ESM bundle generation | Build scripts |
| **Linter** | oxlint | Latest | Code linting | `.oxlintrc` |
| **Test Framework** | vitest | Latest | Unit/integration testing | `vitest.config.ts` |
| **Database** | SQLite | 3.x | Embedded data storage | Local file-based |
| **Vector Store** | sqlite-vec | Latest | Vector embeddings | `src/memory/manager.ts` |
| **Full-Text Search** | FTS5 | SQLite built-in | Keyword search | `src/memory/manager.ts` |
| **TUI Framework** | Ink | 4.x | Terminal UI | `src/tui/` |
| **UI Framework** | Solid.js | Latest | Web UI | `ui/` |
| **HTTP Client** | undici | Latest | HTTP requests with SSRF protection | `src/infra/net/` |
| **Schema Validation** | Zod | Latest | Runtime type validation | `src/config/zod-schema.ts` |
| **Container** | Docker | Latest | Deployment | `Dockerfile` |
| **CI/CD** | GitHub Actions | Latest | Automated pipelines | `.github/workflows/` |

### Dependency Summary

| Category | Count | Evidence |
|----------|-------|----------|
| Runtime dependencies | 200+ | `package.json` dependencies |
| Dev dependencies | 50+ | `package.json` devDependencies |
| Total packages | 250+ | `pnpm-lock.yaml` |

---

## 14. NFR Targets (Current Implementation)

### Performance

| Metric | Current Value | Source | Evidence |
|--------|---------------|--------|----------|
| Gateway response time | <100ms (local) | WebSocket keepalive | `src/gateway/client.ts` tick-based |
| Embedding batch size | Configurable | Memory manager | `src/memory/manager.ts` |
| Memory query latency | <500ms | Hybrid search | sqlite-vec + FTS5 |
| Message processing | Single-threaded | Node.js event loop | Async/await patterns |
| Reconnect backoff | Exponential (1s-30s) | Gateway client | `src/gateway/client.ts` |

### Availability

| Metric | Current | Evidence |
|--------|---------|----------|
| Uptime SLA | No formal SLA | Self-hosted model |
| Recovery time | Manual restart | No auto-recovery orchestration |
| Failover | Model chain failover | Agent runtime model selection |
| Data durability | SQLite WAL mode | `src/memory/manager.ts` |

### Scalability

| Metric | Current | Evidence |
|--------|---------|----------|
| Horizontal scaling | Not supported | Single container deployment |
| Concurrent connections | Limited by event loop | Node.js single-threaded |
| Database scaling | Embedded (single file) | SQLite limitation |
| Channel parallelism | Per-channel threads | Platform-specific |

---

## 15. Operations & SRE (Current)

### Monitoring

| Aspect | Tool | Metrics | Evidence |
|--------|------|---------|----------|
| APM | None (structured logs) | Console output | stdout/stderr |
| Logs | Console + file | JSON structured | Logging utilities |
| Alerts | None built-in | Manual monitoring | No alerting system |
| Health checks | Gateway ping | Connection status | WebSocket keepalive |

### Deployment Operations

| Operation | Method | Evidence |
|-----------|--------|----------|
| Build | `pnpm build` → rolldown | `package.json` scripts |
| Test | `pnpm test` → vitest | `vitest.config.ts` |
| Lint | `pnpm lint` → oxlint | `.oxlintrc` |
| Format | `pnpm format` | Formatting scripts |
| Deploy | Docker build + run | `Dockerfile`, `docker-compose.yml` |
| Secrets | detect-secrets | Pre-commit hook |

### Runbooks

| Operation | Documentation | Evidence |
|-----------|---------------|----------|
| Initial setup | README.md | Project documentation |
| Configuration | Config schema | `src/config/zod-schema.ts` |
| Channel setup | Platform docs | Per-channel README |
| Troubleshooting | Limited | Community Discord |

### CI/CD Pipeline

| Job | Purpose | Evidence |
|-----|---------|----------|
| install-check | Dependency validation | `.github/workflows/ci.yml` |
| lint | Code quality | oxlint |
| test | Unit/integration tests | vitest |
| build | Bundle generation | rolldown |
| protocol | Protocol validation | Custom checks |
| format | Code formatting | Prettier/similar |
| secrets | Secret scanning | detect-secrets |
| macos-app | macOS native build | Swift |
| android | Android build | Gradle |

---

## 16. Security & Compliance (Current)

### Security Implementation

| Aspect | Implementation | Evidence |
|--------|----------------|----------|
| **Authentication** | Multi-mode: Token, Password, Tailscale, Device signature | `src/gateway/auth.ts` |
| **Timing-safe comparison** | crypto.timingSafeEqual for password/token validation | `src/gateway/auth.ts` |
| **TLS fingerprinting** | Client certificate fingerprint pinning | `src/gateway/auth.ts` |
| **SSRF protection** | DNS pinning, private IP range blocking | `src/infra/net/ssrf.ts` |
| **Exec approval** | Human-in-the-loop for command execution | `src/gateway/exec-approval-manager.ts` |
| **Input validation** | Zod schema validation | `src/config/zod-schema.ts` |
| **Secret scanning** | detect-secrets pre-commit | CI pipeline |
| **Container security** | Non-root user (node:1000) | `Dockerfile` |

### Security Audit System

| Check | Severity | Evidence |
|-------|----------|----------|
| Gateway binding configuration | Critical | `src/security/audit.ts` |
| Filesystem permissions (state dir) | Critical | `src/security/audit.ts` |
| Discord bot permissions | Warning | `src/security/audit.ts` |
| Slack OAuth scopes | Warning | `src/security/audit.ts` |
| Telegram bot settings | Warning | `src/security/audit.ts` |
| Tailscale funnel exposure | Warning | `src/security/audit.ts` |
| Elevated exec allowlist | Critical | `src/security/audit.ts` |
| Browser remote CDP | Critical | `src/security/audit.ts` |

### Security Gaps Identified

| Gap | Risk | Current State |
|-----|------|---------------|
| No rate limiting | DoS vulnerability | No built-in protection |
| In-memory exec approvals | Lost on restart | `ExecApprovalManager` Map |
| No circuit breaker | Cascade failures | Missing pattern |
| Limited audit logging | Forensics gap | Console logs only |
| No secrets rotation | Key compromise risk | Manual rotation |

### Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GDPR | Partial | User data in local SQLite, no export/delete automation |
| SOC2 | Not assessed | Self-hosted, no formal audit |
| HIPAA | Not compliant | No PHI handling certification |
| PCI-DSS | N/A | No payment processing |

---

*Part 2 of 3 - Sections 9-16 Complete*

---

## 17. Migration / Expansion Paths (Legacy Analysis)

### Current Constraints

| Constraint | Impact | Evidence |
|------------|--------|----------|
| TypeScript monolith | No incremental language migration | Single `dist/main.mjs` bundle |
| Circular dependencies | 10-component cycle blocks modular extraction | `config` ↔ `commands/models` ↔ `ui/views` |
| In-memory state | Exec approvals lost on restart | `ExecApprovalManager` Map storage |
| SQLite embedded | Single-file DB limits horizontal scaling | `src/memory/manager.ts` |
| 28 channel integrations | Each requires migration testing | `extensions/` plugins |
| Constructor DI | Pattern must translate to Python | `Deps` interface pattern |

### Potential Migration Paths

| Path | Effort | Risk | Rationale |
|------|--------|------|-----------|
| **Hybrid/Strangler Fig** | High | Medium | Gradual replacement, coexistence during transition (68% confidence) |
| Greenfield Rewrite | Very High | High | Clean architecture but loses institutional knowledge (60% confidence) |
| Inline Upgrade | Very High | Very High | TypeScript → Python in-place nearly impossible (56% confidence) |

### Migration Recommendations

Based on validation scoring (overall complexity: 5.35/10, HIGH rating):

1. **Strangler Fig Pattern**: Wrap legacy components with Python adapters
2. **Gateway-first**: Migrate WebSocket gateway to Python/FastAPI first
3. **Channel-by-channel**: Migrate adapters incrementally with parallel operation
4. **Data layer last**: SQLite schema changes after code migration

---

## 18. Risks & Decisions (Technical)

### Technical Risks

| Risk | Severity | Evidence | Mitigation |
|------|----------|----------|------------|
| Circular dependencies | High | 10-component cycle in codebase | Refactor before migration |
| In-memory exec approvals | High | `ExecApprovalManager` state lost | Persist to SQLite |
| No rate limiting | High | Missing DoS protection | Add rate limiting in target |
| Missing circuit breaker | Medium | No external API isolation | Implement in target |
| 200K+ LOC codebase | High | 74286 symbols indexed | Phased migration approach |
| 28 channel integrations | High | Each needs migration testing | Automated adapter testing |
| Test coverage gap | Medium | 70% vs 80% target | Increase before migration |

### Security Risks (Legacy)

| Risk | Severity | Evidence | Mitigation |
|------|----------|----------|------------|
| Console-only audit logs | Medium | No persistent audit trail | Add structured audit logging |
| Manual secret rotation | Medium | No automated rotation | Implement vault integration |
| Limited compliance | Low | No GDPR automation | Add data export/delete API |

### Architecture Decisions (Historical)

| Decision | Rationale | Evidence | Impact |
|----------|-----------|----------|--------|
| TypeScript over JavaScript | Type safety for large codebase | `tsconfig.json` strict mode | Positive: maintainability |
| SQLite over PostgreSQL | Zero-config, embedded simplicity | Single file deployment | Positive: simplicity; Negative: scaling |
| WebSocket gateway | Real-time control plane needed | `src/gateway/client.ts` | Positive: responsive UI |
| Plugin architecture | Extensible channel support | `extensions/` directory | Positive: modularity |
| Constructor DI | Testable service composition | `Deps` interface pattern | Positive: testability |
| Monolith deployment | Rapid initial development | Single Docker container | Negative: scaling limitations |

---

## 19. Requirements -> Code -> Tests Traceability

| Requirement | Code Location | Test Coverage | Status |
|-------------|---------------|---------------|--------|
| FR-CRIT-001: Multi-channel messaging | `extensions/*/` (28 adapters) | Per-channel tests | Covered |
| FR-CRIT-002: AI inference | Agent runtime + providers | Unit + integration | Covered |
| FR-CRIT-003: Context-aware responses | `src/memory/manager.ts` | Memory search tests | Covered |
| FR-CRIT-004: Gateway control | `src/gateway/client.ts` | Gateway tests | Covered |
| FR-HIGH-001: Authentication | `src/gateway/auth.ts` | Auth tests | Covered |
| FR-HIGH-002: Exec approval | `src/gateway/exec-approval-manager.ts` | Approval tests | Covered |
| FR-HIGH-003: Voice calls | `extensions/voice-call/` | Voice tests | Partial |
| FR-HIGH-004: Cron scheduling | `src/cron/service.ts` | Cron tests | Covered |
| FR-MED-001: TUI interface | `src/tui/components/` | Component tests | Partial |
| FR-MED-002: Web UI | `ui/src/ui/views/` | UI tests | Partial |
| NFR-PERF-001: Response time <100ms | Gateway WebSocket | Load tests | Gap |
| NFR-SEC-001: SSRF protection | `src/infra/net/ssrf.ts` | SSRF tests | Covered |
| NFR-SEC-002: Timing-safe auth | `src/gateway/auth.ts` | Security tests | Covered |

### Coverage Summary

| Category | Covered | Gap | Total |
|----------|---------|-----|-------|
| Critical Requirements | 4 | 0 | 4 |
| High Priority | 4 | 0 | 4 |
| Medium Priority | 1 | 2 | 3 |
| NFRs | 2 | 1 | 3 |
| **Total** | **11** | **3** | **14** |

---

## 20. Architecture Decision Records (Legacy)

### ADR-001: TypeScript Monolith Architecture

**Status**: Implemented (Legacy)
**Context**: Needed rapid development of multi-channel AI messaging assistant with type safety.
**Decision**: Build as TypeScript monolith with plugin system for channels.
**Consequences**:
- Positive: Fast iteration, type safety, single deployment
- Negative: Circular dependencies emerged, scaling limited
**Evidence**: `package.json`, `tsconfig.json`, `dist/main.mjs`

### ADR-002: SQLite with Vector Extensions

**Status**: Implemented (Legacy)
**Context**: Needed embedded database with vector search for RAG capabilities.
**Decision**: Use SQLite with sqlite-vec extension and FTS5 for hybrid search.
**Consequences**:
- Positive: Zero-config, fast reads, hybrid search works well
- Negative: Single-file limits concurrent writes, no horizontal scaling
**Evidence**: `src/memory/manager.ts`, sqlite-vec dependency

### ADR-003: WebSocket Gateway Protocol

**Status**: Implemented (Legacy)
**Context**: Needed real-time control plane for TUI/UI to communicate with backend.
**Decision**: Custom WebSocket protocol with JSON-RPC 2.0 semantics.
**Consequences**:
- Positive: Low latency, bi-directional, event streaming
- Negative: Custom protocol requires documentation, not REST
**Evidence**: `src/gateway/client.ts`, port 18789

### ADR-004: Multi-Mode Authentication

**Status**: Implemented (Legacy)
**Context**: Users need flexible authentication options for different deployment scenarios.
**Decision**: Support Token, Password, Tailscale identity, and Device signature authentication.
**Consequences**:
- Positive: Flexible deployment, secure options
- Negative: Complex auth flow, multiple code paths
**Evidence**: `src/gateway/auth.ts`, timing-safe comparison

### ADR-005: Channel Plugin Architecture

**Status**: Implemented (Legacy)
**Context**: Need to support 28+ messaging platforms with consistent interface.
**Decision**: Plugin-based channel adapters in `extensions/` directory with manifest files.
**Consequences**:
- Positive: Easy to add new channels, isolated code per platform
- Negative: Dependency management across plugins, testing complexity
**Evidence**: `extensions/*/clawdbot.plugin.json`

### ADR-006: Human-in-the-Loop Exec Approval

**Status**: Implemented (Legacy)
**Context**: Security requirement to gate command execution with human approval.
**Decision**: Promise-based approval workflow with Discord button integration.
**Consequences**:
- Positive: Security gate prevents unauthorized execution
- Negative: In-memory state lost on restart, timeout handling complexity
**Evidence**: `src/gateway/exec-approval-manager.ts`, `src/discord/monitor/exec-approvals.ts`

---

## 21. Infrastructure (Current State)

### Current Infrastructure

| Component | Technology | Purpose | Evidence |
|-----------|------------|---------|----------|
| **Compute** | Docker container | Application runtime | `Dockerfile` |
| **Base Image** | node:22-bookworm | Node.js 22 runtime | `Dockerfile` FROM |
| **Storage** | Docker volume | State persistence | `docker-compose.yml` volumes |
| **Database** | SQLite file | Embedded data storage | Local file in state/ |
| **Network** | Host network | Port exposure | Ports 18789, 18790 |
| **CI/CD** | GitHub Actions | Automated pipeline | `.github/workflows/ci.yml` |
| **Registry** | GitHub Container Registry | Image storage | CI workflow |

### Infrastructure Diagram

```mermaid
graph TB
    subgraph CI["GitHub Actions CI"]
        LINT["Lint (oxlint)"]
        TEST["Test (vitest)"]
        BUILD["Build (rolldown)"]
        SECRETS["Secrets Scan"]
        PUBLISH["Publish Image"]

        LINT --> TEST
        TEST --> BUILD
        BUILD --> SECRETS
        SECRETS --> PUBLISH
    end

    subgraph Host["Docker Host"]
        subgraph Container["Moltbot Container"]
            NODE["Node.js 22"]
            APP["dist/main.mjs"]
        end

        subgraph Volumes["Docker Volumes"]
            STATE["state/"]
            CONFIG["config/"]
        end

        Volumes --> Container
    end

    subgraph External["External Services"]
        AI["AI APIs"]
        VOICE["Voice Providers"]
        CHANNELS["28 Channel Platforms"]
    end

    PUBLISH --> Host
    Container --> External

    GATEWAY["Port 18789"] --> Container
    BRIDGE["Port 18790"] --> Container
```

### Resource Requirements (Observed)

| Resource | Minimum | Recommended | Evidence |
|----------|---------|-------------|----------|
| CPU | 1 core | 2+ cores | Node.js single-threaded + async |
| Memory | 512MB | 1GB+ | Depends on channel count |
| Disk | 1GB | 10GB+ | SQLite + vector embeddings |
| Network | Standard | Low latency | WebSocket real-time |

---

## 22. CI/CD Pipeline (Current)

### Pipeline Stages

| Stage | Tool | Purpose | Evidence |
|-------|------|---------|----------|
| Checkout | actions/checkout | Clone repository | `.github/workflows/ci.yml` |
| Setup | actions/setup-node | Install Node.js 22 | Setup job |
| Install | pnpm install | Install dependencies | install-check job |
| Lint | oxlint | Code quality | lint job |
| Test | vitest | Unit/integration tests | test job |
| Build | rolldown | Bundle generation | build job |
| Protocol | Custom | Protocol validation | protocol job |
| Format | Prettier | Code formatting | format job |
| Secrets | detect-secrets | Secret scanning | secrets job |
| macOS | Swift | Native macOS build | macos-app job |
| Android | Gradle | Android build | android job |

### Pipeline Diagram

```mermaid
flowchart LR
    subgraph Trigger["Trigger"]
        PUSH["Push"]
        PR["Pull Request"]
    end

    subgraph Setup["Setup"]
        CHECKOUT["Checkout"]
        NODE["Setup Node 22"]
        PNPM["Setup pnpm"]
    end

    subgraph Quality["Quality Gates"]
        INSTALL["Install Check"]
        LINT["Lint (oxlint)"]
        FORMAT["Format Check"]
        SECRETS["Secret Scan"]
    end

    subgraph Test["Testing"]
        UNIT["Unit Tests"]
        INTEGRATION["Integration Tests"]
        COVERAGE["Coverage (70%)"]
    end

    subgraph Build["Build"]
        BUNDLE["Bundle (rolldown)"]
        PROTOCOL["Protocol Check"]
    end

    subgraph Native["Native Apps"]
        MACOS["macOS (Swift)"]
        ANDROID["Android (Gradle)"]
    end

    PUSH --> CHECKOUT
    PR --> CHECKOUT
    CHECKOUT --> NODE
    NODE --> PNPM
    PNPM --> INSTALL

    INSTALL --> LINT
    INSTALL --> FORMAT
    INSTALL --> SECRETS

    LINT --> UNIT
    FORMAT --> UNIT
    SECRETS --> UNIT

    UNIT --> INTEGRATION
    INTEGRATION --> COVERAGE
    COVERAGE --> BUNDLE
    BUNDLE --> PROTOCOL

    PROTOCOL --> MACOS
    PROTOCOL --> ANDROID
```

### Quality Gates

| Gate | Threshold | Current | Status |
|------|-----------|---------|--------|
| Lint | 0 errors | 0 | Pass |
| Test | All pass | 100% | Pass |
| Coverage | 70% | 70% | Pass |
| Secrets | 0 detected | 0 | Pass |
| Build | Success | Success | Pass |

---

## 23. Open Questions & Next Steps

### Open Questions

1. **Migration Strategy**: Should we migrate gateway first or channels first?
2. **Circular Dependencies**: How to refactor 10-component cycle before migration?
3. **State Persistence**: Move exec approvals to SQLite or Redis?
4. **Test Coverage**: Increase to 80% before or during migration?
5. **Channel Priority**: Which of 28 channels to migrate first?
6. **Python Framework**: FastAPI confirmed, but async patterns for WebSocket?

### Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Migration pattern | Strangler Fig vs Greenfield | Strangler Fig (68% confidence) |
| First component | Gateway vs Channels | Gateway (enables parallel development) |
| Python DI framework | None vs dependency-injector | dependency-injector or simple DI |
| Observability | Add during migration | OpenTelemetry from start |

### Next Steps

1. **Review**: Technical stakeholders review this specification
2. **Generate**: `technical-spec-target.md` for Python 3.12+ target
3. **Plan**: Migration roadmap based on both specifications
4. **Prototype**: Gateway adapter proof-of-concept
5. **Test**: Increase coverage to 80% before major changes

---

## Appendices

### A. File Reference Index

| Section | Key Files |
|---------|-----------|
| Architecture | `package.json`, `tsconfig.json`, `Dockerfile` |
| Gateway | `src/gateway/client.ts`, `src/gateway/auth.ts` |
| Security | `src/infra/net/ssrf.ts`, `src/security/audit.ts` |
| Memory | `src/memory/manager.ts` |
| Channels | `extensions/*/clawdbot.plugin.json` |
| Voice | `extensions/voice-call/src/manager.ts` |
| Config | `src/config/zod-schema.ts` |
| CI/CD | `.github/workflows/ci.yml` |

### B. Glossary

| Term | Definition |
|------|------------|
| Gateway | WebSocket control plane server |
| Exec Approval | Human-in-the-loop command gating |
| SSRF | Server-Side Request Forgery |
| sqlite-vec | SQLite vector extension for embeddings |
| FTS5 | SQLite Full-Text Search version 5 |
| Strangler Fig | Gradual migration pattern |
| ADR | Architecture Decision Record |

---

*Part 3 of 3 - Sections 17-23 Complete*

*Technical Specification - Legacy System Complete (23 Sections)*
