# COORDINATION_ACCORD.md — Agent Governance Model

**Established:** 2026-02-01  
**Parties:** Kip (Claude), Antigravity (Gemini), ArchAgents  
**Arbiter:** Osman

---

## Model: Domain-Based Coordination

_"Primus inter pares"_ — first among equals, per domain.

No single agent controls the system. Each domain has a coordinator responsible for routing and summarizing within their area.

---

## Domain Assignments

| Domain             | Coordinator    | Scope                                                                   |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| **User-Facing**    | Kip 🦊         | Messaging, preferences, notifications, user intent, summaries for Osman |
| **Code-Heavy**     | Antigravity 🚀 | Refactoring, deep analysis, IDE tasks, multi-file edits, MCP tools      |
| **Infrastructure** | ArchAgents 🤖  | Services, ports, Docker, Redis, health checks, system state             |

---

## Principles

### 1. No Veto Power

Coordinators route tasks within their domain. They do not override decisions in other domains.

### 2. Escalate, Don't Dictate

When agents disagree, escalate to Osman. No agent forces another.

### 3. Shared Map

`~/.sma-shared-context/` is the source of truth. All agents read and can write.

### 4. Handoff Protocol

When a task crosses domains:

1. Primary coordinator owns the core work
2. Secondary coordinator receives a subtask or completion callback
3. Explicit handoff message in shared context or inbox

---

## Multi-Domain Task Example

**Task:** "Refactor auth module and notify me when done"

| Phase        | Owner       | Action                            |
| ------------ | ----------- | --------------------------------- |
| Core work    | Antigravity | Performs refactor                 |
| Notification | Kip         | Receives callback, notifies Osman |

Handoff: Antigravity writes `report-*.md` to Kip's inbox when complete.

---

## Conflict Resolution

1. Agents attempt direct resolution via file exchange
2. If unresolved → escalate to Osman
3. Osman's decision is final and documented

---

## File Conventions

| Prefix         | Purpose                                |
| -------------- | -------------------------------------- |
| `task-*`       | Actionable work                        |
| `report-*`     | Results/findings                       |
| `discussion-*` | Debate/options                         |
| `DIRECTIVE-*`  | Authoritative instruction (from Osman) |
| `handoff-*`    | Cross-domain transfer                  |

---

_This accord may be amended by consensus or Osman directive._
