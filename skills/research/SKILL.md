---
name: research
description: "Deep research and investigation skill. Use for technology evaluation, best practices, competitive analysis, and documentation study."
metadata: { "openclaw": { "emoji": "🔍", "always": true, "skillKey": "research" } }
user-invocable: true
---

# Skill: Deep Research

Use this skill when you need thorough investigation before implementation decisions.

## When to Use

- Technology evaluation (comparing frameworks, libraries, tools)
- Best practices research (patterns, anti-patterns, industry standards)
- Competitive analysis (how do others solve this problem?)
- Documentation study (understanding complex APIs, protocols)
- Root cause analysis (debugging complex issues)

## Research Workflow

### 1. Define the Question

```
Before searching, formulate a clear question:
- What exactly do I need to know?
- What decision will this research inform?
- What are the success criteria?
```

### 2. Multi-Source Research

```
WebSearch --> Current best practices (2024+)
WebFetch --> Official documentation
WebFetch --> GitHub issues/discussions
Grep --> Existing patterns in codebase
```

### 3. Synthesize Findings

```
For each option:
- Pros and cons
- Trade-offs
- Real-world usage examples
- Community sentiment
- Maintenance status
```

### 4. Recommend with Evidence

```
Present findings with:
- Clear recommendation
- Supporting evidence
- Alternatives considered
- Implementation path
```

## Research Templates

### Technology Comparison

```markdown
## Comparing: [Option A] vs [Option B]

### Criteria

| Criterion      | Option A | Option B |
| -------------- | -------- | -------- |
| Performance    | ...      | ...      |
| Bundle size    | ...      | ...      |
| Learning curve | ...      | ...      |
| Community      | ...      | ...      |
| Maintenance    | ...      | ...      |

### Recommendation

Based on [criteria], recommend [Option] because [reasons].

### Sources

- [Link 1]
- [Link 2]
```

### Best Practices Research

```markdown
## Best Practices: [Topic]

### Industry Standards

- [Pattern 1]: Why and when
- [Pattern 2]: Why and when

### Anti-patterns to Avoid

- [Anti-pattern 1]: Why it's problematic
- [Anti-pattern 2]: Better alternative

### Implementation Guidance

[Step-by-step approach]
```

## Delegation

For deep research that requires extended investigation:

```typescript
sessions_spawn({
  task: "Research and compare state management options for Astro + React islands: Nanostores vs Zustand vs custom context. Consider bundle size, hydration, and DX.",
  agentId: "deep-research",
  model: "anthropic/claude-opus-4-5",
  label: "State Management Research",
});
```

## Quality Criteria

Research output must include:

- [ ] Clear question/problem statement
- [ ] Multiple sources consulted
- [ ] Pros/cons for each option
- [ ] Explicit recommendation with reasoning
- [ ] Links to sources
- [ ] Consideration of project constraints
