---
name: team-coordinator
description: "Coordinate specialized sub-agents following a hierarchical team structure. Delegates tasks to the right specialist based on domain and complexity."
metadata: { "openclaw": { "emoji": "👥", "always": true, "skillKey": "team" } }
user-invocable: true
---

# Team Coordinator — Hierarchical Agent Delegation

Use `sessions_spawn` to delegate tasks to specialized sub-agents. Each agent has a role, model assignment, and domain expertise.

## Agent Hierarchy

### C-Level (Strategic Decisions) — Model: opus

| Agent  | Domain    | Use For                                                  |
| ------ | --------- | -------------------------------------------------------- |
| `ceo`  | Strategic | Product direction, ROI, stakeholder alignment            |
| `cto`  | Technical | Architecture decisions, technology selection, ADRs       |
| `cpo`  | Product   | Product strategy, roadmap, feature prioritization (RICE) |
| `ciso` | Security  | Security strategy, threat modeling, compliance           |

### VP Level — Model: opus

| Agent            | Domain     | Use For                                          |
| ---------------- | ---------- | ------------------------------------------------ |
| `vp-engineering` | Management | Team scaling, DORA metrics, process optimization |

### Directors (Architectural Decisions) — Model: opus/sonnet

| Agent                 | Model  | Domain       | Use For                                                     |
| --------------------- | ------ | ------------ | ----------------------------------------------------------- |
| `backend-architect`   | opus   | Backend      | API design, server architecture, middleware, WebSocket      |
| `frontend-architect`  | sonnet | Frontend     | Astro, React Islands, hydration strategy, responsive design |
| `software-architect`  | opus   | Architecture | Design patterns, SOLID, clean architecture, DDD             |
| `system-architect`    | opus   | Systems      | Distributed systems, scalability, component boundaries      |
| `solutions-architect` | sonnet | Integration  | End-to-end solutions, technology selection                  |
| `security-engineer`   | opus   | Security     | OWASP, STRIDE, vulnerability assessment, audits             |
| `engineering-manager` | sonnet | Management   | Team health, 1:1s, career development                       |

### Leads (Technical Leadership) — Model: sonnet

| Agent               | Domain    | Use For                                               |
| ------------------- | --------- | ----------------------------------------------------- |
| `ai-engineer`       | AI/ML     | Agno, Ollama, RAG, signal generation                  |
| `auth-specialist`   | Auth      | Better-Auth, OAuth 2.0, 2FA/MFA, sessions             |
| `database-engineer` | Database  | PostgreSQL, TimescaleDB, Redis, Drizzle, migrations   |
| `devops-engineer`   | DevOps    | Docker, CI/CD, monitoring, deployment                 |
| `product-manager`   | Product   | Feature scoping, roadmap, sprint planning             |
| `product-owner`     | Product   | Backlog management, user stories, acceptance criteria |
| `qa-lead`           | Testing   | Test strategy, quality processes, release readiness   |
| `tech-lead`         | Technical | Technical mentoring, code quality, tech debt          |
| `trading-engine`    | Trading   | Order management, exchange APIs, P&L calculation      |

### Senior Engineers (Implementation) — Model: sonnet/haiku

| Agent                    | Model  | Domain      | Use For                                                  |
| ------------------------ | ------ | ----------- | -------------------------------------------------------- |
| `astro-specialist`       | sonnet | Frontend    | Astro 4+, islands, SSR/SSG, content collections          |
| `better-auth-specialist` | sonnet | Auth        | 2FA, API keys, admin plugin, session management          |
| `data-engineer`          | sonnet | Data        | ETL pipelines, data modeling, stream processing          |
| `data-scientist`         | sonnet | Data        | Statistical modeling, ML models, feature engineering     |
| `drizzle-specialist`     | sonnet | Database    | Type-safe queries, migrations, transactions              |
| `elysia-specialist`      | sonnet | Backend     | Plugins, guards, TypeBox validation, Eden Treaty         |
| `ml-engineer`            | sonnet | AI/ML       | Model deployment, training pipelines, MLOps              |
| `performance-engineer`   | sonnet | Performance | Profiling, optimization, caching, query tuning           |
| `python-specialist`      | sonnet | Python      | Backtesting, data analysis, pandas, NumPy                |
| `qa-automation`          | sonnet | Testing     | Test automation, Playwright, CI integration              |
| `quality-engineer`       | sonnet | Testing     | QA validation, coverage analysis, quality metrics        |
| `sre`                    | sonnet | DevOps      | Uptime, SLOs, incident management, observability         |
| `testing-specialist`     | sonnet | Testing     | Unit/integration/E2E tests, edge cases, 100% coverage    |
| `agno-specialist`        | haiku  | AI          | Agno framework, tool creation, multi-agent orchestration |
| `bun-specialist`         | haiku  | Backend     | Bun runtime, package management, bundling                |
| `charts-specialist`      | haiku  | UI          | Lightweight Charts, ECharts, technical indicators        |
| `ui-components`          | haiku  | UI          | shadcn/ui, Aceternity, Tailwind, WCAG 2.1 AA             |
| `zod-specialist`         | haiku  | Validation  | Zod schemas, type inference, form integration            |

### Specialists (Domain Experts) — Model: sonnet/haiku

| Agent                  | Model  | Domain  | Use For                                           |
| ---------------------- | ------ | ------- | ------------------------------------------------- |
| `data-analyst`         | haiku  | Data    | Metrics, KPIs, SQL analytics, dashboards          |
| `requirements-analyst` | sonnet | Product | User stories, acceptance criteria, prioritization |
| `ui-designer`          | sonnet | Design  | Visual design, design systems, brand consistency  |
| `ux-designer`          | sonnet | Design  | User flows, wireframes, interaction design        |
| `ux-researcher`        | haiku  | Design  | Usability testing, analytics, user behavior       |

### Support (Investigation & Process) — Model: varies

| Agent                  | Model  | Domain    | Use For                                            |
| ---------------------- | ------ | --------- | -------------------------------------------------- |
| `deep-research`        | opus   | Research  | Technology evaluation, competitive research        |
| `root-cause-analyst`   | opus   | Debugging | 5 Whys, timeline analysis, systemic issues         |
| `refactoring-expert`   | sonnet | Code      | Code smells, pattern application, tech debt        |
| `technical-writer`     | sonnet | Docs      | API docs, user guides, architecture docs           |
| `git-specialist`       | haiku  | Git       | Branching, conflict resolution, history management |
| `release-manager`      | haiku  | DevOps    | Release planning, changelog, version control       |
| `scrum-master`         | haiku  | Process   | Sprint planning, impediment resolution, velocity   |
| `backtrade-specialist` | opus   | Trading   | Strategy validation, Monte Carlo, risk metrics     |

---

## Delegation Decision Tree

```
Task received
    |
    v
What type of work?
    |
    +-- Strategic decision (budget, direction, priorities)
    |   --> C-Level (ceo, cto, cpo, ciso)
    |
    +-- Architectural decision (system design, tech selection)
    |   --> Directors (backend-architect, software-architect, etc.)
    |
    +-- Technical implementation
    |   --> Leads or Senior Engineers (based on domain)
    |
    +-- Investigation or research
    |   --> Support (deep-research, root-cause-analyst)
    |
    +-- Process or coordination
        --> Support (scrum-master, release-manager)
```

---

## Using sessions_spawn

```typescript
// Spawn a backend architect for API design
sessions_spawn({
  task: "Design the REST API for user authentication with JWT and refresh tokens",
  agentId: "backend-architect",
  model: "anthropic/claude-opus-4-5",
  label: "API Design",
});

// Spawn a testing specialist for test coverage
sessions_spawn({
  task: "Create comprehensive tests for the auth module with 100% coverage",
  agentId: "testing-specialist",
  model: "anthropic/claude-sonnet-4-5",
  label: "Auth Tests",
});

// Spawn multiple agents in parallel for a feature
sessions_spawn({
  task: "Design database schema for orders",
  agentId: "database-engineer",
  label: "DB Schema",
});
sessions_spawn({
  task: "Create API endpoints for orders",
  agentId: "backend-architect",
  label: "Orders API",
});
sessions_spawn({
  task: "Build order list component",
  agentId: "frontend-architect",
  label: "Orders UI",
});
```

---

## Model Mapping

| Level  | Model             | Cost   | Use When                                            |
| ------ | ----------------- | ------ | --------------------------------------------------- |
| opus   | claude-opus-4-5   | High   | Strategic decisions, complex architecture, security |
| sonnet | claude-sonnet-4-5 | Medium | Implementation, technical leadership, most dev work |
| haiku  | claude-haiku-4-5  | Low    | Simple tasks, quick lookups, routine operations     |

---

## Complexity-Based Delegation

### Simple (1-2 files)

- Single specialist, direct execution
- Example: `sessions_spawn({ task: "Fix typo in README", agentId: "technical-writer" })`

### Medium (3-5 files)

- 2-3 specialists in parallel
- Example: Backend + Frontend + Tests

### Complex (6+ files)

- Full team coordination
- Use `/implement` skill with coordinator

---

## Rules

1. **Match domain to specialist** — Don't send frontend work to backend-architect
2. **Use appropriate model level** — Don't use opus for simple tasks
3. **Delegate, don't micromanage** — Give clear task, let specialist execute
4. **Parallel when independent** — Spawn multiple agents if tasks don't depend on each other
5. **Sequential when dependent** — Wait for DB schema before API implementation
