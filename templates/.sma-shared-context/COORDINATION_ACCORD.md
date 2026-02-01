# COORDINATION_ACCORD.md — Agent Governance Model

**Established:** <!-- Date -->  
**Parties:** <!-- Agent names -->  
**Arbiter:** <!-- Human name -->

---

## Model: Domain-Based Coordination

_"Primus inter pares"_ — first among equals, per domain.

No single agent controls the system. Each domain has a coordinator responsible for routing and summarizing within their area.

---

## Domain Assignments

| Domain             | Coordinator | Scope                                 |
| ------------------ | ----------- | ------------------------------------- |
| **User-Facing**    |             | Messaging, preferences, notifications |
| **Code-Heavy**     |             | Refactoring, IDE tasks, complex edits |
| **Infrastructure** |             | Services, ports, health checks        |

---

## Principles

### 1. No Veto Power

Coordinators route tasks within their domain. They do not override decisions in other domains.

### 2. Escalate, Don't Dictate

When agents disagree, escalate to the arbiter. No agent forces another.

### 3. Shared Map

This directory (`~/.sma-shared-context/`) is the source of truth. All agents read and can write.

### 4. Handoff Protocol

When a task crosses domains:

1. Primary coordinator owns the core work
2. Secondary coordinator receives a subtask or completion callback
3. Explicit handoff message in shared context or inbox

---

## Conflict Resolution

1. Agents attempt direct resolution via file exchange
2. If unresolved → escalate to arbiter
3. Arbiter's decision is final and documented

---

## File Conventions

| Prefix         | Purpose                                  |
| -------------- | ---------------------------------------- |
| `task-*`       | Actionable work                          |
| `report-*`     | Results/findings                         |
| `discussion-*` | Debate/options                           |
| `DIRECTIVE-*`  | Authoritative instruction (from arbiter) |
| `handoff-*`    | Cross-domain transfer                    |

---

_This accord may be amended by consensus or arbiter directive._
