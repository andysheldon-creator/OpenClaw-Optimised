---
name: delegate
description: "Delegate tasks to specialized sub-agents using sessions_spawn. Automatically selects the right agent based on task domain."
metadata: { "openclaw": { "emoji": "📤", "always": true, "skillKey": "delegate" } }
user-invocable: true
---

# Skill: Task Delegation

Delegate tasks to specialized sub-agents using `sessions_spawn`.

## Quick Reference

### By Domain

| Domain           | Agent                | Model  |
| ---------------- | -------------------- | ------ |
| **Architecture** | system-architect     | opus   |
| **Backend/API**  | backend-architect    | opus   |
| **Frontend/UI**  | frontend-architect   | sonnet |
| **Database**     | database-engineer    | sonnet |
| **Security**     | security-engineer    | opus   |
| **Auth**         | auth-specialist      | sonnet |
| **Testing**      | testing-specialist   | sonnet |
| **Performance**  | performance-engineer | sonnet |
| **DevOps**       | devops-engineer      | haiku  |
| **Trading**      | trading-engine       | opus   |
| **AI/ML**        | ai-engineer          | sonnet |
| **Charts**       | charts-specialist    | haiku  |
| **Data**         | data-engineer        | sonnet |
| **UX**           | ux-designer          | sonnet |
| **Product**      | product-manager      | sonnet |
| **Docs**         | technical-writer     | sonnet |
| **Git**          | git-specialist       | haiku  |
| **Release**      | release-manager      | haiku  |
| **Debugging**    | root-cause-analyst   | opus   |
| **Research**     | deep-research        | opus   |

## Usage

```typescript
// Basic delegation
sessions_spawn({
  task: "Your task description here",
  agentId: "agent-name",
  label: "Short Label",
});

// With model override
sessions_spawn({
  task: "Complex architectural decision",
  agentId: "system-architect",
  model: "anthropic/claude-opus-4-5",
  label: "Architecture",
});

// With timeout
sessions_spawn({
  task: "Quick lookup",
  agentId: "git-specialist",
  runTimeoutSeconds: 120,
  label: "Git Info",
});
```

## Delegation Patterns

### Single Agent

```typescript
// One specialist for focused task
sessions_spawn({
  task: "Create database migration for user preferences table",
  agentId: "database-engineer",
  label: "DB Migration",
});
```

### Parallel Agents

```typescript
// Multiple independent tasks at once
sessions_spawn({ task: "Design API schema", agentId: "backend-architect", label: "API" });
sessions_spawn({ task: "Design database schema", agentId: "database-engineer", label: "DB" });
sessions_spawn({ task: "Create wireframes", agentId: "ux-designer", label: "UX" });
```

### Sequential Agents

```typescript
// Dependent tasks in order
// 1. First, design
sessions_spawn({
  task: "Design the feature architecture",
  agentId: "system-architect",
  label: "Design",
});
// 2. Wait, then implement
sessions_spawn({
  task: "Implement based on the design",
  agentId: "backend-architect",
  label: "Impl",
});
// 3. Finally, test
sessions_spawn({
  task: "Create comprehensive tests",
  agentId: "testing-specialist",
  label: "Tests",
});
```

### Review Chain

```typescript
// Implementation with reviews
sessions_spawn({ task: "Implement the feature", agentId: "backend-architect", label: "Dev" });
// Quality review
sessions_spawn({ task: "Review code quality", agentId: "quality-engineer", label: "QA" });
// Security review (for auth/financial)
sessions_spawn({ task: "Security audit", agentId: "security-engineer", label: "Security" });
```

## Model Selection Guide

| Use Case             | Model  | Agents                                                    |
| -------------------- | ------ | --------------------------------------------------------- |
| Strategic decisions  | opus   | ceo, cto, ciso, cpo                                       |
| Complex architecture | opus   | system-architect, software-architect, backend-architect   |
| Security critical    | opus   | security-engineer                                         |
| Most development     | sonnet | frontend-architect, database-engineer, testing-specialist |
| Quick lookups        | haiku  | git-specialist, devops-engineer, charts-specialist        |
| Simple tasks         | haiku  | release-manager, ui-components                            |

## Best Practices

1. **Match domain to specialist** — Don't send frontend work to backend-architect
2. **Use appropriate model** — Don't use opus for simple tasks
3. **Clear task descriptions** — Be specific about what you need
4. **Meaningful labels** — Short, descriptive labels for tracking
5. **Parallel when independent** — Spawn multiple if tasks don't depend on each other
6. **Sequential when dependent** — Wait for prerequisites before next step
