---
name: project-coordinator
description: "Initialize and manage multi-agent projects with RACI-based team coordination. Auto-generates REGISTRY, RESPONSIBILITIES, and handles agent spawning."
metadata: { "openclaw": { "emoji": "📋", "always": false, "skillKey": "project" } }
user-invocable: true
---

# Project Coordinator — Multi-Agent Team Management

Framework for coordinating projects across multiple specialized agents using RACI matrices and automatic delegation.

## Features

✅ **Project initialization** from YAML templates  
✅ **RACI matrix** auto-generation  
✅ **Agent registry** per project  
✅ **Automatic spawning** with task delegation  
✅ **Progress tracking** against success criteria  
✅ **Escalation routing** based on risk levels  
✅ **Standup scheduling** (daily/weekly)

---

## Usage

### Initialize a Project from Template

```bash
openclaw project init my-project \
  --template /path/to/template.yaml \
  --output ./my-project/
```

This generates:

- `REGISTRY.md` — Agent profiles & team structure
- `RESPONSIBILITIES.md` — RACI matrix & escalation rules
- `ACTION_PLAN.md` — Day-by-day task breakdown (if applicable)

### Spawn All Team Members

```bash
# Spawn all agents with project briefing
openclaw project spawn my-project \
  --action briefing \
  --model sonnet
```

### Run Daily Standup

```bash
# Generate standup from project config
openclaw project standup my-project \
  --date 2026-02-06 \
  --format slack
```

### View Project Status

```bash
# Overall dashboard
openclaw project status my-project

# Detailed metrics
openclaw project metrics my-project \
  --format json
```

---

## Project Template Format (YAML)

See `projects/README.md` for complete schema. Example structure:

```yaml
# Identification
name: my-project # Machine-readable ID
displayName: "My Project Name" # Human-readable
description: "What we're building"

# Timeline
timeline:
  startDate: "2026-02-06"
  endDate: "2026-02-12"
  duration: "1 week"
  timezone: "America/Vancouver"

# Goal
goal: "High-level objective for this project"

# Team
team:
  lead: coordinator-agent-id
  members:
    - id: agent-name
      role: "Agent Role"
      responsibility: "What they own"
      hoursPerWeek: 40

# RACI Matrix
raci:
  - task: "Something"
    responsible: agent-name
    accountable: agent-name
    consulted: [agent1, agent2]
    informed: [agent3]
    priority: HIGH
    dueDate: "2026-02-12T18:00:00Z"

# Success Metrics
successCriteria:
  - id: "metric-id"
    title: "Metric Name"
    goal: "Target value"
    current: "Current value"
    owner: agent-name

# Schedule
schedule:
  standup:
    time: "09:00"
    format: "slack"
    daysOfWeek: [Monday, Tuesday, Wednesday, Thursday, Friday]
  review:
    time: "17:00"
    daysOfWeek: [Friday]

# Escalation Rules
escalation:
  low_risk:
    definition: "Task impact < 2 hours"
    process: "Owner decides independently"
  medium_risk:
    definition: "Task impact 2-48 hours"
    process: "Owner proposes, accountable reviews"
  high_risk:
    definition: "Task impact > 48 hours or strategic"
    process: "Owner proposes, accountable + lead approve"
  blocker:
    definition: "Blocks other team members"
    process: "Escalate immediately to lead"

# Deliverables
deliverables:
  - name: "Deliverable 1"
    description: "What it is"
    owner: agent-name
    dueDate: "2026-02-12T18:00:00Z"
```

---

## Generated REGISTRY.md

Auto-generated agent registry for your project:

```markdown
# Project Registry: My Project

## Quick Reference

| Agent      | Role       | Status    | Responsibility |
| ---------- | ---------- | --------- | -------------- |
| agent-name | Role Title | 🟢 Online | What they do   |
| ...        | ...        | ...       | ...            |

## Detailed Profiles

### agent-name — Role Title

**Status:** 🟢 Online  
**Role:** Agent Role  
**Responsibility:** What they own  
**Tasks:**

- [ ] Task 1
- [ ] Task 2
      **Accountability:** What they're responsible for  
       **Works With:** [other agents]  
       **Response Time:** < X hours
```

---

## Generated RESPONSIBILITIES.md (RACI)

Auto-generated RACI matrix:

```markdown
# RESPONSIBILITIES.md — RACI Matrix

## RACI Legend

- **R** = Responsible (does work)
- **A** = Accountable (signs off, single per task)
- **C** = Consulted (provides input)
- **I** = Informed (notified after)

## Matrix

| Task   | Responsible | Accountable | Consulted | Informed |
| ------ | ----------- | ----------- | --------- | -------- |
| Task 1 | agent1      | agent1      | agent2    | agent3   |
| Task 2 | agent2      | agent2      | agent1    | agent3   |

## Escalation Rules

**Low Risk:** Owner decides autonomously  
**Medium Risk:** Owner proposes, accountable reviews  
**High Risk:** Owner proposes, accountable + lead approve  
**Blocker:** Escalate immediately to lead
```

---

## Integration with team-coordinator

This skill works with `team-coordinator` for agent spawning:

```typescript
// After REGISTRY is generated, spawn agents:

sessions_spawn({
  agentId: "coordinator-agent",
  task: "Lead the project...",
  label: "My Project: Leadership",
});

sessions_spawn({
  agentId: "team-member-1",
  task: "Work on task X...",
  label: "My Project: Feature A",
});

// ... more agents as needed
```

---

## RACI Best Practices

### Every Task Needs:

✅ **Exactly 1 Accountable** — Single decision-maker  
✅ **Responsible identified** — Someone does the work  
✅ **Consulted specified** — Who provides input  
✅ **Informed listed** — Who gets notified

### Avoid:

❌ Multiple Accountables per task  
❌ "Everyone" for Consulted/Informed  
❌ Unclear Responsible role  
❌ Missing escalation paths

### Examples

**Good RACI:**

```
Task: "Implement feature X"
- Responsible: backend-architect (does the coding)
- Accountable: backend-architect (signs off)
- Consulted: qa-lead (validates approach)
- Informed: frontend-architect (needs to integrate)
```

**Bad RACI:**

```
Task: "Implement feature X"
- Responsible: "everyone"  ← UNCLEAR
- Accountable: "team"  ← MULTIPLE, NOT SINGLE
- Consulted: "everyone"  ← TOO MANY
- Informed: [not specified]  ← MISSING
```

---

## Escalation Rules

Define how decisions get made based on impact:

```yaml
escalation:
  low_risk:
    definition: "< 2 hours impact, single owner"
    process: "Owner decides independently, notify same day"
    examples:
      - "Writing test for specific function"
      - "Fixing linting violation"
      - "Updating documentation"

  medium_risk:
    definition: "2-48 hours impact, multiple teams"
    process: "Owner proposes, accountable reviews (< 2 hour turnaround)"
    examples:
      - "New testing approach"
      - "Configuration changes"
      - "Module refactoring"

  high_risk:
    definition: "> 48 hours impact or strategic"
    process: "Owner proposes, accountable + lead approve (synchronous)"
    examples:
      - "Infrastructure changes"
      - "Architecture redesign"
      - "Tool/framework change"

  blocker:
    definition: "Prevents other team members from working"
    process: "Escalate immediately to lead (15-min resolution target)"
    examples:
      - "Build system broken"
      - "Critical dependency missing"
      - "Production issue"
```

---

## Daily Standup Format

Template for async daily updates:

```
📅 DATE: [date] | DAY: [n/N]

✅ YESTERDAY
- [what I completed]
- [deliverables shipped]

🏗️ TODAY
- [what I'm working on]
- [task focus]

🔴 BLOCKERS
- [any issues]
- [asks for help]

📊 METRICS
- [progress vs targets]
```

Deliver via Slack/Telegram/Discord to keep async transparency.

---

## Success Criteria Template

Every project should have measurable goals:

```yaml
successCriteria:
  - id: "metric-1"
    title: "Unit Test Coverage"
    goal: "80%"
    current: "65%"
    metric: "Percentage"
    owner: backend-lead

  - id: "metric-2"
    title: "Component Tests"
    goal: "100+"
    current: "10"
    metric: "Count"
    owner: frontend-lead

  - id: "metric-3"
    title: "Issues Resolved"
    goal: "30"
    current: "0"
    metric: "Count"
    owner: qa-lead
```

---

## Project Lifecycle

### Phase 1: Planning (Day -1)

1. Create YAML template
2. Define team & RACI
3. Set success criteria
4. Schedule standups

### Phase 2: Execution (Day 1-N)

1. Kick off meeting
2. Daily standups
3. Escalate blockers
4. Track progress

### Phase 3: Closure (Final day)

1. Review meeting
2. Consolidate metrics
3. Generate final report
4. Document lessons learned

---

## Integration Points

- **team-coordinator** skill — Agent hierarchy & delegation
- **sessions_spawn** — Spawn agents with tasks
- **message tool** — Send status updates (Slack, Telegram, Discord)
- **cron** — Schedule standups & reviews
- **REGISTRY.md** — Agent discovery per project
- **RESPONSIBILITIES.md** — RACI enforcement

---

## See Also

- **projects/README.md** — Framework overview & best practices
- **team-coordinator** — Hierarchical agent delegation
- **delegate** — Simple task delegation
- **session-logs** — Track agent activity
