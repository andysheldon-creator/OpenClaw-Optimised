---
name: implement
description: "Coordinated feature implementation with quality validation. Use to create, develop or implement new functionality with full team delegation."
metadata: { "openclaw": { "emoji": "🔧", "always": true, "skillKey": "implement" } }
user-invocable: true
---

# Skill: Implementation with Quality Gate

## PHASE 0: PRE-ACTION GATE (before everything)

```
MANDATORY questions before starting:
1. "Do I 100% understand what needs to be done?"
   +-- Clear requirements? No ambiguities?
   +-- If NO --> ask user BEFORE continuing
2. "Do I have all necessary context?"
   +-- Read relevant files? Know the patterns?
   +-- If NO --> read more code before proceeding
3. "Does my approach follow existing patterns?"
   +-- Grep confirmed the pattern? Is there precedent?
   +-- If NO --> adjust approach for consistency

ONLY PROCEED when all are YES.
```

## PHASE 1: ANALYSIS (10%)

### Complexity Tree

```
How many files will be affected?
|
+-- 1-2 files --> SIMPLE
|   Action: 1 agent, execute directly
|
+-- 3-5 files --> MEDIUM
|   Action: 3 agents, parallel delegation
|
+-- 6+ files --> COMPLEX
|   Action: 5+ agents, full team coordination
```

### Identify Files

```
Glob(pattern: "**/*.ts", path: "src/modules/$ARGUMENTS")
Grep(pattern: "$ARGUMENTS", output_mode: "files_with_matches")
```

### Consult Documentation

```
WebFetch --> Official docs for main library
WebSearch --> Best practices for the pattern
```

## PHASE 2: DELEGATION (20%)

### Tree: Which agent implements?

```
Type of work?
|
+-- Backend API/routes/service
|   --> sessions_spawn(agentId: "backend-architect")
|
+-- Frontend page/component/island
|   --> sessions_spawn(agentId: "frontend-architect")
|
+-- Database schema/migration/query
|   --> sessions_spawn(agentId: "database-engineer")
|
+-- Auth/session/permission
|   --> sessions_spawn(agentId: "auth-specialist")
|
+-- Trading logic/orders/exchange
|   --> sessions_spawn(agentId: "trading-engine")
|
+-- UI component/styling
|   --> sessions_spawn(agentId: "ui-components")
|
+-- Charts/visualization
|   --> sessions_spawn(agentId: "charts-specialist")
|
+-- AI/ML feature
|   --> sessions_spawn(agentId: "ai-engineer")
|
+-- Tests
|   --> sessions_spawn(agentId: "testing-specialist")
|
+-- Security review
|   --> sessions_spawn(agentId: "security-engineer")
|
+-- Elysia plugin/guard/derive
|   --> sessions_spawn(agentId: "elysia-specialist")
|
+-- Drizzle schema/query/migration
|   --> sessions_spawn(agentId: "drizzle-specialist")
|
+-- Astro page/SSG/SSR/hydration
|   --> sessions_spawn(agentId: "astro-specialist")
|
+-- Zod validation/schema
|   --> sessions_spawn(agentId: "zod-specialist")
|
+-- Performance profiling/optimization
|   --> sessions_spawn(agentId: "performance-engineer")
```

## PHASE 3: EXECUTION (50%)

### Mandatory Patterns

- Backend: Elysia plugins, TypeBox schemas, guards
- Frontend: Astro static-first, React islands, shadcn/ui
- Database: Drizzle ORM, DECIMAL for money, reversible migrations
- Tests: 100% coverage, edge cases, financial precision

### CRITICAL RULE: ZERO LINT ERRORS

```
NEVER deliver code with lint or typecheck errors.
- Run lint AFTER EACH modified file
- Fix ALL errors BEFORE proceeding
- Remove unused imports and variables
- If lint fails, fix immediately (don't ignore)
```

### Continuous Validation

```bash
pnpm lint <file>           # MANDATORY after each file
pnpm typecheck             # MANDATORY after each module
pnpm test <file>.test.ts   # After each function
```

## PHASE 4: POST-ACTION GATE — VALIDATION (15%)

```
MANDATORY: Answer ALL after implementing.
If ANY answer is NO --> go back to PHASE 3 and fix.
ONLY proceed to PHASE 5 when ALL are YES.
```

### 7 Critical Questions (POST-ACTION)

1. COMPLETENESS: "100% complete? No TODOs?" If NO --> back to PHASE 3
2. QUALITY: "Lint + TypeCheck = 0 errors?" If NO --> fix
3. TESTS: "Edge cases covered? Coverage >= 90%?" If NO --> create tests
4. SECURITY (EXTRA CARE): If NO on ANY item --> fix
   - Input validation with TypeBox/Zod on EVERY route?
   - Auth guard on protected routes?
   - Rate limiting on public endpoints?
   - No SQL injection, XSS, CSRF?
   - Secrets in env vars? Logs without PII?
   - If touches auth/financial --> security-engineer reviews
5. PERFORMANCE: "No N+1? Indexes? Lazy loading?" If NO --> optimize
6. UX: "Loading/empty/error states? WCAG 2.1 AA?" If NO --> implement
7. DOCUMENTATION: "JSDoc? Types exported?" If NO --> document

### Quality Gate

```bash
pnpm lint       # 0 errors
pnpm typecheck  # 0 errors
pnpm test       # 100% passing
pnpm build      # no errors
```

## PHASE 5: DELIVERY (5%)

### Tree: Commit vs PR

```
Change?
+-- 1-3 files + fix --> git commit
+-- 4+ files        --> gh pr create
+-- New feature     --> gh pr create
+-- Breaking change --> gh pr create
```

## Prohibitions

- Implement without consulting official docs
- Use `any` in TypeScript
- TODO/FIXME/HACK in code
- console.log in production
- Hardcoded secrets in code
- Float for money
- Raw SQL with interpolation
- Commit without quality gate passing
- Endpoint without rate limiting
- Protected route without auth guard
- Input without TypeBox/Zod validation
- Sensitive data in logs
- CORS with origin `*`
- Cookies without httpOnly/secure/sameSite
- Redirect without URL whitelist
- Dependencies with known CVEs
