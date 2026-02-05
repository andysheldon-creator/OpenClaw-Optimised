---
name: workflow
description: "Project workflow and process management skill. Coordinates sprints, releases, and multi-agent collaboration."
metadata: { "openclaw": { "emoji": "📋", "always": true, "skillKey": "workflow" } }
user-invocable: true
---

# Skill: Workflow Management

Coordinate sprints, releases, and multi-agent collaboration.

## Execution Flow

```
TASK RECEIVED
      ↓
UNDERSTAND (read existing code, 70% of time)
      ↓
PLAN (create task breakdown)
      ↓
DELEGATE (spawn appropriate agents)
      ↓
EXECUTE (parallel implementation)
      ↓
VALIDATE (lint + typecheck + test + build)
      ↓
DELIVER (commit or report)
```

## Complexity Scale

| Complexity | Criteria                 | Approach                               |
| ---------- | ------------------------ | -------------------------------------- |
| Simple     | 1-2 files, bug fix       | Execute directly                       |
| Medium     | 3-5 files, small feature | 3 agents, parallel                     |
| Complex    | 6+ files, full feature   | Plan → approve → phased implementation |

## Workflow by Type

### New Feature

```
Read context → Plan → [Database →] Backend → Frontend → Tests → Validate → Commit
```

### Bug Fix

```
Reproduce → Diagnose ROOT cause → Minimal fix → Regression test → Validate → Commit
```

### Refactoring

```
Ensure tests exist → Refactor incrementally → Tests after each change → Commit
```

## Sprint Planning

```markdown
## Sprint [N]: [Theme]

### Goals

1. [Goal 1]
2. [Goal 2]

### Tasks

| ID  | Task   | Owner   | Status         | Priority |
| --- | ------ | ------- | -------------- | -------- |
| T1  | [Task] | [Agent] | 🔵 Todo        | P1       |
| T2  | [Task] | [Agent] | 🟡 In Progress | P1       |
| T3  | [Task] | [Agent] | 🟢 Done        | P2       |

### Dependencies

- T2 blocks T3
- T1 requires external API

### Risks

- [Risk 1]: Mitigation
```

## Release Workflow

```markdown
## Release v[X.Y.Z]

### Pre-Release Checklist

- [ ] All features complete
- [ ] All tests passing
- [ ] Security review done
- [ ] Performance validated
- [ ] Documentation updated
- [ ] Changelog updated

### Release Steps

1. Create release branch
2. Final validation
3. Update version numbers
4. Create tag
5. Deploy to staging
6. Smoke tests
7. Deploy to production
8. Monitor for issues

### Rollback Plan

- Revert to v[previous]
- Notify stakeholders
- Document incident
```

## Multi-Agent Coordination

### Parallel Work Pattern

```typescript
// Independent tasks - spawn in parallel
sessions_spawn({ task: "Database schema", agentId: "database-engineer", label: "DB" });
sessions_spawn({ task: "API design", agentId: "backend-architect", label: "API" });
sessions_spawn({ task: "UI wireframes", agentId: "ux-designer", label: "UX" });
```

### Sequential Work Pattern

```typescript
// Dependent tasks - wait for each
const dbResult = await sessions_spawn({ task: "Create tables", agentId: "database-engineer" });
const apiResult = await sessions_spawn({
  task: "Build API using the schema",
  agentId: "backend-architect",
});
const uiResult = await sessions_spawn({
  task: "Build UI using the API",
  agentId: "frontend-architect",
});
```

### Review Chain

```typescript
// Implementation → Quality → Security → Approval
sessions_spawn({ task: "Implement feature", agentId: "backend-architect" });
// After completion:
sessions_spawn({ task: "Quality review", agentId: "quality-engineer" });
sessions_spawn({ task: "Security review", agentId: "security-engineer" });
```

## Delegation

```typescript
// Sprint planning
sessions_spawn({
  task: "Break down the user authentication epic into sprint tasks. Estimate complexity and assign to appropriate agents.",
  agentId: "scrum-master",
  model: "anthropic/claude-haiku-4-5",
  label: "Sprint Planning",
});

// Release coordination
sessions_spawn({
  task: "Prepare release v2.0.0. Update changelog, version numbers, create release notes.",
  agentId: "release-manager",
  model: "anthropic/claude-haiku-4-5",
  label: "Release Prep",
});

// Technical coordination
sessions_spawn({
  task: "Coordinate the backend refactoring. Ensure tests pass after each change, no breaking changes.",
  agentId: "tech-lead",
  model: "anthropic/claude-sonnet-4-5",
  label: "Backend Refactor Coordination",
});
```
