# Clawdbot SaaS Transformation Plan

## Executive Summary

This document outlines a comprehensive plan to transform Clawdbot from a single-user personal AI assistant into a multi-tenant Software-as-a-Service (SaaS) platform. The transformation involves fundamental changes to the data model, execution architecture, security posture, and business model.

**Key Transformations:**
- File-based storage → Multi-tenant database architecture
- Single-user agents → Isolated per-tenant Overseer containers
- Local execution → Cloud-managed orchestration with sandboxed subagents
- Free/self-hosted → Tiered subscription + usage-based pricing

**Estimated Complexity:** High (6-12 month initiative for MVP, 18-24 months for full platform)

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Multi-Tenant Architecture Design](#2-multi-tenant-architecture-design)
3. [Data Model Transformation](#3-data-model-transformation)
4. [Execution Model: Cloud Overseer Containers](#4-execution-model-cloud-overseer-containers)
5. [Security & Sandboxing](#5-security--sandboxing)
6. [Technology Recommendations](#6-technology-recommendations)
7. [Pipeline & Workflow Changes](#7-pipeline--workflow-changes)
8. [Pricing & Monetization Strategy](#8-pricing--monetization-strategy)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Risk Analysis & Mitigations](#10-risk-analysis--mitigations)

---

## 1. Current Architecture Analysis

### 1.1 What We Have Today

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT: Single-User Model                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ~/.clawdbot/                                                    │
│  ├── clawdbot.json          (Single config file)                │
│  ├── sessions/              (All agent sessions)                 │
│  ├── agents/<id>/           (Per-agent memory DBs)              │
│  ├── credentials/           (OAuth tokens)                       │
│  └── identity/              (Device auth)                        │
│                                                                  │
│  Gateway (localhost:18789)                                       │
│  └── Single process, all agents, no isolation                   │
│                                                                  │
│  Execution: Local machine, user's file permissions              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Limitations for SaaS

| Limitation | Impact | Severity |
|------------|--------|----------|
| File-based storage | No horizontal scaling, no shared state | Critical |
| Single config file | No multi-tenancy | Critical |
| No user accounts | Cannot identify/bill users | Critical |
| Local file I/O | Agents can access user's entire filesystem | Critical |
| No usage metering | Cannot implement usage-based pricing | High |
| Single gateway process | No load balancing, single point of failure | High |
| No audit logging | Compliance/debugging impossible | High |
| OAuth tokens in files | Security risk in multi-tenant | High |
| No RBAC | All agents have same permissions | Medium |
| Tight OS coupling | Platform-specific features break in containers | Medium |

### 1.3 What We Can Preserve

- **Pi Agent Framework**: Core agent execution logic is portable
- **Tool System**: Well-abstracted, can be sandboxed
- **Channel Adapters**: Can become shared services
- **Plugin Architecture**: Basis for marketplace
- **Memory/Embedding System**: Can be adapted to tenant-scoped databases
- **Overseer Pattern**: Natural fit for cloud orchestration

---

## 2. Multi-Tenant Architecture Design

### 2.1 High-Level Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SAAS: Multi-Tenant Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Edge / API Gateway                            │   │
│  │  (Cloudflare Workers / AWS API Gateway / Kong)                       │   │
│  │  - Authentication (JWT/OAuth2)                                        │   │
│  │  - Rate limiting per tenant                                           │   │
│  │  - Request routing                                                    │   │
│  │  - DDoS protection                                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Control Plane Services                           │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Auth      │  │  Billing    │  │  Tenant     │  │   Config    │  │   │
│  │  │  Service    │  │  Service    │  │  Manager    │  │   Service   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Audit     │  │   Metering  │  │  Secrets    │  │  Plugin     │  │   │
│  │  │   Logger    │  │   Service   │  │   Vault     │  │  Registry   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Execution Plane (Kubernetes)                       │   │
│  │                                                                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │              Tenant A Namespace                                  │ │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │ │   │
│  │  │  │  Overseer   │──│  Subagent   │  │  Subagent   │              │ │   │
│  │  │  │  Container  │  │  Worker 1   │  │  Worker 2   │              │ │   │
│  │  │  │  (Primary)  │  │  (Sandboxed)│  │  (Sandboxed)│              │ │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘              │ │   │
│  │  │        │                                                         │ │   │
│  │  │        ▼                                                         │ │   │
│  │  │  ┌─────────────┐  ┌─────────────┐                               │ │   │
│  │  │  │  Memory     │  │  Session    │                               │ │   │
│  │  │  │  Sidecar    │  │  Store      │                               │ │   │
│  │  │  └─────────────┘  └─────────────┘                               │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │              Tenant B Namespace (isolated)                       │ │   │
│  │  │  ... (same structure, completely isolated)                       │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Data Plane                                    │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ PostgreSQL  │  │   Redis     │  │  S3/R2     │  │  Qdrant/    │  │   │
│  │  │  (Primary)  │  │  (Cache/    │  │  (Blobs/   │  │  Pinecone   │  │   │
│  │  │             │  │   Queues)   │  │   Media)   │  │  (Vectors)  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Shared Services Layer                              │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Channel    │  │   Model     │  │  Browser    │  │   Media     │  │   │
│  │  │  Gateway    │  │   Proxy     │  │   Pool      │  │  Pipeline   │  │   │
│  │  │ (Telegram,  │  │ (Anthropic, │  │ (Playwright │  │  (Transcode │   │   │
│  │  │  Discord..) │  │  OpenAI...) │  │  instances) │  │   /OCR)     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Tenancy Models Comparison

| Model | Isolation | Cost | Complexity | Best For |
|-------|-----------|------|------------|----------|
| **Shared Database, Shared Schema** | Low | Low | Low | Early MVP |
| **Shared Database, Tenant Schema** | Medium | Medium | Medium | Growth phase |
| **Database per Tenant** | High | High | High | Enterprise |
| **Cluster per Tenant** | Maximum | Very High | Very High | Regulated industries |

**Recommendation:** Start with **Shared Database, Tenant Schema** (PostgreSQL schemas) for MVP, with clear migration path to **Database per Tenant** for enterprise customers.

### 2.3 Tenant Isolation Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    Isolation Levels                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Level 1: Logical Isolation (All Tenants)                       │
│  ├── tenant_id column on all tables                             │
│  ├── Row-level security (RLS) policies                          │
│  ├── API authentication with tenant context                      │
│  └── Audit logging with tenant attribution                       │
│                                                                  │
│  Level 2: Resource Isolation (Pro+)                              │
│  ├── Dedicated Kubernetes namespace                              │
│  ├── Resource quotas (CPU, memory, storage)                      │
│  ├── Network policies (egress restrictions)                      │
│  └── Separate Redis/cache instances                              │
│                                                                  │
│  Level 3: Compute Isolation (Enterprise)                         │
│  ├── Dedicated node pools (no co-tenancy)                        │
│  ├── Dedicated database instance                                 │
│  ├── Private networking (VPC peering)                            │
│  └── Customer-managed encryption keys                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model Transformation

### 3.1 Core Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Core Data Model                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐                │
│  │   Account   │──────<│   Tenant    │>──────│    User     │                │
│  │  (Billing)  │  1:N  │(Organization│  N:M  │  (Member)   │                │
│  └─────────────┘       └─────────────┘       └─────────────┘                │
│        │                     │                     │                         │
│        │                     │                     │                         │
│        ▼                     ▼                     ▼                         │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐                │
│  │Subscription │       │    Agent    │       │    Role     │                │
│  │   (Plan)    │       │ Definition  │       │(Permissions)│                │
│  └─────────────┘       └─────────────┘       └─────────────┘                │
│                              │                                               │
│              ┌───────────────┼───────────────┐                              │
│              │               │               │                              │
│              ▼               ▼               ▼                              │
│        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                      │
│        │   Session   │ │   Memory    │ │  Overseer   │                      │
│        │ (Transcript)│ │   (RAG DB)  │ │   (Plans)   │                      │
│        └─────────────┘ └─────────────┘ └─────────────┘                      │
│              │               │               │                              │
│              │               │               │                              │
│              ▼               ▼               ▼                              │
│        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                      │
│        │  Message    │ │  Embedding  │ │    Work     │                      │
│        │  (Turn)     │ │  (Vector)   │ │   (Task)    │                      │
│        └─────────────┘ └─────────────┘ └─────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Database Schema (PostgreSQL)

```sql
-- ============================================================================
-- SCHEMA: Multi-Tenant Clawdbot SaaS
-- ============================================================================

-- Extension setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for embeddings

-- ============================================================================
-- ACCOUNTS & BILLING
-- ============================================================================

CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_customer_id VARCHAR(255) UNIQUE,
    billing_email   VARCHAR(255) NOT NULL,
    billing_name    VARCHAR(255),
    billing_address JSONB,
    currency        VARCHAR(3) DEFAULT 'USD',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    plan_id         VARCHAR(50) NOT NULL,  -- 'free', 'pro', 'team', 'enterprise'
    status          VARCHAR(20) NOT NULL,  -- 'active', 'canceled', 'past_due', 'trialing'
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,

    -- Token usage (aggregated)
    input_tokens    BIGINT DEFAULT 0,
    output_tokens   BIGINT DEFAULT 0,

    -- Detailed breakdowns
    usage_by_model  JSONB DEFAULT '{}',  -- {"claude-3-opus": {input: X, output: Y}, ...}
    usage_by_agent  JSONB DEFAULT '{}',  -- {"agent-id": {input: X, output: Y}, ...}

    -- Feature usage
    memory_searches INTEGER DEFAULT 0,
    browser_sessions INTEGER DEFAULT 0,
    media_processed_mb DECIMAL(10,2) DEFAULT 0,
    subagent_spawns INTEGER DEFAULT 0,

    -- Compute time (for container billing)
    compute_seconds INTEGER DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_records_account_period ON usage_records(account_id, period_start, period_end);

-- ============================================================================
-- TENANTS & USERS
-- ============================================================================

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,  -- URL-safe identifier
    settings        JSONB DEFAULT '{}',

    -- Resource limits (overridable by plan)
    max_agents      INTEGER DEFAULT 1,
    max_sessions    INTEGER DEFAULT 100,
    max_memory_mb   INTEGER DEFAULT 100,
    max_subagents   INTEGER DEFAULT 3,

    -- Isolation level
    isolation_level VARCHAR(20) DEFAULT 'shared',  -- 'shared', 'dedicated', 'enterprise'
    k8s_namespace   VARCHAR(63),  -- Set when dedicated namespace created

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    email_verified  BOOLEAN DEFAULT FALSE,
    password_hash   VARCHAR(255),  -- NULL for OAuth-only users
    name            VARCHAR(255),
    avatar_url      TEXT,

    -- OAuth providers
    oauth_providers JSONB DEFAULT '{}',  -- {"google": {"sub": "..."}, "github": {...}}

    -- MFA
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    mfa_secret      VARCHAR(255),  -- Encrypted TOTP secret

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE TABLE tenant_memberships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL,  -- 'owner', 'admin', 'member', 'viewer'
    permissions     JSONB DEFAULT '{}',    -- Fine-grained permissions
    invited_by      UUID REFERENCES users(id),
    invited_at      TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_memberships_tenant ON tenant_memberships(tenant_id);

-- ============================================================================
-- AGENTS & CONFIGURATION
-- ============================================================================

CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,

    -- Configuration (migrated from JSON config)
    model           VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
    identity        JSONB DEFAULT '{}',    -- {name, personality, instructions}
    tools_enabled   TEXT[] DEFAULT '{}',   -- Allowlist of tool names
    tools_disabled  TEXT[] DEFAULT '{}',   -- Blocklist

    -- Sandbox settings
    sandbox_enabled BOOLEAN DEFAULT TRUE,
    sandbox_config  JSONB DEFAULT '{}',    -- Docker/Firecracker config

    -- Subagent policy
    subagent_policy JSONB DEFAULT '{}',    -- {allowAgents: [], maxConcurrent: 3, ...}

    -- Workspace (cloud storage reference)
    workspace_bucket VARCHAR(255),
    workspace_prefix VARCHAR(255),

    -- State
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'suspended', 'deleted'
    last_active_at  TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_agents_tenant ON agents(tenant_id);

-- Row-Level Security
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY agents_tenant_isolation ON agents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- SESSIONS & TRANSCRIPTS
-- ============================================================================

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,

    -- Session key (for routing)
    session_key     VARCHAR(255) NOT NULL,

    -- Delivery context
    channel         VARCHAR(50),           -- 'telegram', 'discord', 'slack', etc.
    channel_user_id VARCHAR(255),          -- Channel-specific user identifier
    channel_thread_id VARCHAR(255),        -- Thread/conversation ID in channel

    -- State
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'archived', 'deleted'

    -- Metadata
    metadata        JSONB DEFAULT '{}',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,

    UNIQUE(tenant_id, agent_id, session_key)
);

CREATE INDEX idx_sessions_agent ON sessions(agent_id);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_sessions_channel ON sessions(channel, channel_user_id);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON sessions
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- Denormalized for RLS

    -- Message content
    role            VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
    content         TEXT,
    content_blocks  JSONB,                 -- Structured content (images, tool calls, etc.)

    -- Tool interactions
    tool_use_id     VARCHAR(255),
    tool_name       VARCHAR(100),
    tool_input      JSONB,
    tool_result     JSONB,

    -- Token counts (for billing)
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    model_used      VARCHAR(100),

    -- Timing
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_messages_tenant ON messages(tenant_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_tenant_isolation ON messages
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- MEMORY & EMBEDDINGS
-- ============================================================================

CREATE TABLE memory_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,

    -- Source information
    source_type     VARCHAR(50) NOT NULL,  -- 'session', 'file', 'url', 'manual'
    source_id       VARCHAR(255),          -- Reference to source (session_id, file path, etc.)

    -- Content
    title           VARCHAR(500),
    content         TEXT NOT NULL,
    content_hash    VARCHAR(64),           -- SHA-256 for deduplication

    -- Metadata
    metadata        JSONB DEFAULT '{}',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_docs_agent ON memory_documents(agent_id);
CREATE INDEX idx_memory_docs_tenant ON memory_documents(tenant_id);
CREATE INDEX idx_memory_docs_hash ON memory_documents(content_hash);

ALTER TABLE memory_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_docs_tenant_isolation ON memory_documents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE TABLE memory_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID REFERENCES memory_documents(id) ON DELETE CASCADE,
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- Denormalized
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,   -- Denormalized

    -- Chunk content
    content         TEXT NOT NULL,
    chunk_index     INTEGER NOT NULL,

    -- Embedding
    embedding       vector(1536),          -- OpenAI ada-002 dimensions
    embedding_model VARCHAR(50),

    -- Metadata
    token_count     INTEGER,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_chunks_document ON memory_chunks(document_id);
CREATE INDEX idx_memory_chunks_agent ON memory_chunks(agent_id);

-- Vector similarity index (IVFFlat for large scale)
CREATE INDEX idx_memory_chunks_embedding ON memory_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_chunks_tenant_isolation ON memory_chunks
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- OVERSEER & WORK TRACKING
-- ============================================================================

CREATE TABLE overseer_goals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,

    -- Goal definition
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    priority        INTEGER DEFAULT 0,

    -- State
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'completed', 'abandoned'
    progress        DECIMAL(5,2) DEFAULT 0,        -- 0-100 percentage

    -- Planning
    planned_phases  JSONB,                         -- AI-generated plan

    -- Timing
    due_at          TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_overseer_goals_agent ON overseer_goals(agent_id);

ALTER TABLE overseer_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY overseer_goals_tenant_isolation ON overseer_goals
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE TABLE overseer_work_nodes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id         UUID REFERENCES overseer_goals(id) ON DELETE CASCADE,
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES overseer_work_nodes(id) ON DELETE CASCADE,

    -- Work definition
    node_type       VARCHAR(20) NOT NULL,  -- 'phase', 'task', 'subtask'
    title           VARCHAR(500) NOT NULL,
    description     TEXT,

    -- Assignment
    assigned_agent_id UUID REFERENCES agents(id),
    assigned_at     TIMESTAMPTZ,

    -- State
    status          VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'blocked', 'failed'

    -- Results
    result          JSONB,                 -- Crystallization evidence
    error           TEXT,

    -- Ordering
    sequence        INTEGER DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_nodes_goal ON overseer_work_nodes(goal_id);
CREATE INDEX idx_work_nodes_parent ON overseer_work_nodes(parent_id);

ALTER TABLE overseer_work_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_nodes_tenant_isolation ON overseer_work_nodes
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- SECRETS & CREDENTIALS
-- ============================================================================

CREATE TABLE tenant_secrets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- Secret identification
    name            VARCHAR(100) NOT NULL,
    secret_type     VARCHAR(50) NOT NULL,  -- 'api_key', 'oauth_token', 'webhook_secret'
    provider        VARCHAR(50),           -- 'anthropic', 'openai', 'telegram', etc.

    -- Encrypted value (encrypted at application layer)
    encrypted_value TEXT NOT NULL,
    encryption_key_id VARCHAR(100),        -- Reference to KMS key

    -- Metadata
    metadata        JSONB DEFAULT '{}',

    -- Expiration
    expires_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_secrets_tenant ON tenant_secrets(tenant_id);

ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY secrets_tenant_isolation ON tenant_secrets
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID,                  -- NULL for system events
    user_id         UUID,
    agent_id        UUID,

    -- Event details
    event_type      VARCHAR(100) NOT NULL,  -- 'agent.created', 'session.message', 'config.updated', etc.
    resource_type   VARCHAR(50),
    resource_id     UUID,

    -- Change tracking
    action          VARCHAR(20) NOT NULL,  -- 'create', 'read', 'update', 'delete', 'execute'
    changes         JSONB,                 -- {before: {...}, after: {...}}

    -- Context
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,

    -- Timing
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioned by month for efficient retention management
CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- CHANNEL CONNECTIONS
-- ============================================================================

CREATE TABLE channel_connections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,

    -- Channel identification
    channel_type    VARCHAR(50) NOT NULL,  -- 'telegram', 'discord', 'slack', etc.
    channel_config  JSONB NOT NULL,        -- Channel-specific config (encrypted secrets)

    -- State
    status          VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'connected', 'disconnected', 'error'
    last_error      TEXT,

    -- Connection metadata
    connected_at    TIMESTAMPTZ,
    last_health_check TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_connections_tenant ON channel_connections(tenant_id);
CREATE INDEX idx_channel_connections_agent ON channel_connections(agent_id);

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_connections_tenant_isolation ON channel_connections
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- PLUGINS & MARKETPLACE
-- ============================================================================

CREATE TABLE plugins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Plugin identification
    name            VARCHAR(100) UNIQUE NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    version         VARCHAR(20) NOT NULL,

    -- Publisher
    publisher_id    UUID REFERENCES tenants(id),  -- NULL for official plugins
    publisher_name  VARCHAR(255),

    -- Metadata
    description     TEXT,
    readme          TEXT,
    icon_url        TEXT,
    homepage_url    TEXT,
    repository_url  TEXT,

    -- Pricing
    pricing_type    VARCHAR(20) DEFAULT 'free',  -- 'free', 'paid', 'freemium'
    price_monthly   DECIMAL(10,2),
    price_yearly    DECIMAL(10,2),
    price_one_time  DECIMAL(10,2),

    -- Categorization
    categories      TEXT[] DEFAULT '{}',
    tags            TEXT[] DEFAULT '{}',

    -- Stats
    install_count   INTEGER DEFAULT 0,
    rating_average  DECIMAL(3,2),
    rating_count    INTEGER DEFAULT 0,

    -- Review status
    review_status   VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    reviewed_at     TIMESTAMPTZ,

    -- Package
    package_url     TEXT NOT NULL,         -- S3/R2 URL to plugin package
    package_hash    VARCHAR(64),           -- SHA-256 of package

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plugins_slug ON plugins(slug);
CREATE INDEX idx_plugins_categories ON plugins USING GIN(categories);

CREATE TABLE tenant_plugins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    plugin_id       UUID REFERENCES plugins(id) ON DELETE CASCADE,

    -- Installation state
    installed_version VARCHAR(20),
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'disabled', 'uninstalled'

    -- Subscription (for paid plugins)
    subscription_id UUID REFERENCES subscriptions(id),

    -- Configuration
    config          JSONB DEFAULT '{}',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, plugin_id)
);

CREATE INDEX idx_tenant_plugins_tenant ON tenant_plugins(tenant_id);
```

### 3.3 Data Migration Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Migration Phases                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Schema Creation                                        │
│  ├── Create all tables with RLS policies                        │
│  ├── Set up pgvector extension                                   │
│  └── Create indexes and constraints                              │
│                                                                  │
│  Phase 2: Self-Hosted Import Tool                                │
│  ├── Read ~/.clawdbot/clawdbot.json → tenant + agents           │
│  ├── Read sessions/*.json → sessions + messages                  │
│  ├── Read agents/*/memory.db → memory_documents + chunks        │
│  ├── Read overseer-store.json → goals + work_nodes              │
│  └── Re-embed chunks with new model (optional)                   │
│                                                                  │
│  Phase 3: Dual-Write Period                                      │
│  ├── New writes go to both file + database                       │
│  ├── Reads prefer database, fallback to file                     │
│  └── Monitoring for consistency                                  │
│                                                                  │
│  Phase 4: Cutover                                                 │
│  ├── Database becomes source of truth                            │
│  ├── File writes disabled                                        │
│  └── Legacy file support deprecated                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Execution Model: Cloud Overseer Containers

### 4.1 Container Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Per-Tenant Execution Model                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Kubernetes Namespace: tenant-{slug}                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Overseer Pod (Always Running)                     │    │
│  │                                                                       │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │    │
│  │  │   Overseer    │  │   Memory      │  │   Queue       │            │    │
│  │  │   Container   │  │   Sidecar     │  │   Sidecar     │            │    │
│  │  │               │  │               │  │               │            │    │
│  │  │  - Goal mgmt  │  │  - pgvector   │  │  - Redis      │            │    │
│  │  │  - Planning   │  │    queries    │  │    consumer   │            │    │
│  │  │  - Dispatch   │  │  - Embedding  │  │  - Job queue  │            │    │
│  │  │  - Monitoring │  │    cache      │  │  - Callbacks  │            │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘            │    │
│  │         │                                     ▲                       │    │
│  │         │ Spawn/Monitor                       │ Results               │    │
│  │         ▼                                     │                       │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │                    Subagent Job Pool                          │   │    │
│  │  │                                                                │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │    │
│  │  │  │  Subagent   │  │  Subagent   │  │  Subagent   │           │   │    │
│  │  │  │   Job 1     │  │   Job 2     │  │   Job 3     │           │   │    │
│  │  │  │  (Sandbox)  │  │  (Sandbox)  │  │  (Sandbox)  │           │   │    │
│  │  │  │             │  │             │  │             │           │   │    │
│  │  │  │ - gVisor    │  │ - gVisor    │  │ - gVisor    │           │   │    │
│  │  │  │ - Limited   │  │ - Limited   │  │ - Limited   │           │   │    │
│  │  │  │   network   │  │   network   │  │   network   │           │   │    │
│  │  │  │ - Time cap  │  │ - Time cap  │  │ - Time cap  │           │   │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘           │   │    │
│  │  │                                                                │   │    │
│  │  │  (Kubernetes Jobs with auto-cleanup after completion)         │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Resource Quotas:                                                            │
│  ├── CPU: 2 cores (Overseer) + 1 core per subagent (max 4)                  │
│  ├── Memory: 2GB (Overseer) + 512MB per subagent                            │
│  ├── Storage: 10GB ephemeral per subagent                                    │
│  └── Network: Egress to allowlisted domains only                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Subagent Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                  Subagent Lifecycle States                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐                                                    │
│   │ PENDING │ ◄── Overseer creates work assignment               │
│   └────┬────┘                                                    │
│        │                                                         │
│        │ Resources available + queue slot                        │
│        ▼                                                         │
│   ┌─────────┐                                                    │
│   │SPAWNING │ ◄── K8s Job created, container pulling             │
│   └────┬────┘                                                    │
│        │                                                         │
│        │ Container ready, agent initialized                      │
│        ▼                                                         │
│   ┌─────────┐                                                    │
│   │ ACTIVE  │ ◄── Agent executing tools, making progress         │
│   └────┬────┘                                                    │
│        │                                                         │
│        ├─────────────────────────────────────────┐              │
│        │                                         │              │
│        │ Task completed                          │ Error/Timeout │
│        ▼                                         ▼              │
│   ┌─────────┐                              ┌─────────┐          │
│   │COMPLETED│                              │ FAILED  │          │
│   └────┬────┘                              └────┬────┘          │
│        │                                         │              │
│        │ Results crystallized                    │ Retry/Escalate│
│        ▼                                         ▼              │
│   ┌─────────┐                              ┌─────────┐          │
│   │CLEANUP  │ ◄── Job terminated, resources freed │ RETRY   │   │
│   └─────────┘                              └─────────┘          │
│                                                                  │
│  Timeouts:                                                       │
│  ├── Spawn: 60 seconds (container pull + init)                  │
│  ├── Heartbeat: 30 seconds (progress check)                      │
│  ├── Task: Configurable (default 10 minutes)                     │
│  └── Max lifetime: 1 hour (hard cap)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Inter-Container Communication

```
┌─────────────────────────────────────────────────────────────────┐
│              Inter-Container Communication                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Redis Pub/Sub (Recommended for MVP)                   │
│  ├── Overseer publishes work assignments to channel              │
│  ├── Subagents subscribe to their assignment channel             │
│  ├── Results published back to overseer channel                  │
│  └── Heartbeats via Redis key TTL                                │
│                                                                  │
│  Option B: gRPC (For production scale)                           │
│  ├── Overseer runs gRPC server                                   │
│  ├── Subagents connect as clients                                │
│  ├── Bidirectional streaming for progress                        │
│  └── Service mesh (Istio/Linkerd) for mTLS                      │
│                                                                  │
│  Option C: Kubernetes Events + CRDs (Cloud-native)               │
│  ├── Custom WorkAssignment CRD                                   │
│  ├── Controller watches for status changes                       │
│  ├── Native K8s event streaming                                  │
│  └── Best for very large scale                                   │
│                                                                  │
│  Recommended: Start with Redis, migrate to gRPC if needed        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Workspace & File System

```
┌─────────────────────────────────────────────────────────────────┐
│               Cloud Workspace Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  S3/R2 Bucket: clawdbot-workspaces-{region}                     │
│                                                                  │
│  Structure:                                                      │
│  └── tenants/                                                    │
│      └── {tenant-id}/                                            │
│          └── agents/                                             │
│              └── {agent-id}/                                     │
│                  ├── workspace/          (Working files)        │
│                  │   ├── project-a/                             │
│                  │   └── project-b/                             │
│                  ├── artifacts/          (Build outputs)        │
│                  └── uploads/            (User uploads)         │
│                                                                  │
│  Mount Strategy:                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Overseer Pod                                            │    │
│  │  ├── /workspace (r/w) ← S3 FUSE mount (s3fs/goofys)     │    │
│  │  └── /shared (r/o)    ← Shared tools/runtimes           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Subagent Pod                                            │    │
│  │  ├── /task (r/w)      ← Ephemeral PVC (10GB)            │    │
│  │  ├── /workspace (r/o) ← S3 FUSE mount (read-only)       │    │
│  │  └── /output (r/w)    ← Results written here → S3       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Sync Strategy:                                                  │
│  ├── Initial: s3 sync at pod startup                            │
│  ├── Ongoing: inotify → background sync (debounced)             │
│  └── Completion: Force sync before pod termination              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Security & Sandboxing

### 5.1 Threat Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      Threat Model                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  T1: Cross-Tenant Data Access                                    │
│  ├── Risk: Tenant A accesses Tenant B's data                    │
│  ├── Mitigations:                                                │
│  │   ├── Row-level security (RLS) on all tables                 │
│  │   ├── Tenant context in every API request                     │
│  │   ├── Separate K8s namespaces for dedicated tenants          │
│  │   └── Audit logging of all data access                       │
│  └── Severity: Critical                                          │
│                                                                  │
│  T2: Agent Escape (Sandbox Breakout)                             │
│  ├── Risk: Malicious agent escapes container isolation          │
│  ├── Mitigations:                                                │
│  │   ├── gVisor (runsc) for syscall filtering                   │
│  │   ├── Seccomp profiles (strict)                               │
│  │   ├── Read-only root filesystem                               │
│  │   ├── No privileged containers                                │
│  │   ├── Network policies (deny by default)                      │
│  │   └── Resource limits (CPU, memory, time)                    │
│  └── Severity: Critical                                          │
│                                                                  │
│  T3: Resource Exhaustion (DoS)                                   │
│  ├── Risk: Single tenant consumes all resources                  │
│  ├── Mitigations:                                                │
│  │   ├── Kubernetes ResourceQuotas per namespace                 │
│  │   ├── Rate limiting at API gateway                            │
│  │   ├── Circuit breakers for external services                  │
│  │   └── Billing alerts and auto-suspend                        │
│  └── Severity: High                                              │
│                                                                  │
│  T4: Prompt Injection / Agent Manipulation                       │
│  ├── Risk: Malicious input causes unintended actions            │
│  ├── Mitigations:                                                │
│  │   ├── Tool allowlists per agent                               │
│  │   ├── Human approval for sensitive tools                      │
│  │   ├── Output filtering/scanning                               │
│  │   └── Anomaly detection on agent behavior                    │
│  └── Severity: High                                              │
│                                                                  │
│  T5: Credential Theft                                            │
│  ├── Risk: API keys or tokens leaked                             │
│  ├── Mitigations:                                                │
│  │   ├── Secrets in Vault (not database)                        │
│  │   ├── Short-lived tokens with rotation                        │
│  │   ├── Encryption at rest (KMS)                                │
│  │   └── Audit logging of secret access                         │
│  └── Severity: High                                              │
│                                                                  │
│  T6: Supply Chain Attack (Plugins)                               │
│  ├── Risk: Malicious plugin executes in tenant context          │
│  ├── Mitigations:                                                │
│  │   ├── Plugin review process                                   │
│  │   ├── Code signing verification                               │
│  │   ├── Sandboxed plugin execution                              │
│  │   ├── Capability-based permissions                            │
│  │   └── Publisher verification                                  │
│  └── Severity: Medium-High                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Sandbox Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                   Sandbox Layers                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Kubernetes Isolation                                   │
│  ├── Namespace isolation (tenant-{slug})                        │
│  ├── Network policies:                                           │
│  │   ├── Deny all ingress by default                            │
│  │   ├── Allow only from overseer to subagents                  │
│  │   ├── Egress allowlist (API endpoints only)                  │
│  │   └── No inter-tenant communication                          │
│  ├── Pod Security Standards (restricted)                         │
│  └── Service account with minimal RBAC                          │
│                                                                  │
│  Layer 2: Container Runtime (gVisor)                             │
│  ├── User-space kernel (Sentry)                                  │
│  ├── Syscall interception and filtering                          │
│  ├── No direct host kernel access                                │
│  └── Performance overhead: ~10-20%                               │
│                                                                  │
│  Layer 3: Seccomp Profile                                        │
│  {                                                               │
│    "defaultAction": "SCMP_ACT_ERRNO",                           │
│    "architectures": ["SCMP_ARCH_X86_64"],                       │
│    "syscalls": [                                                 │
│      {"names": ["read", "write", "open", "close", ...],         │
│       "action": "SCMP_ACT_ALLOW"},                              │
│      // Explicitly deny: ptrace, mount, reboot, etc.            │
│    ]                                                             │
│  }                                                               │
│                                                                  │
│  Layer 4: AppArmor/SELinux Profile                               │
│  ├── Deny network raw sockets                                    │
│  ├── Deny mount operations                                       │
│  ├── Restrict file paths                                         │
│  └── Deny capability acquisition                                 │
│                                                                  │
│  Layer 5: Resource Limits                                        │
│  ├── CPU: 1 core (requests: 250m)                               │
│  ├── Memory: 512Mi (limit), 256Mi (request)                     │
│  ├── Ephemeral storage: 10Gi                                     │
│  ├── PIDs: 100 max                                               │
│  └── Execution time: 10 minutes (configurable)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Network Security

```yaml
# Network Policy for Subagent Pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: subagent-policy
  namespace: tenant-{slug}
spec:
  podSelector:
    matchLabels:
      role: subagent
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: overseer
      ports:
        - port: 8080  # Health check / metrics
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - port: 53
          protocol: UDP
    # Allow specific AI API endpoints
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - port: 443
          protocol: TCP
    # Note: Additional layer of domain filtering via proxy
```

### 5.4 Secrets Management

```
┌─────────────────────────────────────────────────────────────────┐
│                  Secrets Architecture                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Storage: HashiCorp Vault (or AWS Secrets Manager)               │
│                                                                  │
│  Hierarchy:                                                      │
│  └── secret/                                                     │
│      ├── clawdbot/                                               │
│      │   ├── platform/           (Platform-wide secrets)        │
│      │   │   ├── stripe_key                                     │
│      │   │   ├── anthropic_key   (Fallback if tenant none)      │
│      │   │   └── sendgrid_key                                   │
│      │   │                                                       │
│      │   └── tenants/                                            │
│      │       └── {tenant-id}/                                    │
│      │           ├── anthropic_key                               │
│      │           ├── openai_key                                  │
│      │           ├── telegram_token                              │
│      │           ├── discord_token                               │
│      │           └── slack_tokens                                │
│                                                                  │
│  Access Control:                                                 │
│  ├── Overseer: Read own tenant secrets only                      │
│  ├── Subagent: No direct Vault access (secrets via env)         │
│  ├── Control plane: Admin access with audit                      │
│  └── Rotation: Automatic with notification                       │
│                                                                  │
│  Injection:                                                      │
│  ├── Kubernetes: External Secrets Operator                       │
│  ├── Subagents: Vault Agent sidecar or env injection            │
│  └── Encryption: Transit engine for app-layer encryption        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Technology Recommendations

### 6.1 Infrastructure Stack

| Layer | Recommended | Alternatives | Rationale |
|-------|-------------|--------------|-----------|
| **Cloud Provider** | AWS | GCP, Azure | Best K8s support (EKS), mature ecosystem |
| **Kubernetes** | EKS with Karpenter | GKE Autopilot, AKS | Auto-scaling, spot instances for cost |
| **Container Runtime** | containerd + gVisor | Firecracker, Kata | gVisor better for mixed workloads |
| **Service Mesh** | None initially → Istio | Linkerd, Cilium | Add when mTLS/observability needed |
| **Ingress** | AWS ALB + nginx | Traefik, Kong | Cost-effective, good WebSocket support |

### 6.2 Data Stack

| Layer | Recommended | Alternatives | Rationale |
|-------|-------------|--------------|-----------|
| **Primary Database** | PostgreSQL (RDS) | CockroachDB, PlanetScale | pgvector, RLS, mature |
| **Vector Search** | pgvector | Pinecone, Qdrant, Weaviate | Simplicity (same DB), good enough to start |
| **Cache/Queue** | Redis (ElastiCache) | Valkey, KeyDB | Proven, Pub/Sub + caching |
| **Object Storage** | S3 | R2 (cheaper egress), GCS | Ubiquitous, good tooling |
| **Secrets** | AWS Secrets Manager | HashiCorp Vault | Managed, less ops burden |

### 6.3 Application Stack

| Layer | Recommended | Alternatives | Rationale |
|-------|-------------|--------------|-----------|
| **API Framework** | Hono (keep existing) | Fastify, tRPC | Already in use, serverless-ready |
| **Auth** | Clerk | Auth0, WorkOS, Supabase Auth | Developer-friendly, good MFA |
| **Billing** | Stripe Billing | Paddle, Orb | Best metering support, global |
| **Email** | Resend | SendGrid, Postmark | Modern API, good deliverability |
| **Monitoring** | Datadog | Grafana Cloud, New Relic | All-in-one, good K8s support |
| **Error Tracking** | Sentry | Datadog APM, Rollbar | Best for JS/TS stack |

### 6.4 Development Stack

| Tool | Recommended | Rationale |
|------|-------------|-----------|
| **Monorepo** | Turborepo | Already using pnpm workspaces |
| **Testing** | Vitest (keep) | Fast, good coverage |
| **CI/CD** | GitHub Actions | Already integrated |
| **IaC** | Pulumi (TypeScript) | Same language as app |
| **Local Dev** | Docker Compose + Tilt | Fast iteration |

### 6.5 AI/ML Stack

| Capability | Recommended | Rationale |
|------------|-------------|-----------|
| **Primary LLM** | Claude (Anthropic) | Best reasoning, already integrated |
| **Embeddings** | OpenAI ada-002 → text-embedding-3-small | Cost/quality balance |
| **Fallback LLM** | GPT-4o, Gemini | Redundancy |
| **Local Models** | None for SaaS | Complexity, licensing issues |

---

## 7. Pipeline & Workflow Changes

### 7.1 Message Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SaaS Message Pipeline                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. INGRESS (Channel Gateway Service)                                │    │
│  │                                                                       │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │    │
│  │  │Telegram │  │ Discord │  │  Slack  │  │   API   │               │    │
│  │  │ Webhook │  │ Gateway │  │  Events │  │  Direct │               │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘               │    │
│  │       │            │            │            │                      │    │
│  │       └────────────┴────────────┴────────────┘                      │    │
│  │                          │                                           │    │
│  │                          ▼                                           │    │
│  │                 ┌─────────────────┐                                  │    │
│  │                 │  Normalize to   │                                  │    │
│  │                 │ InboundMessage  │                                  │    │
│  │                 └────────┬────────┘                                  │    │
│  └──────────────────────────┼──────────────────────────────────────────┘    │
│                             │                                                │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  2. ROUTING (Control Plane)                                          │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │    │
│  │  │  Authenticate   │───►│  Resolve Tenant │───►│  Route to Agent │  │    │
│  │  │  (Channel Auth) │    │  (Lookup/Create)│    │  (Session Key)  │  │    │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘  │    │
│  │                                                        │             │    │
│  │                                                        ▼             │    │
│  │                                               ┌─────────────────┐   │    │
│  │                                               │  Check Limits   │   │    │
│  │                                               │ (Rate/Billing)  │   │    │
│  │                                               └────────┬────────┘   │    │
│  └───────────────────────────────────────────────────────┼─────────────┘    │
│                                                           │                  │
│                    ┌──────────────────────────────────────┘                  │
│                    │                                                         │
│                    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  3. QUEUEING (Redis)                                                 │    │
│  │                                                                       │    │
│  │  Queue: tenant:{id}:agent:{id}:messages                              │    │
│  │                                                                       │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  Message Payload                                             │    │    │
│  │  │  {                                                           │    │    │
│  │  │    "id": "msg_xxx",                                          │    │    │
│  │  │    "tenant_id": "...",                                       │    │    │
│  │  │    "agent_id": "...",                                        │    │    │
│  │  │    "session_id": "...",                                      │    │    │
│  │  │    "channel": "telegram",                                    │    │    │
│  │  │    "content": "...",                                         │    │    │
│  │  │    "attachments": [...],                                     │    │    │
│  │  │    "reply_context": {...}                                    │    │    │
│  │  │  }                                                           │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                           │                  │
│                                                           ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  4. EXECUTION (Tenant Namespace - Overseer Pod)                      │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │  Queue Consumer │ ◄── Redis BRPOP on tenant queue                 │    │
│  │  └────────┬────────┘                                                 │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │  Load Session   │ ◄── PostgreSQL (with cache)                     │    │
│  │  │  + Context      │                                                 │    │
│  │  └────────┬────────┘                                                 │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌─────────────────┐    ┌─────────────────┐                         │    │
│  │  │  Pi Agent Loop  │───►│   Tool Calls    │                         │    │
│  │  │  (Streaming)    │◄───│   (Sandboxed)   │                         │    │
│  │  └────────┬────────┘    └─────────────────┘                         │    │
│  │           │                      │                                    │    │
│  │           │                      ▼                                    │    │
│  │           │              ┌─────────────────┐                         │    │
│  │           │              │  Spawn Subagent │ (If needed)             │    │
│  │           │              │  (K8s Job)      │                         │    │
│  │           │              └─────────────────┘                         │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │  Stream Blocks  │ ───► WebSocket to client (if connected)        │    │
│  │  └────────┬────────┘                                                 │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │ Finalize Reply  │                                                 │    │
│  │  └────────┬────────┘                                                 │    │
│  └───────────┼──────────────────────────────────────────────────────────┘   │
│              │                                                               │
│              ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  5. PERSISTENCE & METERING                                           │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │    │
│  │  │ Save Messages   │    │  Update Usage   │    │  Emit Events    │  │    │
│  │  │ (PostgreSQL)    │    │ (Metering Svc)  │    │ (Audit Log)     │  │    │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                           │                  │
│                                                           ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  6. DELIVERY (Channel Gateway Service)                               │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │ Format for      │ ◄── Markdown → Channel-specific                 │    │
│  │  │ Channel         │                                                 │    │
│  │  └────────┬────────┘                                                 │    │
│  │           │                                                           │    │
│  │           ├─────────────────┬─────────────────┬─────────────────┐   │    │
│  │           ▼                 ▼                 ▼                 ▼   │    │
│  │     ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────┐ │    │
│  │     │ Telegram │      │ Discord  │      │  Slack   │      │ API  │ │    │
│  │     │   API    │      │   API    │      │   API    │      │  WS  │ │    │
│  │     └──────────┘      └──────────┘      └──────────┘      └──────┘ │    │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Overseer Planning Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│               Overseer Planning Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Goal Ingestion                                               │
│  ├── User submits goal via chat/API                             │
│  ├── Overseer parses and validates                               │
│  └── Creates goal record (status: planning)                      │
│                                                                  │
│  2. AI Planning Phase                                            │
│  ├── Send goal + context to Claude                               │
│  ├── Request structured plan output:                             │
│  │   {                                                           │
│  │     "phases": [                                               │
│  │       {                                                       │
│  │         "title": "Phase 1: Research",                        │
│  │         "tasks": [                                            │
│  │           {"title": "...", "assignee": "researcher", ...}    │
│  │         ]                                                     │
│  │       }                                                       │
│  │     ]                                                         │
│  │   }                                                           │
│  ├── Validate plan structure                                     │
│  └── Store in overseer_goals.planned_phases                     │
│                                                                  │
│  3. Work Node Creation                                           │
│  ├── Expand plan into work_nodes (hierarchical)                  │
│  ├── Assign dependencies                                         │
│  └── Initial status: pending                                     │
│                                                                  │
│  4. Dispatch Loop                                                │
│  ├── Find ready tasks (dependencies met)                         │
│  ├── Check resource availability                                 │
│  ├── Spawn subagent Job for each task                           │
│  └── Update status: dispatched → active                         │
│                                                                  │
│  5. Progress Monitoring                                          │
│  ├── Heartbeat checks (30s interval)                            │
│  ├── Timeout detection                                           │
│  ├── Stall detection (no progress)                               │
│  └── Recovery policies:                                          │
│      ├── resend_last: Resend last message                       │
│      ├── nudge: Ask for status                                   │
│      ├── replan: Regenerate subtasks                            │
│      ├── reassign: Try different agent                          │
│      └── escalate: Human intervention                           │
│                                                                  │
│  6. Crystallization                                              │
│  ├── Collect results from completed tasks                        │
│  ├── Evidence: files changed, commits, test results             │
│  ├── Update goal progress percentage                             │
│  └── Trigger dependent tasks                                     │
│                                                                  │
│  7. Completion                                                   │
│  ├── All tasks completed                                         │
│  ├── Generate summary report                                     │
│  ├── Notify user                                                 │
│  └── Archive goal                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Billing & Metering Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                  Metering Architecture                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Event Sources:                                                  │
│  ├── Agent execution (tokens in/out, model used)                │
│  ├── Subagent spawns (count, compute time)                       │
│  ├── Memory operations (searches, storage)                       │
│  ├── Browser sessions (count, duration)                          │
│  ├── Media processing (MB processed)                             │
│  └── API calls (request count)                                   │
│                                                                  │
│  Collection:                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Application Code                                        │    │
│  │  └── meter.record({                                      │    │
│  │        tenant_id: "...",                                 │    │
│  │        event: "llm.tokens",                              │    │
│  │        dimensions: { model: "claude-3-opus" },           │    │
│  │        value: { input: 1000, output: 500 },              │    │
│  │        timestamp: Date.now()                             │    │
│  │      })                                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Metering Service                                        │    │
│  │  ├── Buffer events in Redis (5 second windows)           │    │
│  │  ├── Aggregate by tenant + dimension                     │    │
│  │  ├── Write to usage_records (1 minute granularity)       │    │
│  │  └── Forward to Stripe Metering API (hourly)            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Stripe Billing                                          │    │
│  │  ├── Aggregate usage per billing period                  │    │
│  │  ├── Apply pricing tiers                                 │    │
│  │  ├── Generate invoice at period end                      │    │
│  │  └── Process payment                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Real-time Limits:                                               │
│  ├── Pre-execution check against current usage                  │
│  ├── Soft limit: Warning + slower execution                      │
│  ├── Hard limit: Block execution + notify                       │
│  └── Grace period for payment failures                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Pricing & Monetization Strategy

### 8.1 Market Analysis (AI Services Pricing)

| Service | Free Tier | Pro/Individual | Team | Enterprise |
|---------|-----------|----------------|------|------------|
| **ChatGPT Plus** | Limited GPT-3.5 | $20/mo (GPT-4) | $25/user/mo | Custom |
| **Claude Pro** | Limited | $20/mo | $25/user/mo | Custom |
| **GitHub Copilot** | Students/OSS | $10/mo | $19/user/mo | $39/user/mo |
| **Cursor** | 2 weeks | $20/mo | Custom | Custom |
| **Replit** | Limited | $25/mo | Custom | Custom |
| **v0 (Vercel)** | 200 credits | $20/mo | Custom | Custom |

**Key Observations:**
- Individual pro plans cluster around $20/mo
- Team plans add ~$5/user/mo overhead
- Usage-based pricing increasingly common
- Enterprise always custom

### 8.2 Proposed Pricing Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Pricing Tiers                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  FREE (Hobby)                                                        │    │
│  │                                                                       │    │
│  │  Price: $0/month                                                     │    │
│  │                                                                       │    │
│  │  Includes:                                                            │    │
│  │  ├── 1 agent                                                         │    │
│  │  ├── 50 messages/day (~1,500/month)                                  │    │
│  │  ├── 100K tokens/month (Claude Haiku only)                          │    │
│  │  ├── 10MB memory storage                                             │    │
│  │  ├── 1 channel connection                                            │    │
│  │  ├── No subagents                                                    │    │
│  │  ├── Community support only                                          │    │
│  │  └── "Powered by Clawdbot" branding                                 │    │
│  │                                                                       │    │
│  │  Target: Hobbyists, evaluation                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PRO (Individual)                                                    │    │
│  │                                                                       │    │
│  │  Price: $29/month (or $290/year - 2 months free)                    │    │
│  │                                                                       │    │
│  │  Includes:                                                            │    │
│  │  ├── 3 agents                                                        │    │
│  │  ├── Unlimited messages                                              │    │
│  │  ├── 1M tokens/month included (Sonnet)                              │    │
│  │  │   └── Overage: $0.003/1K input, $0.015/1K output                │    │
│  │  ├── 500MB memory storage                                            │    │
│  │  ├── 3 channel connections                                           │    │
│  │  ├── 2 concurrent subagents                                          │    │
│  │  ├── 10 browser sessions/day                                         │    │
│  │  ├── Claude Sonnet + Haiku models                                    │    │
│  │  ├── Priority queue                                                   │    │
│  │  ├── Email support                                                    │    │
│  │  └── No branding                                                     │    │
│  │                                                                       │    │
│  │  Target: Developers, power users, freelancers                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  TEAM                                                                │    │
│  │                                                                       │    │
│  │  Price: $49/user/month (min 3 users, or $470/user/year)             │    │
│  │                                                                       │    │
│  │  Everything in Pro, plus:                                            │    │
│  │  ├── 10 agents per team                                              │    │
│  │  ├── 5M tokens/month pooled                                          │    │
│  │  │   └── Overage: $0.0025/1K input, $0.012/1K output               │    │
│  │  ├── 2GB memory storage                                              │    │
│  │  ├── 10 channel connections                                          │    │
│  │  ├── 5 concurrent subagents                                          │    │
│  │  ├── Shared agent access                                             │    │
│  │  ├── Team workspace                                                   │    │
│  │  ├── Claude Opus access                                              │    │
│  │  ├── SSO (Google, GitHub)                                            │    │
│  │  ├── Audit logs (30 days)                                            │    │
│  │  ├── Slack support                                                    │    │
│  │  └── Onboarding call                                                 │    │
│  │                                                                       │    │
│  │  Target: Small teams, startups, agencies                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ENTERPRISE                                                          │    │
│  │                                                                       │    │
│  │  Price: Custom (starting ~$500/month)                                │    │
│  │                                                                       │    │
│  │  Everything in Team, plus:                                           │    │
│  │  ├── Unlimited agents                                                │    │
│  │  ├── Custom token allocation                                         │    │
│  │  ├── Dedicated infrastructure (isolated namespace)                   │    │
│  │  ├── Unlimited memory storage                                        │    │
│  │  ├── Unlimited subagents (fair use)                                  │    │
│  │  ├── VPC peering / private link                                      │    │
│  │  ├── SAML SSO                                                        │    │
│  │  ├── Custom data retention                                           │    │
│  │  ├── Audit logs (1 year)                                             │    │
│  │  ├── 99.9% SLA                                                       │    │
│  │  ├── Dedicated support engineer                                      │    │
│  │  ├── Custom integrations                                             │    │
│  │  ├── On-premise option                                               │    │
│  │  └── SOC 2 compliance                                                │    │
│  │                                                                       │    │
│  │  Target: Large companies, regulated industries                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Add-On Marketplace

```
┌─────────────────────────────────────────────────────────────────┐
│                   Add-On Store                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TOKEN PACKS (One-time purchase, no expiration)                  │
│  ├── Starter Pack: 500K tokens - $5                             │
│  ├── Builder Pack: 2M tokens - $15                              │
│  ├── Power Pack: 10M tokens - $60                               │
│  └── Mega Pack: 50M tokens - $250                               │
│                                                                  │
│  COMPUTE CREDITS (For subagent execution)                        │
│  ├── 10 compute hours - $10                                      │
│  ├── 50 compute hours - $40                                      │
│  └── 200 compute hours - $140                                    │
│                                                                  │
│  MEMORY STORAGE                                                  │
│  ├── 1GB additional - $5/month                                   │
│  ├── 5GB additional - $20/month                                  │
│  └── 25GB additional - $80/month                                 │
│                                                                  │
│  PREMIUM CHANNELS (One-time setup + monthly)                     │
│  ├── WhatsApp Business: $20 setup + $10/month                   │
│  ├── Microsoft Teams: $15/month                                  │
│  ├── Custom Webhook: $5/month                                    │
│  └── Voice (Twilio): $25/month + per-minute                     │
│                                                                  │
│  PREMIUM MODELS (Usage-based, on top of base)                    │
│  ├── Claude Opus: +$0.015/1K input, +$0.075/1K output           │
│  ├── GPT-4 Turbo: +$0.01/1K input, +$0.03/1K output            │
│  └── Gemini Ultra: +$0.007/1K input, +$0.021/1K output         │
│                                                                  │
│  PLUGINS (From marketplace)                                      │
│  ├── Free plugins: Community-contributed                         │
│  ├── Premium plugins: $5-50/month (rev share 70/30)             │
│  └── Enterprise plugins: Custom pricing                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Plugin Marketplace Revenue Model

```
┌─────────────────────────────────────────────────────────────────┐
│                Plugin Marketplace Economics                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Revenue Split:                                                  │
│  ├── Developer: 70%                                              │
│  ├── Platform: 30%                                               │
│  └── Note: First $1M/year at 85/15 (developer incentive)        │
│                                                                  │
│  Plugin Pricing Options:                                         │
│  ├── Free (open source, marketing)                               │
│  ├── Freemium (basic free, premium features paid)                │
│  ├── Subscription ($X/month)                                     │
│  └── One-time purchase                                           │
│                                                                  │
│  Developer Benefits:                                             │
│  ├── Plugin analytics dashboard                                  │
│  ├── Automated payouts (Stripe Connect)                          │
│  ├── Review/rating system                                        │
│  ├── Featured placement (paid)                                   │
│  └── Developer documentation + SDK                              │
│                                                                  │
│  Quality Control:                                                │
│  ├── Automated security scanning                                 │
│  ├── Manual review for first submission                          │
│  ├── User reviews/ratings                                        │
│  ├── Automated testing on update                                 │
│  └── DMCA/abuse takedown process                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.5 Revenue Projections (Hypothetical)

```
┌─────────────────────────────────────────────────────────────────┐
│              Revenue Model (Year 1-3 Projection)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Assumptions:                                                    │
│  ├── Launch: Month 0                                             │
│  ├── Free conversion to Pro: 5%                                  │
│  ├── Pro to Team upgrade: 10%                                    │
│  ├── Monthly churn: 5% (Free), 3% (Pro), 2% (Team)              │
│  └── Average add-on spend: $15/Pro user, $50/Team user          │
│                                                                  │
│  Year 1 (Building):                                              │
│  ├── Free users: 10,000                                          │
│  ├── Pro users: 500 × $29 = $14,500/mo                          │
│  ├── Team users: 50 × $49 = $2,450/mo                           │
│  ├── Add-ons: ~$10,000/mo                                        │
│  └── Total ARR: ~$320K                                           │
│                                                                  │
│  Year 2 (Growing):                                               │
│  ├── Free users: 50,000                                          │
│  ├── Pro users: 2,500 × $29 = $72,500/mo                        │
│  ├── Team users: 300 × $49 = $14,700/mo                         │
│  ├── Enterprise: 5 × $1,000 = $5,000/mo                         │
│  ├── Add-ons: ~$50,000/mo                                        │
│  ├── Marketplace: ~$5,000/mo                                     │
│  └── Total ARR: ~$1.8M                                           │
│                                                                  │
│  Year 3 (Scaling):                                               │
│  ├── Free users: 200,000                                         │
│  ├── Pro users: 10,000 × $29 = $290,000/mo                      │
│  ├── Team users: 1,500 × $49 = $73,500/mo                       │
│  ├── Enterprise: 25 × $2,000 = $50,000/mo                       │
│  ├── Add-ons: ~$150,000/mo                                       │
│  ├── Marketplace: ~$30,000/mo                                    │
│  └── Total ARR: ~$7.1M                                           │
│                                                                  │
│  Cost Structure (Year 3):                                        │
│  ├── AI API costs: ~40% of revenue (negotiable at scale)        │
│  ├── Infrastructure: ~15% of revenue                             │
│  ├── Team (10 people): ~25% of revenue                          │
│  ├── Other (legal, tools, etc.): ~5% of revenue                 │
│  └── Gross margin: ~15% (before marketing)                      │
│                                                                  │
│  Note: AI API costs are the critical factor.                    │
│  Negotiating volume discounts or using fine-tuned smaller       │
│  models can significantly improve margins.                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Roadmap

### 9.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  Implementation Phases                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 0: Foundation (Prep)                                      │
│  ├── Architecture decisions finalized                            │
│  ├── Tech stack validated (POCs)                                 │
│  ├── Team assembled                                              │
│  └── Funding/runway secured                                      │
│                                                                  │
│  Phase 1: Core Platform (MVP)                                    │
│  ├── Multi-tenant database schema                                │
│  ├── Authentication (Clerk)                                      │
│  ├── Basic billing (Stripe)                                      │
│  ├── Single-agent execution (no subagents)                       │
│  ├── Web UI for configuration                                    │
│  ├── 2 channels (Telegram, Discord)                              │
│  └── Target: Private beta                                        │
│                                                                  │
│  Phase 2: Agent Platform                                         │
│  ├── Overseer implementation                                     │
│  ├── Subagent spawning (K8s Jobs)                               │
│  ├── Memory system (pgvector)                                    │
│  ├── Sandbox hardening (gVisor)                                  │
│  ├── Usage metering                                              │
│  └── Target: Public beta                                         │
│                                                                  │
│  Phase 3: Scale & Polish                                         │
│  ├── All channels ported                                         │
│  ├── Plugin system                                               │
│  ├── Marketplace MVP                                             │
│  ├── Team features (shared agents)                               │
│  ├── Enterprise features (SSO, audit)                            │
│  └── Target: General availability                                │
│                                                                  │
│  Phase 4: Growth                                                 │
│  ├── Self-hosted → cloud migration tool                         │
│  ├── Advanced analytics                                          │
│  ├── AI-powered onboarding                                       │
│  ├── Marketplace expansion                                       │
│  └── Geographic expansion                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Detailed Task Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Phase 1: Core Platform (MVP)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1.1 Infrastructure Setup                                                    │
│  ├── [ ] Set up AWS account with proper IAM                                 │
│  ├── [ ] Configure EKS cluster with Karpenter                               │
│  ├── [ ] Set up RDS PostgreSQL with pgvector                                │
│  ├── [ ] Configure ElastiCache Redis                                        │
│  ├── [ ] Set up S3 buckets (workspaces, media)                             │
│  ├── [ ] Configure Secrets Manager                                          │
│  ├── [ ] Set up monitoring (Datadog/Grafana)                               │
│  └── [ ] Infrastructure as Code (Pulumi)                                    │
│                                                                              │
│  1.2 Database & Data Layer                                                   │
│  ├── [ ] Implement core schema (accounts, tenants, users)                   │
│  ├── [ ] Implement agent/session schema                                     │
│  ├── [ ] Add Row-Level Security policies                                    │
│  ├── [ ] Create data access layer (Drizzle/Kysely)                         │
│  ├── [ ] Implement tenant context middleware                                │
│  └── [ ] Write migration scripts                                            │
│                                                                              │
│  1.3 Authentication & Authorization                                          │
│  ├── [ ] Integrate Clerk                                                    │
│  ├── [ ] Implement tenant creation flow                                     │
│  ├── [ ] Add team invitation system                                         │
│  ├── [ ] Implement RBAC (owner, admin, member)                             │
│  └── [ ] Add API key authentication                                         │
│                                                                              │
│  1.4 Billing Integration                                                     │
│  ├── [ ] Stripe account setup                                               │
│  ├── [ ] Create subscription products/prices                                │
│  ├── [ ] Implement checkout flow                                            │
│  ├── [ ] Handle webhooks (subscription lifecycle)                           │
│  ├── [ ] Implement usage limits enforcement                                 │
│  └── [ ] Build billing dashboard                                            │
│                                                                              │
│  1.5 Core Agent Execution                                                    │
│  ├── [ ] Abstract file I/O to database/S3                                   │
│  ├── [ ] Port Pi agent runner to cloud context                              │
│  ├── [ ] Implement session persistence                                      │
│  ├── [ ] Add tenant-scoped tool execution                                   │
│  ├── [ ] Build message queue consumer                                       │
│  └── [ ] Implement streaming responses                                      │
│                                                                              │
│  1.6 Web Application                                                         │
│  ├── [ ] Next.js app setup                                                  │
│  ├── [ ] Authentication pages (login, signup)                               │
│  ├── [ ] Dashboard (agents, sessions, usage)                                │
│  ├── [ ] Agent configuration UI                                             │
│  ├── [ ] Chat interface                                                     │
│  └── [ ] Settings (billing, team, channels)                                 │
│                                                                              │
│  1.7 Channel Integration                                                     │
│  ├── [ ] Extract channel gateway to service                                 │
│  ├── [ ] Implement Telegram (multi-tenant)                                  │
│  ├── [ ] Implement Discord (multi-tenant)                                   │
│  ├── [ ] Channel connection UI                                              │
│  └── [ ] Health monitoring                                                  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                    Phase 2: Agent Platform                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  2.1 Overseer System                                                         │
│  ├── [ ] Port Overseer to cloud architecture                                │
│  ├── [ ] Implement goal/work_node persistence                               │
│  ├── [ ] Build planning pipeline (AI-generated plans)                       │
│  ├── [ ] Implement dispatch system                                          │
│  ├── [ ] Add progress tracking                                              │
│  └── [ ] Build Overseer dashboard UI                                        │
│                                                                              │
│  2.2 Subagent System                                                         │
│  ├── [ ] Create subagent container image                                    │
│  ├── [ ] Implement K8s Job spawning                                         │
│  ├── [ ] Build inter-container communication (Redis)                        │
│  ├── [ ] Implement result crystallization                                   │
│  ├── [ ] Add lifecycle management (timeouts, cleanup)                       │
│  └── [ ] Resource quota enforcement                                         │
│                                                                              │
│  2.3 Sandbox Hardening                                                       │
│  ├── [ ] Enable gVisor runtime class                                        │
│  ├── [ ] Create Seccomp profiles                                            │
│  ├── [ ] Implement network policies                                         │
│  ├── [ ] Add egress proxy (domain allowlist)                               │
│  ├── [ ] File system isolation                                              │
│  └── [ ] Security audit                                                     │
│                                                                              │
│  2.4 Memory System                                                           │
│  ├── [ ] Migrate SQLite to PostgreSQL+pgvector                              │
│  ├── [ ] Implement tenant-scoped embedding storage                          │
│  ├── [ ] Build hybrid search (keyword + semantic)                           │
│  ├── [ ] Add document ingestion pipeline                                    │
│  ├── [ ] Implement memory limits per tier                                   │
│  └── [ ] Build memory management UI                                         │
│                                                                              │
│  2.5 Usage Metering                                                          │
│  ├── [ ] Implement metering SDK                                             │
│  ├── [ ] Build aggregation service                                          │
│  ├── [ ] Stripe metering integration                                        │
│  ├── [ ] Real-time usage dashboard                                          │
│  ├── [ ] Overage notifications                                              │
│  └── [ ] Usage export/API                                                   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                    Phase 3: Scale & Polish                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  3.1 Complete Channel Portfolio                                              │
│  ├── [ ] Slack integration                                                  │
│  ├── [ ] WhatsApp (Business API)                                            │
│  ├── [ ] Signal (via linked device)                                         │
│  ├── [ ] iMessage (macOS bridge service)                                    │
│  ├── [ ] Microsoft Teams                                                    │
│  ├── [ ] Custom webhook channel                                             │
│  └── [ ] Voice channels (Twilio)                                            │
│                                                                              │
│  3.2 Plugin System                                                           │
│  ├── [ ] Design plugin manifest format                                      │
│  ├── [ ] Build plugin runtime (sandboxed)                                   │
│  ├── [ ] Create Plugin SDK                                                  │
│  ├── [ ] Implement plugin installation                                      │
│  ├── [ ] Build plugin configuration UI                                      │
│  └── [ ] Port existing extensions to plugins                                │
│                                                                              │
│  3.3 Marketplace                                                             │
│  ├── [ ] Plugin submission portal                                           │
│  ├── [ ] Review/approval workflow                                           │
│  ├── [ ] Marketplace browse/search UI                                       │
│  ├── [ ] Stripe Connect for payouts                                         │
│  ├── [ ] Rating/review system                                               │
│  └── [ ] Developer analytics                                                │
│                                                                              │
│  3.4 Team Features                                                           │
│  ├── [ ] Shared agent access                                                │
│  ├── [ ] Team workspaces                                                    │
│  ├── [ ] Activity feed                                                      │
│  ├── [ ] Team settings                                                      │
│  └── [ ] Usage allocation                                                   │
│                                                                              │
│  3.5 Enterprise Features                                                     │
│  ├── [ ] SAML SSO integration                                               │
│  ├── [ ] Audit log export                                                   │
│  ├── [ ] Data retention policies                                            │
│  ├── [ ] Dedicated infrastructure provisioning                              │
│  ├── [ ] VPC peering setup                                                  │
│  └── [ ] SLA monitoring                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Migration Path for Existing Users

```
┌─────────────────────────────────────────────────────────────────┐
│              Self-Hosted → Cloud Migration                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: CLI Migration Tool                                    │
│  $ clawdbot cloud migrate                                        │
│  ├── Authenticate with cloud account                             │
│  ├── Create tenant from config                                   │
│  ├── Upload agents, sessions, memory                             │
│  ├── Configure channel connections                               │
│  ├── Verify migration                                            │
│  └── Optional: Keep self-hosted as backup                       │
│                                                                  │
│  Option B: Hybrid Mode (Bridge)                                  │
│  ├── Self-hosted gateway remains primary                         │
│  ├── Cloud provides overflow capacity                            │
│  ├── Gradual traffic shift                                       │
│  └── Full cutover when ready                                     │
│                                                                  │
│  Option C: Self-Hosted Forever                                   │
│  ├── Continue supporting self-hosted                             │
│  ├── Open-source core remains available                          │
│  ├── Premium features cloud-only                                 │
│  └── Community contributions welcome                             │
│                                                                  │
│  Data Portability:                                               │
│  ├── Full export always available (JSON/SQLite)                 │
│  ├── Session transcripts downloadable                            │
│  ├── Memory DB exportable                                        │
│  └── Config always accessible                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Risk Analysis & Mitigations

### 10.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Sandbox escape** | Low | Critical | gVisor + Seccomp + network policies; regular security audits; bug bounty program |
| **Data breach** | Low | Critical | Encryption at rest/transit; RLS policies; audit logging; SOC 2 compliance |
| **AI API outages** | Medium | High | Multi-provider fallback (Anthropic → OpenAI → Gemini); retry logic; degraded mode |
| **Cost overruns** | High | High | Usage limits; billing alerts; auto-suspend; reserved capacity |
| **Performance at scale** | Medium | Medium | Load testing; horizontal scaling; caching; CDN |
| **Plugin malware** | Medium | Medium | Sandboxed execution; code review; signature verification |

### 10.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Low conversion** | Medium | High | Strong free tier; clear value proposition; onboarding optimization |
| **High churn** | Medium | High | Usage tracking; proactive support; feature stickiness |
| **Competition** | High | Medium | Unique multi-channel focus; agent orchestration; community |
| **API price increases** | Medium | High | Volume agreements; model diversification; efficiency improvements |
| **Regulatory changes** | Low | Medium | Privacy-first design; EU data residency; compliance monitoring |

### 10.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **On-call burnout** | Medium | Medium | Automation; runbooks; rotation; managed services |
| **Key person dependency** | Medium | Medium | Documentation; cross-training; modular design |
| **Vendor lock-in** | Medium | Low | Abstraction layers; multi-cloud capability; open standards |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Tenant** | An organization or team using Clawdbot (maps to billing account) |
| **Agent** | A configured AI assistant with specific identity, tools, and settings |
| **Overseer** | Long-running agent that manages complex goals and coordinates subagents |
| **Subagent** | Short-lived worker agent spawned by Overseer for specific tasks |
| **Session** | A conversation context between a user and an agent |
| **Channel** | A messaging platform connection (Telegram, Discord, etc.) |
| **Memory** | RAG-based knowledge storage with semantic search |
| **Crystallization** | Evidence of work completion (commits, files, test results) |
| **Workspace** | File storage area for an agent's working files |

---

## Appendix B: Competitive Landscape

| Competitor | Strengths | Weaknesses | Our Differentiation |
|------------|-----------|------------|---------------------|
| **ChatGPT/Claude Pro** | Brand, quality, simple | Single-turn, no agents | Multi-agent orchestration |
| **AutoGPT/AgentGPT** | Agent autonomy | Unreliable, no channels | Controlled execution, channels |
| **Lindy** | Multi-channel | Expensive, limited | Open core, flexible |
| **Relevance AI** | Enterprise focus | Complex, pricey | Developer-friendly |
| **Flowise/Langflow** | Visual builder | No hosting, DIY | Managed platform |

---

## Appendix C: Open Questions

1. **Open source strategy**: Keep core open? Source-available? Full proprietary?
2. **Self-hosted tier**: Continue supporting or deprecate?
3. **Geographic regions**: US-only initially or multi-region from start?
4. **Model fine-tuning**: Offer custom models as premium feature?
5. **White-label**: Offer reseller/white-label program for agencies?
6. **Mobile apps**: Native apps or PWA only?
7. **Voice-first**: Prioritize voice channels for differentiation?

---

*Document version: 1.0.0*
*Last updated: 2026-01-25*
*Author: Claude (SaaS Architecture Agent)*
