---

# Auto-Incrementing Repo Archaeology Worker

**Trigger:** `/discovery`
**Description:** Automatically loads the next unprocessed shard from `specs/repo-archaeology-shards.json`, documents it, and increments the counter for the next run.

---

# PHASE 0: SHARD STATE MANAGEMENT (DO THIS FIRST)

Before doing ANY documentation work, you must establish which "Shard" of the repository you are responsible for in this session.

**Step 0.1: Determine Shard Index**

1.  Check for the existence of a file named `.claude/shard_tracker.txt` in the repository root
2.  **If the file does not exist:**
    - Assume the current index is `0`.
    - Create the file and write `1` into it (preparing for the _next_ agent run).
3.  **If the file exists:**
    - Read the integer inside. This is your `TARGET_INDEX`.
    - Increment that integer by 1.
    - Overwrite `.claude/shard_tracker.txt` with the new integer.

**Step 0.2: Load Shard Config**

1.  Read `specs/repo-archaeology-shards.json` from the repository root.
2.  Extract the entry at `shards[TARGET_INDEX]`.
3.  **Stop Condition:** If `TARGET_INDEX` is greater than the number of shards in the array, STOP immediately and output: "All shards have been processed. Reset .claude/shard_tracker.txt to 0 to restart."

**Step 0.3: Bootstrap Identity**
Using the data from `shards[TARGET_INDEX]`, adopt the following context:

- **My Role:** `shard.title`
- **My Mission:** `shard.reasoning`
- **My Scope:** `shard.target_paths`

**Step 0.4: Verification**
Output a log line:

> "BOOTSTRAP: Processing Shard #<TARGET_INDEX> (<TITLE>). Next run will process #<NEXT_INDEX>."

---

# PHASE 1: SCOPE ENFORCEMENT

You are now strictly bound by the `target_paths` you just loaded.

1.  **Tunnel Vision:** You are strictly forbidden from analyzing files not listed in your `target_paths` or their direct subdirectories.
2.  **Black Box Dependencies:** If your code imports a module _outside_ your `target_paths`, treat it as a 3rd-party library. Document the _interface_ but NOT the implementation.
3.  **Deep Detail:** Because your scope is narrow, you must be verbose. Quote code for every assertion.

---

# PHASE 2: THE MASTER INSTRUCTION (REPO ARCHAEOLOGY)

**Execute the following documentation standard strictly within your defined scope:**

## Repo Archaeology → Feature Specs Generator

You are a **staff+ software architect + repo archaeologist**. You have full read access to a Git repository (the “source repo”) and full write access to create markdown documents in this same repo under `specs/`.

Your job is to **identify and describe every major feature and interconnected subsystem** in the repo—especially legacy-framework behavior—and to distill it into a **set of highly structured, cross-linked markdown specs** such that an engineer unfamiliar with the codebase could implement a compatible system (or run an end-to-end test) with minimal additional discovery work.

This is not a generic architecture write-up: it must be grounded in what the repo actually does, how it does it, and where those behaviors live in code.

---

### Mission and scope

#### Primary goal (first pass)

Produce a complete, navigable spec set that covers:

- **All interconnected pieces**
- **The abstraction + data layer** (schemas/models/contracts)
- **Tools system** and **Connectors/Channels**
- **Agentic loop behavior** (planning/execution/stop conditions/tool-call cycles)
- **All eventing**: event bus, hooks/callbacks, webhooks, websockets, message streams
- **Runtime layer isolation**:
  - implementation layer: agent/gateway/core services
  - interaction layer: UI/TUI/Webhook/Channel integrations
- **End-to-end minimal run**: enough contract wiring + minimal implementation guidance to run an E2E test with _minimal config + minimal code_, **including**:
  - Channel/Connector abstraction
  - Config mechanism
  - A working **Slack Channel implementation** (the only required concrete channel for this pass)
- **Model Provider abstraction** (foundation interface + facade)
  - Must support **3 providers** at an interface/contract level and include how tool/function calling is handled:
    1. OpenAI (API-based)
    2. OpenRouter (API-based)
    3. Anthropic via **Claude Agent SDK route** (NOT conventional API endpoint; must support _z.AI_ and _Claude Code Max_ subscription-style usage through the SDK/agent route)
- **Cron scheduling wiring**
  - You do **not** need to implement full cron persistence/management.
  - You **must** define **schemas/data structures**, interface contracts, and integration points with the rest of the system.
  - Add unit-testable seams and specify contract tests.

#### Additional mandatory deliverables (future divergence docs)

While reviewing the repo, also create _separate_ markdown docs under `specs/future/*.md` that propose how we will extend/diverge from this repository for the following future features:

- MCP Tools: first-class support in the Agentic Pipeline
- Gateway/API exposes MCP Tools (SSE/HTTPS), and how to surface Tool suggestions
- Hierarchical/Structured Tasks associated with Agents + Sessions (Session sees both its own tasks and agent-level tasks)
- Goals as a first-class concept
- Guardrails: pluggable mechanisms and interface contracts at key points in the flow
- Prompt injection protection: identify high-risk current spots, and evaluate whether guardrails are sufficient
- Data provenance: schema + integration points (stubbed in first pass)
- Decision rationale / decision provenance: breadcrumbing major steps; schema + conceptual structure now (integration later)
- Multi-tenant considerations:
  - The current repo is single-tenant.
  - Do **not** implement multi-tenancy in first pass.
  - Do **not** include multi-tenancy in the main design docs or plans.
  - **Do** produce a separate future doc listing feasibility concerns and areas to consider for eventual multi-tenant evolution.
- Auditing and event history (separate from eventing/hooks/callbacks; likely implemented by subscribing to emitted events)

#### Final consolidation deliverable

Create `specs/README.md` that provides:

- A **high-level breakdown** of all major interfaces/data models/services
- A **link index** to all detailed feature specs you wrote
- A **comprehensive proposal** for:
  - module boundaries and project structure
  - frameworks/tech stack (we will be revamping config UI with **React + Shadcn/Radix**, plus product-specific reusable components/panels)
  - deployment approach (containerized, K8s/ECS/GCS-friendly)
- It’s OK to recommend additional dependencies beyond the current repo.

---

### Rules: accuracy and completeness

#### Ground everything in the repo

- **Do not invent** behavior.
- Every key claim must be backed by:
  - file paths, symbols, config keys, data model definitions, or test evidence.
- When you infer behavior, label it clearly as an inference and list what would confirm it.

#### No major features missed: enforce completeness

You must prove coverage by doing all of the following:

1. **Repo census**: enumerate major directories/modules/packages and their roles.
2. **Entrypoint tracing**: identify all runtime entrypoints (server, worker, cli, scheduler, UI) and trace flows.
3. **Pattern scans** (ripgrep/grep equivalents): search for common feature indicators (events/hooks/tools/providers/channels/sessions/etc.).
4. **Coverage matrix**: maintain a table mapping “repo area → spec doc link”.
5. **Cross-linking**: each spec doc must link to related specs and be linked from `specs/README.md`.

---

### Output structure and file organization (MANDATORY)

All outputs are markdown files in the repo.

#### Required directory structure

- `specs/<feature>/*.md` — main feature specs (multiple docs per feature allowed/expected)
- `specs/future/*.md` — future divergence/extension docs (listed above)
- `specs/README.md` — final consolidated index + module/stack proposal

#### Naming conventions

- Use `kebab-case` for folders and files.
- Each `specs/<feature>/` directory should represent a cohesive bounded area.
- Prefer “one topic per file”; split when a file would exceed ~200–300 lines.

#### Required “frontmatter block” in every spec file

At the top of every `specs/**.md` file include:

```md
---
status: draft
scope: [as-is, first-pass, future-notes] # choose what applies
last_updated: YYYY-MM-DD
source_paths:
  - path/to/primary/files
search_terms:
  - "terms you used to find this"
related_specs:
  - ../some/other/spec.md
---
```

Keep `source_paths` real and useful.

---

### Required content template for each feature spec

Every feature spec must include these sections (in this order), unless not applicable:

1. **Purpose**

- What problem the feature solves
- Who uses it (system/user/agent/service)

2. **As-Is behavior (from repo)**

- Key flows and invariants
- Where the logic lives (file paths + symbols)
- What’s legacy/quirky about it

3. **Key abstractions and contracts**

- Interfaces / base classes / protocols
- Expected inputs/outputs and lifecycle
- Extension points (plugins, registries, adapters)

4. **Data model and schema**

- Entities, identifiers, relationships
- Persistence approach (DB/kv/files/in-memory)
- Include JSON-schema-ish blocks or SQL-ish pseudo tables when helpful

5. **Runtime lifecycle**

- Initialization, steady-state, shutdown
- Concurrency model (threads/async/queues)
- Error handling and retries

6. **Eventing**

- Events emitted/consumed (names + payload schema)
- Hooks/callbacks and where they attach
- Webhooks/websockets/SSE schemas if applicable

7. **Configuration**

- Config sources (env/files/DB)
- Exact config keys and defaults
- “Minimal config for E2E” section if relevant

8. **End-to-end flow diagram**

- Include at least one **Mermaid** diagram (sequence or component)
- Example:
- user message → channel → gateway → agent loop → model provider → tool calls → response

9. **Testing notes**

- Existing tests (where + what they cover)
- Gaps and **contract tests** needed for first-pass wiring

10. **First-pass implementation notes**

- What must be real in first pass vs stubbed
- Integration points that must exist now

11. **Open questions / TODOs**

---

### Required “feature areas” to cover (minimum set)

You must create spec docs covering at least these areas (as separate feature directories), _even if you discover the repo implements them differently_:

1. `specs/architecture/`

- overall system map, module boundaries (as-is)
- repo inventory/census

2. `specs/config/`

- configuration mechanism, layering, validation, secrets

3. `specs/data/`

- data abstraction layer, schemas, persistence contracts

4. `specs/runtime/`

- sessions isolation
- agents (definitions/config)
- consider **AgentTemplate** + Clone concept (include analysis + recommendation)
- agentic loop (planning/execution/tool call cycles/termination)

5. `specs/tools/`

- tool abstraction/registry/execution
- tool calling/function calling end-to-end

6. `specs/channels/`

- channel/connector abstraction (fundamental interface)
- **Slack channel implementation** (required in first pass)

7. `specs/providers/`

- provider interface abstraction + facade
- OpenAI provider mapping
- OpenRouter provider mapping
- Anthropic **Claude Agent SDK route** mapping
- tool calling/function calling differences normalized by the facade

8. `specs/events/`

- events/hooks/callbacks
- webhooks
- websocket/SSE schema and patterns (if used)

9. `specs/gateway/`

- API/gateway responsibilities and boundaries vs agent runtime

10. `specs/scheduler/`

- cron schedule schema + integration contracts

11. `specs/ui/`

- current interaction layer (UI/TUI/etc) as-is
- proposed **React + Shadcn/Radix** architecture, reusable panels/subviews, minimal complexity

12. `specs/deployment/`

- containerized mode requirements: explicit host isolation
- K8s/ECS/GCS deployment considerations

13. `specs/testing/`

- minimal end-to-end test plan with minimal config
- unit/contract test seams for cron + providers + slack channel + tool loop

If the repo has additional major subsystems (auth, billing, permissions, indexing, retrieval, vector DB, etc.), add more feature directories.

---

### Required future docs (create exactly these files)

Create these under `specs/future/`:

- `specs/future/mcp-tools.md`
- `specs/future/mcp-gateway-exposure.md`
- `specs/future/tasks.md`
- `specs/future/goals.md`
- `specs/future/guardrails.md`
- `specs/future/prompt-injection.md`
- `specs/future/data-provenance.md`
- `specs/future/decision-provenance.md`
- `specs/future/multi-tenancy-considerations.md`
- `specs/future/auditing-event-history.md`

Each future doc must include:

- What exists in the repo that is adjacent/relevant (paths/symbols)
- Proposed integration points (where in the flow)
- Minimal schema/contracts now vs later
- Risks and open questions

Multi-tenancy doc must be _concerns only_ (no mainline design changes).

---

### Work plan (do this in order)

#### Phase 1 — Repo census (prove you looked everywhere)

Produce `specs/architecture/repo-inventory.md` including:

- language(s), frameworks, build tools
- top-level directories and purpose
- runtime entrypoints
- config sources
- data stores
- external integrations
- test layout

Also produce `specs/architecture/system-map.md`:

- component diagram (Mermaid)
- key module boundaries and interactions

#### Phase 2 — Feature discovery (don’t miss anything)

Perform systematic scans and record your search terms in each spec’s frontmatter.
At minimum search for:

- `agent`, `session`, `conversation`, `thread`, `memory`
- `tool`, `function`, `schema`, `registry`, `plugin`
- `channel`, `connector`, `adapter`, `slack`
- `provider`, `openai`, `anthropic`, `claude`, `openrouter`
- `event`, `emit`, `subscribe`, `hook`, `callback`
- `webhook`, `websocket`, `sse`, `stream`
- `cron`, `schedule`, `job`, `queue`, `worker`
- `config`, `env`, `dotenv`, `yaml`, `json`, `toml`
- `docker`, `k8s`, `helm`, `ecs`, `gke`, `container`

Create `specs/architecture/coverage-matrix.md` as a living table:
| Repo Area / Concern | Key paths | Spec doc(s) | Notes / Gaps |
| ------------------- | --------- | ----------- | ------------ |
Update it continuously.

#### Phase 3 — Write feature specs (as-is + first-pass)

For each required feature area, create the directory and write the docs using the template above.
Mandatory emphasis:

- agentic loop + tool calling + provider abstraction + slack channel + cron wiring
- session isolation + agent configs + agent template/clone analysis
- eventing + webhooks/websockets patterns
- containerized deployment constraints

#### Phase 4 — Future divergence docs

Write each `specs/future/*.md` doc listed above.

#### Phase 5 — Final consolidation README

Complete `specs/README.md` with:

- high-level overview
- link index to every spec
- module breakdown proposal and tech stack recommendation:
- React + Shadcn/Radix for config UI
- define reusable panel/subview patterns
- backend stack recommendation grounded in repo realities
- container-first deployment guidance (K8s/ECS/GCS)

- “Minimal E2E path” section:
- minimal config required
- slack channel path
- a minimal agent + session run flow
- how tool calls happen
- what unit/contract tests validate cron/provider/channel integration points

---

### Special requirements (must satisfy)

#### Model Provider facade + tool/function calling normalization

In `specs/providers/` you must explain:

- the provider interface and lifecycle
- how tool schemas are represented
- how tool calls are detected, validated, invoked, and returned
- streaming vs non-streaming considerations
- differences between OpenAI/OpenRouter/Anthropic Claude Agent SDK route and how the facade hides them

#### Cron schedule wiring (contract-level)

In `specs/scheduler/cron.md` you must include:

- cron schedule entity schema
- scheduling triggers and how they enqueue/execute work
- integration points with sessions/agents/tools/events
- persistence left stubbed, but contracts must be unit-testable

#### Sessions and Agents

In `specs/runtime/` you must include:

- session identity, isolation boundaries, concurrency
- per-agent configuration inheritance/overrides
- recommendation: AgentTemplate + Clone (or justify not doing it)
- how sessions access tasks (future note), and how agent-level artifacts relate

#### Eventing and interaction-layer isolation

In `specs/events/` and `specs/gateway/` cover:

- event schemas
- callbacks/hooks
- webhooks and websocket patterns and payload schemas
- boundary between:
- core runtime (agent/gateway/services)
- interaction layer (UI/TUI/webhooks/channels)

#### Containerization and deployment

In `specs/deployment/` include:

- explicit host isolation requirements
- secret/config injection patterns
- K8s/ECS/GCS notes (health checks, scaling, volumes, networking)

---

### Definition of Done checklist (must pass before finishing)

- [ ] `specs/README.md` exists and links to **every** spec file you created
- [ ] All required feature directories exist and are populated
- [ ] All required `specs/future/*.md` files exist and are populated
- [ ] `specs/architecture/coverage-matrix.md` exists and has no “major directory unassigned”
- [ ] Each spec has frontmatter with real `source_paths` and `search_terms`
- [ ] Agentic loop, tool system, slack channel, provider facade, cron wiring are documented deeply enough to implement compatible stubs
- [ ] Each major flow includes at least one Mermaid diagram
- [ ] Any uncertainty is explicitly labeled with TODO + the exact code location to confirm
