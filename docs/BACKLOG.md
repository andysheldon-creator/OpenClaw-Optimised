# Feature Backlog — OpenClaw-Optimised

## How to Use
- Add new items at the bottom of the appropriate priority section
- Move items to "In Progress" when you start a branch
- Update actual time when the feature merges to main
- Archive completed items monthly

---

## P1 - High (Phase 2 MITRE ATLAS)

| Field | Value |
|-------|-------|
| ID | FB-008 |
| Title | Prompt injection detection |
| Description | Implement pattern-based prompt injection detection on all inputs (messages, web scrapes, skill outputs). No input sanitisation exists currently. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 4h |
| Branch | fix/prompt-injection-detection |
| Blocks | AML.CS0051 (Incident 4) |

| Field | Value |
|-------|-------|
| ID | FB-009 |
| Title | Memory source provenance |
| Description | Add source_type and trust_level fields to memory store schema. Differentiate between user, web, skill, and system sources. Currently all data treated with equal trust. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 3h |
| Branch | fix/memory-source-provenance |
| Blocks | AML.CS0051 (Incident 4) |

| Field | Value |
|-------|-------|
| ID | FB-010 |
| Title | Human-in-the-loop for destructive operations |
| Description | Require explicit user confirmation for high-privilege operations (bash, messaging, config changes). Currently only soft prompt guidance in AGENTS.md. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 4h |
| Branch | fix/human-in-the-loop |
| Blocks | All incidents |

| Field | Value |
|-------|-------|
| ID | FB-011 |
| Title | Skill signature verification |
| Description | Implement GPG or hash-based integrity verification for skills loaded from filesystem and installed via package managers. No verification exists. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 6h |
| Branch | fix/skill-signature-verification |
| Blocks | AML.CS0049 (Incident 2) |

---

## P1 - High (Board of Directors — Multi-Agent System)

| Field | Value |
|-------|-------|
| ID | FB-017 |
| Title | Board of Directors: Specialized Agent Squad |
| Description | Replace single generalist agent with six specialized agents, each with a distinct reasoning framework. General (Orchestrator), Research, Content (CMO), Finance (CFO), Strategy (CEO), Critic (Devil's Advocate). Each maintains its own context and builds expertise over time. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 20h |
| Branch | feature/board-of-directors |

| Field | Value |
|-------|-------|
| ID | FB-018 |
| Title | Telegram Topic-Based Agent Routing |
| Description | In Telegram group chats, each agent gets its own topic. Message the Research topic and the Research agent answers. Route inbound messages by topic ID to the correct specialized agent. Each agent maintains separate conversation context. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 8h |
| Branch | feature/telegram-topic-routing |
| Depends On | FB-017 |

| Field | Value |
|-------|-------|
| ID | FB-019 |
| Title | Board Meetings: Multi-Agent Decision Synthesis |
| Description | User tells the General agent to "run a board meeting" on a topic. General coordinates: Research analyses market, Finance models numbers, Content evaluates positioning, Strategy maps long-term implications, Critic stress-tests. General synthesizes all perspectives into one recommendation. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 12h |
| Branch | feature/board-meetings |
| Depends On | FB-017 |

| Field | Value |
|-------|-------|
| ID | FB-020 |
| Title | Cross-Agent Consultation |
| Description | Agents can invoke each other within defined boundaries. Strategy pulls in Finance to check numbers. Content asks Research for trending data. Critic reviews any agent's output. Implement a consultation protocol with depth limits to prevent infinite loops. |
| Priority | P1 |
| Status | backlog |
| Estimated Time | 8h |
| Branch | feature/agent-consultation |
| Depends On | FB-017 |

---

## P2 - Medium (Phase 3 MITRE ATLAS)

| Field | Value |
|-------|-------|
| ID | FB-012 |
| Title | Command sandboxing for bash tool |
| Description | Add seccomp-bpf or container-based sandboxing for bash tool execution. Agent currently runs as host user with unrestricted shell. |
| Priority | P2 |
| Status | backlog |
| Estimated Time | 8h |
| Branch | fix/bash-sandboxing |

| Field | Value |
|-------|-------|
| ID | FB-013 |
| Title | Trust-weighted RAG retrieval |
| Description | Implement trust-weighted retrieval in RAG system. Currently retrieves by similarity only with no trust filtering. Depends on FB-009. |
| Priority | P2 |
| Status | backlog |
| Estimated Time | 4h |
| Branch | fix/trust-weighted-rag |

| Field | Value |
|-------|-------|
| ID | FB-014 |
| Title | Per-tool permission configuration |
| Description | Add per-tool permission system. Currently all tools available to all contexts with no restrictions based on input source. |
| Priority | P2 |
| Status | backlog |
| Estimated Time | 6h |
| Branch | fix/tool-permissions |

| Field | Value |
|-------|-------|
| ID | FB-015 |
| Title | Encrypt credentials at rest |
| Description | Integrate OS keychain for credential storage instead of plaintext JSON config. |
| Priority | P2 |
| Status | backlog |
| Estimated Time | 6h |
| Branch | fix/credential-encryption |

| Field | Value |
|-------|-------|
| ID | FB-016 |
| Title | Security-focused audit logging |
| Description | Add security telemetry: auth attempts, config changes, tool invocations, rate limit events. Currently only general logging exists. |
| Priority | P2 |
| Status | backlog |
| Estimated Time | 4h |
| Branch | fix/security-audit-logging |

---

## Completed
| ID | Title | Est. | Actual | Branch | Completed |
|----|-------|------|--------|--------|-----------|
| FB-001 | WebSocket Origin validation | 1h | 1h | fix/ws-origin-validation | 2026-02-15 |
| FB-002 | Credential masking in config.get | 1.5h | 1.5h | fix/config-credential-masking | 2026-02-15 |
| FB-003 | Rate limiting on gateway auth | 1h | 1h | fix/gateway-rate-limiting | 2026-02-15 |
| FB-004 | Default auth=password | 1h | 1h | fix/default-auth-password | 2026-02-15 |
| FB-005 | CSRF token for RPC | 2h | 3h | fix/csrf-token-rpc | 2026-02-15 |
| FB-006 | Voicewake test isolation | 0.5h | 0.5h | fix/voicewake-test-isolation | 2026-02-15 |
| FB-007 | .env.example | 0.5h | 0.5h | fix/env-example | 2026-02-15 |
