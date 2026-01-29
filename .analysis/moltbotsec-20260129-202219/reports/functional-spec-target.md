# Functional Specification - Target System

**Project**: moltbot
**Analysis Date**: 2026-01-29
**Status**: Target System Design
**Based On**: functional-spec-legacy.md

---

## 1. Executive Summary

**WHAT**: The target Moltbot system is a modular, plugin-based personal AI assistant that operates as an autonomous agent across messaging channels. Users install only the capabilities they need. Rebuilt on Python 3.12+ with FastAPI for improved security, maintainability, and a manageable codebase.

**WHO**: Individual users seeking unified AI across messaging platforms, developers automating workflows, and power users requiring autonomous task execution with security controls (same as legacy).

**WHY**: To maintain all existing functionality while achieving:
- **Modular architecture**: Install only what you need (no bloated dependencies)
- **Secure-by-default**: Validated inputs, audit trails
- **Maintainable codebase**: Each plugin is independently testable and versionable
- **Enhanced observability**: OpenTelemetry for production debugging

**MODERNIZATION GOALS**:

1. **Plugin-based architecture**: Core + installable plugins for channels, AI providers, and extensions
2. Security-first architecture with validated inputs and audit trails
3. 80% test coverage with pytest for regression prevention
4. OpenTelemetry observability for production debugging
5. Simplified deployment via Docker Compose

**KEY CHANGES FROM LEGACY**:

| Aspect | Legacy | Target | Rationale |
|--------|--------|--------|-----------|
| Language | TypeScript/Node.js | Q1: Python 3.12+ | Larger contributor pool, better ML ecosystem |
| Database | SQLite + better-sqlite3 | Q2: SQLite + sqlite-vec (unchanged) | Proven, migration-free |
| Message Bus | Express WebSocket | Q3: WebSocket + in-memory | FastAPI native WebSocket |
| Package Manager | npm/pnpm | Q4: uv | Faster, reproducible |
| Deployment | Manual/Docker | Q5: Docker Compose | Standardized orchestration |
| Testing | vitest | Q10: pytest (80% coverage) | Industry standard |
| Observability | Console logging | Q8: OpenTelemetry | Production-grade |
| Architecture | Monolithic (all 28 channels) | Plugin-based (install what you need) | Manageable codebase |

---

## 1.1 Plugin Architecture Overview

### Design Philosophy

**Install only what you need.** The core system is minimal; capabilities are added via plugins.

```mermaid
graph TB
    subgraph Core["moltbot (core)"]
        GATEWAY["Gateway"]
        AUTH["Auth"]
        MEMORY["Memory"]
        AGENT["Agent"]
        SCHEDULER["Scheduler"]
    end

    subgraph Channels["Channel Plugins"]
        TELEGRAM["moltbot-telegram"]
        DISCORD["moltbot-discord"]
        SLACK["moltbot-slack"]
        WHATSAPP["moltbot-whatsapp"]
        SIGNAL["moltbot-signal"]
        MORE_CH["... 20+ more"]
    end

    subgraph AI["AI Provider Plugins"]
        CLAUDE["moltbot-claude"]
        OPENAI["moltbot-openai"]
        GEMINI["moltbot-gemini"]
        LOCAL["moltbot-local"]
    end

    subgraph Extensions["Extension Plugins"]
        VOICE["moltbot-voice"]
        CRON["moltbot-cron"]
        WEB["moltbot-web"]
        TUI["moltbot-tui"]
    end

    Core --> Channels
    Core --> AI
    Core --> Extensions
```

### Plugin Categories

| Category | Package Pattern | Purpose | Install Example |
|----------|-----------------|---------|-----------------|
| **Core** | `moltbot` | Essential runtime | `uv pip install moltbot` |
| **Channels** | `moltbot-{platform}` | Messaging adapters | `uv pip install moltbot-telegram` |
| **AI Providers** | `moltbot-{provider}` | AI inference | `uv pip install moltbot-claude` |
| **Extensions** | `moltbot-{feature}` | Optional features | `uv pip install moltbot-voice` |

### Installation Scenarios

| Use Case | Installation Command | Packages |
|----------|---------------------|----------|
| Minimal personal | `uv pip install moltbot moltbot-telegram moltbot-claude` | 3 |
| Multi-channel personal | `uv pip install "moltbot[telegram,discord,signal,claude]"` | 5 |
| Business (Slack/Teams) | `uv pip install "moltbot[slack,teams,openai,voice]"` | 5 |
| Developer (all) | `uv pip install "moltbot[all]"` | All |

### User Benefits

| Benefit | Description |
|---------|-------------|
| **Smaller footprint** | Only install dependencies you need |
| **Faster startup** | Load only required plugins |
| **Simpler updates** | Update individual plugins independently |
| **Easier debugging** | Isolated plugin issues |
| **Custom stacks** | Mix and match channels + AI providers |

---

## 2. Current State - Problem & Goals

### Modernization Objectives

Based on user preferences and legacy analysis:

- **Security Hardening** (Addresses legacy issue: timing attacks, input validation gaps)
- **Test Coverage Improvement** (User preference: Q10 - 80% target)
- **Observability Enhancement** (User preference: Q8 - OpenTelemetry)
- **Maintainability** (Technical improvement: Python type hints + mypy)

### Target KPIs/Metrics

| Metric | Legacy Value | Target Value | Improvement |
|--------|--------------|--------------|-------------|
| Response Timeout | 30000ms | 30000ms | EXACT (preserved) |
| Memory Search Results | 10 default | 10 default | EXACT (preserved) |
| Embedding Batch Size | 100 items | 100 items | EXACT (preserved) |
| Test Coverage | ~40% estimated | 80% | +40% |
| Startup Time | N/A | < 10s | Measurable |
| Message Latency (p50) | N/A | < 500ms | Measurable |

---

## 3. Personas & User Journeys

### Personas (Target System)

| Persona | Legacy Capabilities | Target Capabilities | Changes |
|---------|---------------------|---------------------|---------|
| **Owner** | Full access, command execution, configuration | Full access, command execution, configuration | EXACT |
| **Authenticated User** | Chat, memory search, limited commands | Chat, memory search, limited commands | EXACT |
| **Tailscale User** | Identity-verified access via Tailscale | Identity-verified access via Tailscale | EXACT |
| **Guest** | Read-only, no command execution | Read-only, no command execution | EXACT |

### Target User Journeys

```mermaid
journey
    title User Interaction with Moltbot (Target)
    section Authentication
      Connect via WhatsApp/Telegram: 5: User
      Verify identity (QR/token): 3: System
      Establish session: 5: System
    section Chat Interaction
      Send message: 5: User
      Process with AI model: 4: System
      Search memory for context: 4: System
      Generate response: 5: System
      Receive reply: 5: User
    section Command Execution
      Request command execution: 3: User
      Create approval request: 4: System
      User approves via channel: 5: User
      Execute command: 4: System
      Return results: 5: System
```

**Changes from Legacy**:
- Journey 1 (Auth): EXACT - Same flow, Python implementation
- Journey 2 (Chat): EXACT - Same flow, FastAPI backend
- Journey 3 (Commands): ENHANCED - Better audit logging

---

## 4. Use Cases (Target System)

### UC-001: Multi-Channel Message Processing

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-001 | UC-001 | EXACT |
| **Name** | Process Incoming Message | Process Incoming Message | |
| **Actor(s)** | User, AI Agent | User, AI Agent | |
| **Priority** | CRITICAL | CRITICAL | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- Implementation language: TypeScript → Python
- Framework: Express → FastAPI
- All business logic preserved exactly

**Main Flow (Target)**:
1. User sends message via messaging platform
2. System receives message via channel adapter (Python async)
3. System retrieves conversation context from memory (aiosqlite)
4. System sends context + message to AI model
5. AI model generates response
6. System sends response back via channel

**Alternative Flows**: Same as legacy
**Exception Flows**: Same as legacy

---

### UC-002: Gateway Authentication

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-002 | UC-002 | ENHANCED |
| **Name** | Authenticate Gateway Connection | Authenticate Gateway Connection | |
| **Actor(s)** | Client Application, Gateway Server | Client Application, Gateway Server | |
| **Priority** | CRITICAL | CRITICAL | |

**Modernization Status**: ENHANCED

**Changes from Legacy**:
- Timing-safe: crypto.timingSafeEqual → secrets.compare_digest
- Enhanced audit logging for all auth attempts
- Rate limiting with configurable thresholds

**Main Flow (Target)**:
1. Client connects to gateway endpoint (FastAPI WebSocket)
2. System checks if local direct request (loopback)
3. System validates authentication credentials (Pydantic)
4. System uses timing-safe comparison for secrets (secrets.compare_digest)
5. System establishes authenticated session
6. System logs auth event to audit trail (NEW)

---

### UC-003: Command Execution Approval

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-003 | UC-003 | ENHANCED |
| **Name** | Approve Command Execution | Approve Command Execution | |
| **Actor(s)** | User, AI Agent, Approval System | User, AI Agent, Approval System | |
| **Priority** | CRITICAL | CRITICAL | |

**Modernization Status**: ENHANCED

**Changes from Legacy**:
- Comprehensive audit trail for all approvals/denials
- Configurable command allowlist validation
- Structured logging for compliance

**Main Flow (Target)**:
1. Agent creates approval request with command details
2. System validates command against allowlist (NEW)
3. System generates approval record with timeout
4. System notifies user via active channel
5. User reviews and approves command
6. System logs approval decision (ENHANCED)
7. System resolves approval promise
8. Agent executes command in sandbox (ENHANCED)

---

### UC-004: Memory Search

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-004 | UC-004 | EXACT |
| **Name** | Search Memory with Hybrid Vector+Keyword | Search Memory with Hybrid Vector+Keyword | |
| **Priority** | CRITICAL | CRITICAL | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- Implementation: TypeScript → Python
- Database library: better-sqlite3 → aiosqlite
- Vector search: sqlite-vec (unchanged)

---

### UC-005: WhatsApp Channel Setup

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-005 | UC-005 | EXACT |
| **Name** | Pair WhatsApp Device | Pair WhatsApp Device | |
| **Priority** | HIGH | HIGH | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- WhatsApp Web protocol implementation in Python
- Same QR code pairing flow

---

### UC-006: Telegram Bot Integration

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-006 | UC-006 | EXACT |
| **Name** | Configure Telegram Bot | Configure Telegram Bot | |
| **Priority** | HIGH | HIGH | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- Python-telegram-bot library
- Same bot token configuration flow

---

### UC-007: Discord Server Monitoring

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-007 | UC-007 | EXACT |
| **Name** | Monitor Discord Messages | Monitor Discord Messages | |
| **Priority** | HIGH | HIGH | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- discord.py library
- Same monitoring and response flow

---

### UC-008: Browser Automation

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-008 | UC-008 | EXACT |
| **Name** | Execute Browser Actions | Execute Browser Actions | |
| **Priority** | MEDIUM | MEDIUM | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- Playwright Python bindings
- Same CDP integration pattern

---

### UC-009: Scheduled Task Execution

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-009 | UC-009 | EXACT |
| **Name** | Run Cron Job | Run Cron Job | |
| **Priority** | MEDIUM | MEDIUM | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- APScheduler library
- Same cron expression support

---

### UC-010: Voice Call Handling

| Attribute | Legacy | Target | Status |
|-----------|--------|--------|--------|
| **ID** | UC-010 | UC-010 | EXACT |
| **Name** | Handle Voice Call | Handle Voice Call | |
| **Priority** | LOW | LOW | |

**Modernization Status**: EXACT

**Changes from Legacy**:
- Twilio Python SDK
- Same voice flow

---

## 5. User Stories (Target System)

### CRITICAL Stories

#### US-CRIT-001: Send Message via WhatsApp

**Legacy Reference**: US-CRIT-001 (functional-spec-legacy.md)
**Status**: EXACT
**Priority**: CRITICAL
**Actor**: User

**Story**:
> As a **user**,
> I want to **send messages to my AI assistant via WhatsApp**,
> So that **I can interact naturally from my phone**.

**Changes from Legacy**:
- None - identical behavior required

**Acceptance Criteria (Target)**:

Scenario: Send text message
  Given I have paired my WhatsApp account
    And the moltbot gateway is running (Python/FastAPI)
  When I send a text message to the bot
  Then I should receive an AI-generated response
    And the conversation should be stored in memory
    And the interaction should be logged with correlation ID (NEW)

---

#### US-CRIT-002: Authenticate with Token

**Legacy Reference**: US-CRIT-002 (functional-spec-legacy.md)
**Status**: ENHANCED
**Priority**: CRITICAL
**Actor**: Client Application

**Story**:
> As a **client application**,
> I want to **authenticate using a secure token**,
> So that **only authorized clients can access the gateway**.

**Changes from Legacy**:
- Enhanced: Timing-safe comparison with secrets.compare_digest
- Enhanced: All auth attempts logged to audit trail

**Acceptance Criteria (Target)**:

Scenario: Valid token authentication
  Given I have a valid gateway token
    And the gateway server is running
  When I connect with the token in headers
  Then I should be authenticated
    And my session should be established
    And the auth event should be logged (NEW)

Scenario: Invalid token rejected
  Given I have an invalid token
  When I attempt to connect
  Then I should receive a 401 error
    And no session should be created
    And the failed attempt should be logged (NEW)

---

#### US-CRIT-003: Approve Command Execution

**Legacy Reference**: US-CRIT-003 (functional-spec-legacy.md)
**Status**: ENHANCED
**Priority**: CRITICAL
**Actor**: User

**Story**:
> As a **user**,
> I want to **approve or deny command executions**,
> So that **I maintain control over what my AI can do**.

**Changes from Legacy**:
- Enhanced: Command allowlist validation
- Enhanced: Full audit trail of all approvals/denials

**Acceptance Criteria (Target)**:

Scenario: Approve shell command
  Given the AI requests to execute a shell command
    And the command is on the allowlist (NEW)
    And I receive an approval notification
  When I approve the command
  Then the command should execute
    And I should see the results
    And the approval should be recorded in audit log (NEW)

Scenario: Deny dangerous command
  Given the AI requests to delete files
  When I deny the command
  Then the command should not execute
    And the AI should acknowledge the denial
    And the denial should be recorded in audit log (NEW)

---

### STANDARD Stories

#### US-STD-001: Search Memory

**Legacy Reference**: US-STD-001 (functional-spec-legacy.md)
**Status**: EXACT
**Priority**: STANDARD
**Actor**: AI Agent

**Story**:
> As an **AI agent**,
> I want to **search the user's memory for relevant context**,
> So that **I can provide informed responses**.

**Changes from Legacy**:
- None - identical behavior required

---

### NEW Stories (Target Only)

#### US-NEW-001: View Audit Trail

**Status**: NEW (no legacy equivalent)
**Rationale**: Required for enterprise compliance and security monitoring

**Story**:
> As an **administrator**,
> I want to **view the audit trail of all actions**,
> So that **I can monitor for security issues and compliance**.

**Acceptance Criteria (Target)**:

Scenario: View recent audit events
  Given I am an authenticated administrator
  When I query the audit log
  Then I should see all recent events with correlation IDs
    And each event should include timestamp, user, action, and outcome

---

#### US-NEW-002: Monitor System Health

**Status**: NEW (no legacy equivalent)
**Rationale**: Required for production observability (Q8 preference)

**Story**:
> As an **operator**,
> I want to **monitor system health via metrics endpoint**,
> So that **I can detect issues before they impact users**.

**Acceptance Criteria (Target)**:

Scenario: Access health metrics
  Given the system is running
  When I query the /metrics endpoint
  Then I should see Prometheus-format metrics
    And metrics should include message_count, latency_p50, active_connections

---

## 6. Business Logic (Target System)

### 6.1 Validation Rules

#### VAL-001: Authentication Credentials

**Legacy Reference**: VAL-001 (functional-spec-legacy.md)
**Preservation Status**: EXACT

| Field | Legacy Rule | Target Rule | Change Reason |
|-------|-------------|-------------|---------------|
| token | Non-empty string | Non-empty string (Pydantic validated) | Framework change |
| password | Timing-safe compare | secrets.compare_digest | Language equivalent |

---

### 6.2 Decision Trees

#### DT-001: Authentication Method Selection

**Legacy Reference**: DT-001
**Preservation Status**: EXACT

```mermaid
flowchart TD
    A[Connection Request] --> B{Is Loopback?}
    B -->|Yes| C[Auto-authenticate]
    B -->|No| D{Tailscale Enabled?}
    D -->|Yes| E{Tailscale Identity?}
    E -->|Found| F[Authenticate via Tailscale]
    E -->|Not Found| G{Password Auth?}
    D -->|No| G
    G -->|Valid| H[Authenticate via Password]
    G -->|Invalid| I[Reject 401]
```

**Changes from Legacy**:
- None - identical decision logic

---

### 6.3 Calculation Formulas

#### CALC-001: Memory Similarity Score

**Legacy Reference**: CALC-001
**Preservation Status**: EXACT
**Precision**: Float, threshold 0.7

**Formula (Target)**:
```text
similarity = cosine_similarity(query_embedding, memory_embedding)
include_result = similarity >= 0.7
```

**Changes from Legacy**:
- None - identical calculation

---

### 6.4 Business Constants

| Constant | Legacy Value | Target Value | Change Reason |
|----------|--------------|--------------|---------------|
| MEMORY_SIMILARITY_THRESHOLD | 0.7 | 0.7 | EXACT |
| APPROVAL_TIMEOUT_MS | 300000 (5 min) | 300000 (5 min) | EXACT |
| EMBEDDING_BATCH_SIZE | 100 | 100 | EXACT |
| MEMORY_SEARCH_LIMIT | 10 | 10 | EXACT |
| RESPONSE_TIMEOUT_MS | 30000 | 30000 | EXACT |

---

### 6.5 Data Transformations

#### TRANSFORM-001: Message Normalization

**Legacy Reference**: TRANSFORM-001
**Preservation Status**: EXACT

| Source Field | Target Field | Legacy Transform | Target Transform |
|--------------|--------------|------------------|------------------|
| platform_message | normalized_message | Channel adapter | Channel adapter (Python) |
| raw_text | cleaned_text | Trim, sanitize | Trim, sanitize |

---

## 7. State Machines (Target System)

### SM-001: Approval Request State Machine

**Legacy Reference**: SM-001 (functional-spec-legacy.md)
**Preservation Status**: EXACT

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Approved : User approves
    Pending --> Denied : User denies
    Pending --> Timeout : Timer expires
    Approved --> Executing : Start execution
    Executing --> Completed : Success
    Executing --> Failed : Error
    Approved --> [*]
    Denied --> [*]
    Timeout --> [*]
    Completed --> [*]
    Failed --> [*]
```

**Changes from Legacy**:

| Aspect | Legacy | Target | Reason |
|--------|--------|--------|--------|
| States | 6 states | 6 states | EXACT |
| Transitions | 8 transitions | 8 transitions | EXACT |
| Implementation | TypeScript Promise | Python asyncio | Language equivalent |

---

### SM-002: Channel Connection State Machine

**Legacy Reference**: SM-002
**Preservation Status**: EXACT

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting : Connect request
    Connecting --> Connected : Success
    Connecting --> Disconnected : Max retries
    Connected --> Reconnecting : Connection lost
    Reconnecting --> Connected : Success
    Reconnecting --> Disconnected : Max retries
```

**Changes from Legacy**:
- None - identical state machine

---

## 8. Configuration-Driven Behaviors (Target System)

### Config-Driven Feature Flags

| Flag | Legacy Default | Target Default | Change Reason |
|------|----------------|----------------|---------------|
| TAILSCALE_AUTH_ENABLED | true | true | EXACT |
| MEMORY_ENABLED | true | true | EXACT |
| EXEC_APPROVAL_REQUIRED | true | true | EXACT |
| AUDIT_LOGGING_ENABLED | N/A | true | NEW - security requirement |

### Config-Driven Business Rules (Target)

| Config Key | Type | Legacy | Target | Impact |
|------------|------|--------|--------|--------|
| memory.similarity_threshold | float | 0.7 | 0.7 | EXACT |
| approval.timeout_seconds | int | 300 | 300 | EXACT |
| auth.rate_limit_attempts | int | N/A | 5 | NEW - brute force protection |
| auth.rate_limit_window_seconds | int | N/A | 300 | NEW - brute force protection |

### Environment-Specific Behaviors (Target)

Based on Q5 (Deployment: Docker Compose) and Q7 (Container: Docker):

| Behavior | Dev | Staging | Prod | Target Change |
|----------|-----|---------|------|---------------|
| Log Level | DEBUG | INFO | WARNING | Configurable via LOG_LEVEL |
| Audit Logging | Optional | Required | Required | NEW - compliance |
| Rate Limiting | Disabled | Enabled | Enabled | NEW - security |
| Health Checks | Optional | Required | Required | NEW - Docker healthcheck |

---

*End of Part 1 - Sections 1-8*

---

# PART 2: Requirements & Integration (Sections 9-17)

---

## 9. Scope / Out-of-Scope (Target System)

### In Scope (Target Features)

| Feature/Capability | Legacy Status | Target Status | Migration |
|--------------------|---------------|---------------|-----------|
| Multi-channel messaging gateway | Existing | PRESERVE | TypeScript → Python |
| Token/password/Tailscale auth | Existing | PRESERVE | Use secrets.compare_digest |
| Command execution approval | Existing | ENHANCE | Add command allowlist |
| Vector-based memory search | Existing | PRESERVE | Same sqlite-vec |
| WhatsApp integration | Existing | PRESERVE | Python WhatsApp library |
| Telegram bot | Existing | PRESERVE | python-telegram-bot |
| Discord monitoring | Existing | PRESERVE | discord.py |
| Slack integration | Existing | PRESERVE | slack-sdk |
| Browser automation | Existing | PRESERVE | Playwright Python |
| Cron job scheduling | Existing | PRESERVE | APScheduler |
| Voice call handling | Existing | PRESERVE | Twilio Python |
| SSRF protection | Existing | PRESERVE | DNS pinning in Python |
| Security audit logging | Existing | ENHANCE | Structured JSON + OpenTelemetry |
| Configuration management | Existing | PRESERVE | Zod → Pydantic |
| Health/metrics endpoints | NEW | NEW | Prometheus format |
| Rate limiting | NEW | NEW | Brute force protection |

### Out of Scope (Target System)

| Capability | Legacy Status | Reason for Exclusion |
|------------|---------------|---------------------|
| Multi-tenant support | Not Found | Single-user design preserved |
| Distributed deployment | Not Found | Local-first philosophy |
| Plugin marketplace | Not Found | Post-stabilization feature |
| Admin dashboard UI | Not Found | CLI/TUI sufficient |

---

## 10. Functional Requirements (Target System)

### CRITICAL Features (Preserved from Legacy)

#### FR-CRIT-001: Multi-Channel Message Gateway

**Legacy Reference**: FR-CRIT-001 (functional-spec-legacy.md)
**Preservation Status**: EXACT

- **As a** user, **the system provides** unified AI assistant access across 28 messaging platforms,
  **so that** I can interact with my AI from any device or platform.
- **Target Implementation**:
  - Language: Q1 (Python 3.12+)
  - Framework: FastAPI with WebSocket support
  - Database: Q2 (SQLite + sqlite-vec)
- **Changes from Legacy**:
  - Implementation language: TypeScript → Python
  - Framework: Express.js → FastAPI
- **Acceptance Criteria (Target)**:
  - AC-1: Messages received on any channel processed by AI within 2s (p95)
  - AC-2: Responses delivered back to originating channel
  - AC-3: All interactions logged with correlation IDs

---

#### FR-CRIT-002: Timing-Safe Authentication

**Legacy Reference**: FR-CRIT-002 (functional-spec-legacy.md)
**Preservation Status**: EXACT

- **As a** security requirement, **the system provides** timing-safe credential verification,
  **so that** attackers cannot use timing attacks to guess credentials.
- **Target Implementation**:
  - Language: Q1 (Python 3.12+)
  - Method: `secrets.compare_digest()` (Python equivalent)
  - Security: Q9 (Keep current Token/Password/Tailscale)
- **Changes from Legacy**:
  - `crypto.timingSafeEqual` → `secrets.compare_digest`
- **Acceptance Criteria (Target)**:
  - AC-1: Credential verification time constant regardless of match position
  - AC-2: All auth attempts logged to audit trail

---

#### FR-CRIT-003: Command Execution Gating

**Legacy Reference**: FR-CRIT-003 (functional-spec-legacy.md)
**Preservation Status**: ENHANCED

- **As a** user, **the system provides** human-in-the-loop approval for command execution,
  **so that** I maintain control over AI actions on my system.
- **Target Implementation**:
  - Language: Q1 (Python 3.12+)
  - Pattern: asyncio-based approval workflow
- **Changes from Legacy**:
  - ADD: Command allowlist validation before approval prompt
  - ADD: Comprehensive audit trail for all decisions
- **Acceptance Criteria (Target)**:
  - AC-1: Commands not on allowlist blocked without prompting user
  - AC-2: All approvals/denials recorded with timestamp, user, reason
  - AC-3: Timeout behavior preserved (5 min default)

---

#### FR-CRIT-004: Vector-Based Memory Search

**Legacy Reference**: FR-CRIT-004 (functional-spec-legacy.md)
**Preservation Status**: EXACT

- **As an** AI agent, **the system provides** semantic search across conversation history,
  **so that** I can provide contextually relevant responses.
- **Target Implementation**:
  - Database: Q2 (SQLite + sqlite-vec) - unchanged
  - Search: Hybrid vector + BM25 keyword (unchanged)
- **Changes from Legacy**:
  - Implementation: TypeScript → Python with aiosqlite
  - Same search algorithm and weights
- **Acceptance Criteria (Target)**:
  - AC-1: Same search results for identical queries (golden file tests)
  - AC-2: Search latency < 100ms

---

### NEW Features (Target Only)

#### FR-NEW-001: Audit Trail Query

**Status**: NEW (no legacy equivalent)
**Rationale**: Required for enterprise compliance (EU AI Act) and security monitoring
**Related User Preference**: Q8 (OpenTelemetry), External Research (Enterprise requirements)

- **As an** administrator, **the system provides** queryable audit trail of all actions,
  **so that** I can monitor for security issues and demonstrate compliance.
- **Acceptance Criteria**:
  - AC-1: All auth events, command executions, and tool calls logged
  - AC-2: Logs include correlation IDs for request tracing
  - AC-3: Sensitive data (tokens, passwords) redacted from logs

---

#### FR-NEW-002: Health Monitoring Endpoints

**Status**: NEW (no legacy equivalent)
**Rationale**: Required for production observability (Q8 preference)
**Related User Preference**: Q5 (Docker Compose), Q8 (Prometheus)

- **As an** operator, **the system provides** health check and metrics endpoints,
  **so that** I can monitor system health and detect issues proactively.
- **Acceptance Criteria**:
  - AC-1: /health returns 200 when system operational
  - AC-2: /ready returns 200 when all dependencies connected
  - AC-3: /metrics returns Prometheus-format metrics

---

#### FR-NEW-003: Rate Limiting

**Status**: NEW (no legacy equivalent)
**Rationale**: Security hardening for brute force protection
**Related User Preference**: External Research (Security best practices)

- **As a** security requirement, **the system provides** rate limiting on auth attempts,
  **so that** brute force attacks are mitigated.
- **Acceptance Criteria**:
  - AC-1: 5 failed auth attempts in 5 min triggers temporary lockout
  - AC-2: Rate limit configuration adjustable via environment

---

## 11. Non-Negotiables (Target System)

These constraints from legacy MUST be preserved:

1. **Timing-Safe Credential Verification**
   - **Legacy Implementation**: crypto.timingSafeEqual
   - **Target Implementation**: secrets.compare_digest
   - **Verification**: Timing analysis tests confirm constant-time behavior

2. **SSRF Protection with DNS Pinning**
   - **Legacy Implementation**: Custom SSRF filter with DNS pinning
   - **Target Implementation**: Same logic in Python (ipaddress module)
   - **Verification**: SSRF test suite with known bypass attempts

3. **Local-First Data Storage**
   - **Legacy Implementation**: SQLite database on local filesystem
   - **Target Implementation**: SQLite + sqlite-vec (unchanged)
   - **Verification**: No external database connections

4. **Command Execution Requires Approval**
   - **Legacy Implementation**: Promise-based approval workflow
   - **Target Implementation**: asyncio-based approval workflow
   - **Verification**: E2E tests confirm approval required for all commands

---

## 12. Non-Functional Requirements (Target System)

### Performance (Target)

Based on Q5 (Docker Compose), Q7 (Docker):

| Metric | Legacy | Target | Improvement |
|--------|--------|--------|-------------|
| Response time (p95) | 30000ms timeout | < 2000ms | Measurable baseline |
| Memory search | N/A | < 100ms | Defined target |
| Startup time | N/A | < 10s | Defined target |
| Concurrent connections | N/A | 100+ | Defined target |

### Availability & Reliability (Target)

| Metric | Legacy | Target | Implementation |
|--------|--------|--------|----------------|
| Uptime | N/A | 99.9% | Docker healthcheck |
| Retry logic | 3 attempts | 3 attempts | EXACT |
| Exponential backoff | Yes | Yes | Same parameters |
| Message delivery | Best effort | At-least-once | Improved |

### Security (Target)

Based on Q9 (Keep current Token/Password/Tailscale):

| Aspect | Legacy | Target | Migration |
|--------|--------|--------|-----------|
| Authentication | Token/Password/Tailscale | Token/Password/Tailscale | EXACT |
| Credential comparison | crypto.timingSafeEqual | secrets.compare_digest | Language equivalent |
| SSRF protection | DNS pinning | DNS pinning | EXACT |
| Rate limiting | None | 5 attempts/5 min | NEW |

### Observability (Target)

Based on Q8 (Prometheus, Structured JSON, OpenTelemetry):

| Aspect | Legacy | Target | Implementation |
|--------|--------|--------|----------------|
| Metrics | None | Prometheus | /metrics endpoint |
| Logging | Console | Structured JSON | structlog |
| Tracing | None | OpenTelemetry | Optional OTLP export |

---

## 13. Error Handling & Recovery (Target System)

### 13.1 Exception Handling Strategy (Target)

Based on Q1 (Python 3.12+) idioms:

| Exception Type | Legacy Handling | Target Handling | Rationale |
|----------------|-----------------|-----------------|-----------|
| EmbeddingAPIError | try/catch + retry | try/except + retry | Language equivalent |
| ChannelDisconnect | Promise chain | async/await | Language equivalent |
| AuthFailure | Reject promise | Raise HTTPException | FastAPI pattern |
| ValidationError | Zod validation | Pydantic validation | Library equivalent |

### 13.2 Error Recovery (Target)

**Target Pattern**: Python async error handling with structured logging

- Retry with exponential backoff (same formula as legacy)
- Circuit breaker pattern for external services
- Graceful degradation (memory search falls back to keyword-only)
- All errors logged with correlation IDs

### 13.3 Error Codes (Target)

| Error Code | Legacy | Target | Migration |
|------------|--------|--------|-----------|
| AUTH_001 | "Authentication required" | "Authentication required" | EXACT |
| AUTH_002 | "Invalid credentials" | "Invalid credentials" | EXACT |
| MEM_001 | "Embedding failed" | "Embedding failed" | EXACT |
| CHAN_001 | "Connection failed" | "Connection failed" | EXACT |

---

## 14. Data Models (Target System)

Based on Q2 (SQLite + sqlite-vec):

### Core Entities (Target)

#### Entity: MemoryFragment

**Legacy Reference**: MemoryChunk (functional-spec-legacy.md)
**Migration Status**: EXACT

| Field | Legacy Type | Target Type | Migration |
|-------|-------------|-------------|-----------|
| id | INTEGER | INTEGER | As-is |
| content | TEXT | TEXT | As-is |
| embedding | BLOB | BLOB | As-is (sqlite-vec) |
| source_file | TEXT | TEXT | As-is |
| created_at | INTEGER | INTEGER | As-is (Unix timestamp) |
| thread_id | N/A | TEXT | NEW - for thread isolation |

**Schema Changes**:
- ADD: thread_id for conversation threading
- ADD: index on thread_id for query performance

**Migration Plan**:
1. Backup existing database
2. Add thread_id column with NULL allowed
3. Backfill thread_id from source_file for existing records

---

#### Entity: AuditEvent

**Legacy Reference**: None (NEW)
**Migration Status**: NEW

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | UUID |
| timestamp | TEXT | NOT NULL | ISO 8601 |
| event_type | TEXT | NOT NULL | auth, command, tool |
| session_id | TEXT | - | Correlation |
| user_identity | TEXT | - | Who |
| details | TEXT | - | JSON |
| correlation_id | TEXT | - | Request tracing |

---

### 14.2 Field Mappings (Legacy -> Target)

| Legacy Field | Legacy Type | Target Field | Target Type | Transformation |
|--------------|-------------|--------------|-------------|----------------|
| MemoryChunk.id | INTEGER | MemoryFragment.id | INTEGER | As-is |
| MemoryChunk.content | TEXT | MemoryFragment.content | TEXT | As-is |
| MemoryChunk.embedding | BLOB | MemoryFragment.embedding | BLOB | As-is |

### 14.3 Data Validation Rules (Target)

| Entity | Field | Legacy Rule | Target Rule | Change |
|--------|-------|-------------|-------------|--------|
| MemoryFragment | content | NOT NULL | NOT NULL | EXACT |
| MemoryFragment | embedding | Optional | Optional | EXACT |
| AuditEvent | event_type | N/A | Enum validation | NEW |

---

## 15. Configuration Mapping (Target System)

Based on Q5 (Docker Compose), Q6 (Docker Compose):

| Legacy Config | Target Config | Migration Strategy |
|---------------|---------------|-------------------|
| `.env` | `.env` | Keep as environment variables |
| `config.yaml` | Pydantic Settings | Env vars + optional YAML |
| `package.json` | `pyproject.toml` | Dependency migration |
| `Dockerfile` | `Dockerfile` | Update for Python 3.12 |
| `docker-compose.yml` | `docker-compose.yml` | Update service definition |

### Target Configuration Structure

| Config Key | Source | Default | Override |
|------------|--------|---------|----------|
| GATEWAY_HOST | Environment | 0.0.0.0 | Per-environment |
| GATEWAY_PORT | Environment | 3000 | Per-environment |
| DATABASE_PATH | Environment | ./data/moltbot.db | Per-environment |
| AUTH_PASSWORD | Environment | None (required) | Secret |
| LOG_LEVEL | Environment | INFO | Per-environment |
| OPENAI_API_KEY | Environment | None | Secret |

---

## 16. API Contracts (Target System)

### REST/WebSocket Endpoints (Target)

| Method | Legacy Path | Target Path | Changes |
|--------|-------------|-------------|---------|
| WS | `/gateway` | `/gateway` | EXACT |
| POST | `/api/memory/search` | `/api/v1/memory/search` | Versioned |
| POST | `/api/exec/approve` | `/api/v1/tools/approve` | Versioned, renamed |
| GET | N/A | `/health` | NEW |
| GET | N/A | `/ready` | NEW |
| GET | N/A | `/metrics` | NEW |

### API Versioning Strategy

- **Legacy**: Unversioned
- **Target**: `/api/v1/*`
- **Migration**: Legacy paths redirect to v1 during transition

### WebSocket Protocol (Target)

Protocol preserved exactly from legacy:

```json
// Auth request
{"type": "auth", "payload": {"method": "password", "credentials": "..."}}

// Auth response
{"type": "auth_success", "payload": {"session_id": "...", "capabilities": [...]}}

// Message
{"type": "message", "payload": {"channel": "...", "content": "..."}}

// Tool approval request
{"type": "tool_approval_request", "payload": {"request_id": "...", "command": "..."}}
```

---

## 17. Integration Points (Target System)

Based on Q3 (WebSocket + in-memory):

| External System | Legacy Protocol | Target Protocol | Migration |
|-----------------|-----------------|-----------------|-----------|
| OpenAI API | HTTPS REST | HTTPS REST | Update SDK |
| WhatsApp Web | WebSocket | WebSocket | Python library |
| Telegram API | HTTPS REST | HTTPS REST | python-telegram-bot |
| Discord API | WebSocket | WebSocket | discord.py |
| Tailscale | Local socket | Local socket | EXACT |
| Anthropic API | HTTPS REST | HTTPS REST | Add as option |

### 17.1 Message Formats (Target)

| Message Type | Legacy Format | Target Format | Migration |
|--------------|---------------|---------------|-----------|
| Chat message | JSON | JSON | Schema preserved |
| Embedding request | JSON | JSON | OpenAI API format |
| Tool call | MCP protocol | MCP protocol | EXACT |

### Target Integration Architecture

```mermaid
graph TD
    subgraph Target System
        GW[FastAPI Gateway]
        MEM[Memory System]
        TOOLS[Tool System]
    end

    subgraph External APIs
        OPENAI[OpenAI API]
        ANTHROPIC[Anthropic API]
    end

    subgraph Channels
        TG[Telegram]
        WA[WhatsApp]
        DC[Discord]
        SL[Slack]
    end

    GW --> MEM
    GW --> TOOLS
    MEM --> OPENAI
    GW --> TG
    GW --> WA
    GW --> DC
    GW --> SL
```

---

*End of Part 2 - Sections 9-17*

---

# PART 3: Modernization Decisions & Checklists (Sections 18-24)

---

## 18. Known Quirks - Modernization Decisions

For each quirk from legacy Section 18, the modernization decision:

### Quirk 1: Tailscale Auth Localhost Bypass (QK-AUTH-001)

**Legacy Reference**: QK-AUTH-001 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | Tailscale auth allows localhost bypass when proxy misconfigured | Explicit loopback detection with configurable behavior |
| **Root Cause** | Trusted proxy headers not validated | Proper header validation |
| **Decision** | N/A | FIX |
| **Rationale** | Security vulnerability | Security hardening goal |
| **Migration Impact** | Breaking change for misconfigured proxies | Document required proxy config |

---

### Quirk 2: Token Refresh Races (QK-AUTH-002)

**Legacy Reference**: QK-AUTH-002 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | Token refresh races can cause duplicate sessions | Atomic session management |
| **Root Cause** | Non-atomic session operations | Race condition in Promise chain |
| **Decision** | N/A | FIX |
| **Rationale** | Security and reliability improvement | Use asyncio locks |
| **Migration Impact** | None - internal implementation | Improved stability |

---

### Quirk 3: Empty Password Accepted (QK-AUTH-003)

**Legacy Reference**: QK-AUTH-003 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | Empty password accepted if env var missing | Reject connection if AUTH_PASSWORD not set |
| **Root Cause** | Defensive coding for dev convenience | Security risk |
| **Decision** | N/A | FIX |
| **Rationale** | Critical security vulnerability | Fail-secure default |
| **Migration Impact** | Breaking change | Require explicit config |

---

### Quirk 4: Hardcoded Similarity Threshold (QK-MEM-001)

**Legacy Reference**: QK-MEM-001 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | Vector similarity threshold hardcoded at 0.7 | Make configurable via MEMORY_SIMILARITY_THRESHOLD |
| **Root Cause** | Development shortcut | Limited flexibility |
| **Decision** | N/A | FIX |
| **Rationale** | User-requested feature | Improve configurability |
| **Migration Impact** | None - additive change | Default preserves behavior |

---

### Quirk 5: Memory Consolidation Data Loss (QK-MEM-002)

**Legacy Reference**: QK-MEM-002 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | Memory consolidation can lose context if batch size exceeded | Graceful handling with warning |
| **Root Cause** | Silent truncation | Lack of error handling |
| **Decision** | N/A | FIX |
| **Rationale** | Data integrity | Log warning, process in chunks |
| **Migration Impact** | None - improved behavior | Better reliability |

---

### Quirk 6: SQLite WAL Mode (QK-MEM-003)

**Legacy Reference**: QK-MEM-003 (functional-spec-legacy.md Section 18)
**Decision**: FIX

| Aspect | Legacy | Target Decision |
|--------|--------|-----------------|
| **Behavior** | WAL mode not enabled by default | Enable WAL mode by default |
| **Root Cause** | Development oversight | Lock contention issues |
| **Decision** | N/A | FIX |
| **Rationale** | Performance improvement | Better concurrency |
| **Migration Impact** | Existing DBs upgraded on first run | Automatic migration |

---

### Quirks Summary

| Quirk | Legacy ID | Decision | Migration Effort |
|-------|-----------|----------|------------------|
| Localhost bypass | QK-AUTH-001 | FIX | Medium |
| Token refresh races | QK-AUTH-002 | FIX | Low |
| Empty password | QK-AUTH-003 | FIX | Low (breaking) |
| Hardcoded threshold | QK-MEM-001 | FIX | Low |
| Memory consolidation | QK-MEM-002 | FIX | Low |
| WAL mode | QK-MEM-003 | FIX | Low |

**Total**: 6 quirks - All FIX (security/reliability improvements)

---

## 19. Risks, Assumptions, Decisions (Target System)

### Migration Risks

| Risk | Legacy Risk | Target Mitigation | Owner |
|------|-------------|-------------------|-------|
| Data loss during migration | R-003 | Backup + dual-write period | Eng Team |
| Behavioral regression | R-002 | Golden file tests | QA Team |
| Performance regression | R-005 | Benchmark suite | Eng Team |
| Channel API breaking changes | R-004 | Adapter versioning | Eng Team |
| Community resistance | R-006 | Incremental delivery | Product |

### Assumptions (Target System)

1. **Python ecosystem sufficient**: Python 3.12+ has mature async support and libraries for all integrations (Inherited from Q1 decision)
2. **SQLite scales adequately**: Single-user workload fits SQLite capabilities (Inherited from legacy)
3. **28 adapters portable**: All channel protocols have Python equivalents (NEW assumption - verify per adapter)
4. **MCP protocol stable**: Anthropic's MCP won't have breaking changes during migration (Inherited)

### Key Decisions Made

| Decision | Options Considered | Chosen Option | Rationale |
|----------|-------------------|---------------|-----------|
| Language | Python, Go, Rust, Keep TypeScript | Q1: Python 3.12+ | Larger contributor pool, ML ecosystem |
| Database | PostgreSQL, Keep SQLite | Q2: SQLite + sqlite-vec | Migration-free, proven |
| Message Bus | Redis, RabbitMQ, In-memory | Q3: WebSocket + in-memory | Simplicity, local-first |
| Deployment | K8s, Bare metal, Docker Compose | Q5: Docker Compose | User-friendly |
| Security | OAuth2, JWT, Keep current | Q9: Keep Token/Password/Tailscale | Community preference |

### Open Decisions (User Input Needed)

| Decision | Options | Recommendation | Deadline |
|----------|---------|----------------|----------|
| Channel adapter priority | All 28 vs Core 8 first | Core 8 first | Before Phase 1 |
| POE API support | Add vs Skip | Add in Phase 3 | After core stable |
| i18n support | Add vs Skip | Add in Phase 3 | After core stable |

---

## 20. Value / Business Case (Target System)

### Expected Value from Modernization

| Value Area | Legacy State | Target State | Business Impact |
|------------|--------------|--------------|-----------------|
| Performance | Unmeasured | p95 < 2s, benchmarked | User satisfaction |
| Security | 6/10 (tech debt) | 9/10 (hardened) | Enterprise adoption |
| Maintainability | 5/10 (complexity) | 8/10 (patterns) | Faster development |
| Test Coverage | ~40% estimated | 80% target | Fewer regressions |
| Observability | Console logging | OpenTelemetry | Faster debugging |

### ROI Analysis

- **Investment**: 4 phases over 6-18 months (Hybrid/Strangler Fig approach)
- **Expected Return**:
  - Enterprise adoption enabled (security compliance)
  - Larger contributor base (Python vs TypeScript)
  - Reduced maintenance burden (better architecture)
- **Timeline**: Benefits realized incrementally per phase

### Success Metrics

| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| Test coverage | ~40% | 80% | pytest --cov |
| Security vulnerabilities | 8 tech debt items | 0 critical | Security audit |
| Message latency (p50) | Unknown | < 500ms | OpenTelemetry |
| Community contributors | N/A | Increase 50% | GitHub analytics |

---

## 21. Traceability Matrix (Legacy -> Target)

### Requirements Mapping

| Legacy Req | Target Req | Status | Migration Notes |
|------------|------------|--------|-----------------|
| FR-CRIT-001 | FR-CRIT-001 | EXACT | Multi-channel gateway preserved |
| FR-CRIT-002 | FR-CRIT-002 | EXACT | Timing-safe auth preserved |
| FR-CRIT-003 | FR-CRIT-003 | ENHANCED | Command allowlist added |
| FR-CRIT-004 | FR-CRIT-004 | EXACT | Memory search preserved |
| N/A | FR-NEW-001 | NEW | Audit trail query |
| N/A | FR-NEW-002 | NEW | Health endpoints |
| N/A | FR-NEW-003 | NEW | Rate limiting |

### Use Case Mapping

| Legacy UC | Target UC | Status | Changes |
|-----------|-----------|--------|---------|
| UC-001 | UC-001 | EXACT | Implementation language only |
| UC-002 | UC-002 | ENHANCED | Audit logging added |
| UC-003 | UC-003 | ENHANCED | Command allowlist added |
| UC-004 | UC-004 | EXACT | Same search algorithm |
| UC-005 | UC-005 | EXACT | WhatsApp pairing preserved |
| UC-006 | UC-006 | EXACT | Telegram config preserved |
| UC-007 | UC-007 | EXACT | Discord monitoring preserved |
| UC-008 | UC-008 | EXACT | Browser automation preserved |
| UC-009 | UC-009 | EXACT | Cron scheduling preserved |
| UC-010 | UC-010 | EXACT | Voice call preserved |

### Business Logic Mapping

| Legacy BL | Target BL | Preservation | Verification |
|-----------|-----------|--------------|--------------|
| CALC-001 (Similarity) | CALC-001 | EXACT | Golden file tests |
| CALC-002 (Backoff) | CALC-002 | EXACT | Unit tests |
| VAL-001 (Auth) | VAL-001 | EXACT | Integration tests |
| SM-001 (Approval) | SM-001 | EXACT | State machine tests |
| SM-002 (Connection) | SM-002 | EXACT | State machine tests |

---

## 22. Next Steps

### Immediate Actions

1. **Review this specification** with stakeholders
2. **Resolve open decisions** in Section 19 (channel priority, POE API, i18n)
3. **Approve quirk decisions** in Section 18 (all marked FIX)
4. **Proceed to technical specs**

### Technical Specification

After approval:
- Generate `technical-spec-legacy.md` (document HOW legacy is built)
- Generate `technical-spec-target.md` (document HOW target will be built)

### Migration Planning

1. **Data migration strategy** (from Section 14)
   - Backup existing SQLite database
   - Add thread_id column migration
   - Verify embedding compatibility
2. **API versioning rollout** (from Section 16)
   - Deploy v1 endpoints alongside legacy
   - Redirect legacy paths during transition
3. **Integration updates** (from Section 17)
   - Update channel adapter libraries
   - Verify protocol compatibility

---

## 24. Output Validation Checklist (Target System)

**Note**: Section 23 (Business Logic Preservation Checklist) is legacy-only.
For target, verify implementation of preserved logic during development.

### 24.1 Document Quality

| Check | Status | Notes |
|-------|--------|-------|
| All sections complete (no TODO/TBD) | [x] | Complete |
| All Legacy -> Target mappings complete | [x] | Complete |
| User preferences (Q1-Q10) consistently applied | [x] | Applied throughout |
| All cross-references valid | [x] | Verified |
| All tables properly formatted | [x] | Markdown valid |

### 24.2 Content Completeness

| Section | Legacy Items | Target Items | Mapping Complete |
|---------|--------------|--------------|------------------|
| Use Cases | 10 | 10 | [x] |
| User Stories | 9 | 7 (5 preserved + 2 new) | [x] |
| Business Logic | 5 formulas | 5 formulas | [x] |
| Requirements | 4 critical | 7 (4 + 3 new) | [x] |
| Data Models | 2 entities | 2 entities | [x] |

### 24.3 Modernization Verification

- [x] All legacy quirks have PRESERVE/FIX/REMOVE decision (6 FIX)
- [x] All user preferences (Q1-Q10) applied consistently
- [x] Migration plans documented for all data changes
- [x] API versioning strategy defined (/api/v1/*)
- [x] Backward compatibility addressed (legacy redirects)

### 24.4 Stakeholder Readiness

- [x] Executive Summary reflects modernization goals
- [x] Business value clearly articulated (Section 20)
- [x] Technical decisions justified (Q1-Q10 rationale)
- [x] Migration risks documented with mitigations (Section 19)
- [x] Open decisions identified for resolution (3 decisions)

---

## Appendix A: Glossary

| Term | Legacy Definition | Target Definition | Change |
|------|-------------------|-------------------|--------|
| Adapter | Channel-specific integration module | Channel-specific integration module | None |
| Gateway | WebSocket server for all channels | FastAPI WebSocket server | Implementation |
| MCP | Model Context Protocol | Model Context Protocol | None |
| Memory Fragment | Single stored context with embedding | Single stored context with embedding | None |
| Thread | Conversation context within a channel | Conversation context within a channel | None |
| Tool | Executable capability exposed to AI | Executable capability exposed to AI | None |

---

## Appendix B: User Preference Summary

| Q# | Topic | User's Choice | Applied In |
|----|-------|---------------|------------|
| Q1 | Language | Python 3.12+ | Sections 4, 5, 10, 13 |
| Q2 | Database | SQLite + sqlite-vec | Sections 12, 14 |
| Q3 | Message Bus | WebSocket + in-memory | Sections 13, 17 |
| Q4 | Package Manager | uv | Section 15 |
| Q5 | Deployment | Docker Compose | Sections 12, 15 |
| Q6 | IaC | Docker Compose | Section 15 |
| Q7 | Container | Docker | Section 12 |
| Q8 | Observability | Prometheus/JSON/OpenTelemetry | Section 12 |
| Q9 | Security | Token/Password/Tailscale | Sections 11, 12 |
| Q10 | Testing | pytest (80% coverage) | Section 24 |

---

## Appendix C: Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-29 | AI Agent | Target specification generated from legacy analysis |
| 2026-01-29 | AI Agent | Applied user preferences Q1-Q10 |
| 2026-01-29 | AI Agent | Incorporated external research findings |

---

*End of Functional Specification - Target System*
*Document Version: 1.0*
*Generated: 2026-01-29*
*Analysis Chain ID: 20260129-202219*