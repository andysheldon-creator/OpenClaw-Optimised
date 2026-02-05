# Assessment of `designs/*` proposals (GPT-5)

Date: 2026-02-05

## Scope

Read and evaluated the following design docs:

### `designs/refactor-proposal/*`

- `agent-session-kernel.md`
- `runtime-context-resolver.md`
- `turn-execution-pipeline.md`
- `session-state-metadata-service.md`
- `agent-event-hook-normalization.md`
- `entry-point-consolidation.md`
- `plugin-sdk.md`
- `exec-host.md`
- `clawnet.md`
- `strict-config.md`
- `outbound-session-mirroring.md`

### `designs/primitive-brainstorms/*`

- `results-1/message-policy-engine.md`
- `results-1/webhook-ingress-platform.md`
- `results-1/hook-event-pipeline.md`
- `results-2/inbound-message-pipeline.md`
- `results-2/provider-auth-flow-primitive.md`
- `results-2/tool-result-event-pipeline.md`
- `results-2/webhook-ingress-primitive.md`
- `results-3/agent-run-context.md`
- `results-3/tool-artifact-ledger.md`
- `results-3/unified-event-pipeline.md`

## Evaluation rubric

I scored each proposal qualitatively across:

- **Complexity reduction**: removes duplicate flow assembly / diverging semantics.
- **Reuse**: creates a primitive that multiple subsystems can adopt.
- **Reliability**: reduces drift, adds ordering guarantees, strengthens “single source of truth”.
- **Debuggability**: introduces stable event surfaces, reason codes, and traceability.
- **Migration safety**: can roll out incrementally with parity tests + feature flags.
- **Surface-area control**: avoids creating a new “god API” with unclear ownership.

## Executive summary (what’s worth refining)

### Highest ROI (refine + prioritize)

1. **Session Kernel stack**: `Agent Session Kernel` + `Runtime Context Resolver` + `Turn Execution Pipeline` + `Session State Service`.
   - This is the most directly aligned with “reduce complexity / increase reuse”.
   - It’s also the best place to enforce consistent safety defaults and to make debugging predictable.
   - Recommendation: synthesize into one cohesive architecture doc and proceed with a staged migration + parity tests.
   - I wrote a synthesized version: `designs/plans/gpt5/10-synthesis-execution-kernel.md`.

2. **Unified event/hook/tool surfacing**: `Agent Event and Hook Normalization` + `Unified Event Pipeline` + `Hook Event Pipeline` + `Tool Artifact Ledger` (+ parts of `Tool Result Event Pipeline`).
   - There are multiple overlapping “event envelope + router” proposals; the intent is correct, but the system needs one canonical “spine”.
   - Recommendation: a single event spine with strict ordering and a tool ledger feeding it; keep compatibility adapters for current hook APIs.
   - I wrote a synthesized version: `designs/plans/gpt5/11-synthesis-event-spine-and-tool-ledger.md`.

3. **Inbound message standardization**: `Inbound Message Pipeline` + `Message Policy Engine`.
   - Strong fit for “reduce duplicated channel plumbing”. A shared pipeline + policy engine makes behavior consistent and makes extensions safer.
   - Recommendation: refine these together so the pipeline emits structured policy decisions (reason codes) for status/debug.

4. **Provider auth flow primitive**: `Provider Auth Flow Primitive Plan`.
   - High duplication today, clear benefits, bounded scope, very testable.
   - Recommendation: refine and ship early; it will pay back immediately across provider plugins.

5. **Webhook ingress primitive (not full platform, yet)**: `Webhook Ingress Primitive Plan`.
   - Standard request parsing, body limits, and signature verification are highly reusable and reduce security footguns.
   - Recommendation: start with the “primitive” (HTTP handler wrapper + routing + auth contract). Defer “public URL management” unless/until you actually need tunnel automation.

### Valuable, but needs careful sequencing / guardrails

6. **Plugin SDK + runtime refactor**: `Plugin SDK + Runtime Refactor Plan`.
   - Direction is correct and will unlock sustainable external plugins.
   - Biggest risk is “runtime API sprawl”: a large runtime surface becomes another core API to maintain forever.
   - Recommendation: refine by (a) defining a “minimal runtime” tier, (b) pushing more into SDK helpers where possible, and (c) ensuring runtime methods map 1:1 to internal primitives (inbound pipeline, message policy engine, turn executor, etc.) rather than exposing ad-hoc helpers.

7. **Strict config validation**: `Strict config validation (doctor-only migrations)`.
   - Big reliability/debug win, but high breakage risk.
   - Recommendation: refine rollout strategy (warn → error), and explicitly decide how to handle unknown keys for **3rd-party plugins** that are not installed anymore.

8. **Exec host refactor**: `Exec host refactor plan`.
   - Solid plan and good defaults; it materially improves safety + consistency.
   - Recommendation: refine the approvals and “ask UX” so it can later plug into Clawnet’s operator-centric approval model without rewriting everything twice.

9. **Clawnet refactor**: `Clawnet refactor (protocol + auth unification)`.
   - This is a “north star” initiative with major security and UX benefits, but it is _large_ and spans multiple trust boundaries.
   - Recommendation: refine into smaller independently shippable slices (identity/pairing unification, approvals centralization, TLS unification, role/scope enforcement, transport unification).

### Already in flight / mostly implementation notes

10. **Outbound session mirroring**: `Outbound Session Mirroring Refactor`.

- This reads as a change log / stabilization doc, not a new primitive proposal.
- Recommendation: finish stabilization, then treat `resolveOutboundSessionRoute` + `ensureOutboundSessionEntry` as the canonical outbound mirroring primitive for all send flows.

## Where proposals overlap (and what to do about it)

### Run orchestration overlap

- `Agent Session Kernel`, `Runtime Context Resolver`, `Turn Execution Pipeline`, `Session State Service`, and brainstorm `Agent run context primitive` are essentially _one_ conceptual stack.
- Recommendation: treat `AgentRunContext` as an internal component (builder) of the Session Kernel stack rather than a separate “public” primitive.

### Eventing overlap

- `Hook event pipeline`, `Unified event pipeline`, and `Agent Event and Hook Normalization` all propose the same core idea (typed envelope + router + sequencing).
- Recommendation: one canonical event spine, with adapters for internal hooks + plugin hooks + runtimes (Pi/SDK). Don’t build 3 “almost the same” routers.

### Tool result overlap

- `Tool result event pipeline` is “hook ergonomics” focused; `Tool artifact ledger` is “source of truth + durability” focused.
- Recommendation: build the **ledger** first, then provide ergonomic helper(s) for hooks as a view over ledger entries/events.

### Webhook overlap

- `Webhook ingress primitive` is the tight core; `Webhook ingress platform` adds “public URL management” and lifecycle.
- Recommendation: ship the core primitive first. Only grow into “platform” if you have concrete tunnel automation + provider webhook sync needs that repeat across integrations.

## Recommendation table (per doc)

Legend:

- **Adopt**: mostly correct as written; proceed with engineering plan.
- **Refine**: needs edits/clarification but direction is right.
- **Synthesize**: merge with overlaps into a new canonical design.
- **Defer**: good idea but not now / depends on other work.

| Doc                                                               | Primary value                 | Risk        | Recommendation          | Notes                                         |
| ----------------------------------------------------------------- | ----------------------------- | ----------- | ----------------------- | --------------------------------------------- |
| `refactor-proposal/agent-session-kernel.md`                       | canonical run path            | medium      | **Synthesize**          | merge with resolver/executor/state service    |
| `refactor-proposal/runtime-context-resolver.md`                   | 1 runtime decision point      | low/med     | **Synthesize**          | becomes kernel internal component             |
| `refactor-proposal/turn-execution-pipeline.md`                    | normalize streaming/output    | low/med     | **Synthesize**          | kernel-internal “turn engine”                 |
| `refactor-proposal/session-state-metadata-service.md`             | consistent session updates    | low         | **Adopt**               | should live behind kernel boundary            |
| `refactor-proposal/entry-point-consolidation.md`                  | migration sequencing          | low         | **Adopt**               | keep as rollout checklist; link to kernel     |
| `primitive-brainstorms/results-3/agent-run-context.md`            | reduce run setup duplication  | low         | **Synthesize**          | fold into kernel stack as builder             |
| `refactor-proposal/agent-event-hook-normalization.md`             | stable events across runtimes | medium      | **Synthesize**          | unify with event pipeline proposals           |
| `primitive-brainstorms/results-3/unified-event-pipeline.md`       | unify hook registries         | medium      | **Synthesize**          | one event spine + adapters                    |
| `primitive-brainstorms/results-1/hook-event-pipeline.md`          | typed envelope + router       | low/med     | **Synthesize**          | same as above                                 |
| `primitive-brainstorms/results-3/tool-artifact-ledger.md`         | durable tool lifecycle        | medium      | **Refine**              | tie into event spine + transcripts            |
| `primitive-brainstorms/results-2/tool-result-event-pipeline.md`   | hook ergonomics               | low         | **Refine**              | becomes helpers on top of ledger              |
| `primitive-brainstorms/results-2/inbound-message-pipeline.md`     | shared channel plumbing       | medium      | **Refine**              | needs crisp adapter boundaries + parity tests |
| `primitive-brainstorms/results-1/message-policy-engine.md`        | unified gating decisions      | low         | **Adopt**               | and make it emit reason codes                 |
| `primitive-brainstorms/results-2/webhook-ingress-primitive.md`    | shared parsing/auth/routing   | low/med     | **Adopt**               | start here                                    |
| `primitive-brainstorms/results-1/webhook-ingress-platform.md`     | public URL mgmt/tunnels       | med/high    | **Defer**               | only when repeated need is proven             |
| `primitive-brainstorms/results-2/provider-auth-flow-primitive.md` | reuse OAuth/device code       | low         | **Adopt**               | early win                                     |
| `refactor-proposal/plugin-sdk.md`                                 | sustainable plugin API        | high        | **Refine**              | enforce minimal runtime + layering            |
| `refactor-proposal/strict-config.md`                              | catch config drift            | high        | **Refine**              | rollout plan + 3rd-party plugin story         |
| `refactor-proposal/exec-host.md`                                  | safer exec routing            | medium/high | **Refine**              | align approvals with Clawnet direction        |
| `refactor-proposal/clawnet.md`                                    | unify protocol/auth/approvals | very high   | **Defer (as monolith)** | refine into incremental slices                |
| `refactor-proposal/outbound-session-mirroring.md`                 | correctness fix               | medium      | **Adopt / finish**      | treat as canonical outbound routing           |

## Suggested sequencing (practical roadmap)

This is the order that best balances ROI, regression risk, and long-term architecture.

1. **Ship bounded primitives that reduce duplication immediately**
   - Provider auth flow
   - Webhook ingress primitive
   - Message policy engine

2. **Standardize ingress for all channel auto-reply**
   - Inbound message pipeline + adapters
   - Emit policy decision reason codes + diagnostics

3. **Unify run orchestration**
   - Implement the synthesized execution kernel stack
   - Migrate CLI first (tight feedback loop), then auto-reply, then cron

4. **Unify events and tool artifacts**
   - Event spine + tool ledger
   - Turn on trace recording for targeted sessions/runs

5. **Plugin architecture refactor**
   - Introduce SDK+runtime
   - Migrate a few “light” plugins first
   - Enforce “no `extensions/**` imports from `src/**`”

6. **Strict config validation**
   - Start with warnings and `doctor` guidance
   - Flip to “error + command gating” once the ecosystem is migrated

7. **Exec host and Clawnet**
   - Exec host improvements can proceed, but keep the approvals contract transport-agnostic
   - Treat Clawnet as a long-running effort with discrete deliverables

## Net-new additions from this evaluation

These are proposals I wrote because they are the “missing glue” for reliability/debugging once the other primitives exist:

- **Run Trace Bundle**: `designs/plans/gpt5/20-proposal-run-trace-bundle.md`

## Primary syntheses written from scratch

- `designs/plans/gpt5/10-synthesis-execution-kernel.md`
- `designs/plans/gpt5/11-synthesis-event-spine-and-tool-ledger.md`
