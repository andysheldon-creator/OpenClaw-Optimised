# Web UI Parity Report: `apps/web/` vs Legacy `ui/`

> Synthesized from 3 independent static analyses, cross-validated against source code.
> Generated: 2026-02-06

---

## Executive Summary

The new `apps/web/` UI has **strong scaffolding** (routes, components, API adapter stubs) but most data paths are either **mock-only** or **gated behind a DEV-only flag**. Production builds currently render static placeholder data for the majority of views. The legacy `ui/` (deprecated, upstream) is fully wired to gateway RPCs.

**31 unique findings** across the 3 analyses collapse into **18 deduplicated actionable items** below, grouped into 4 tiers by urgency.

---

## Tier 1: Blocking for Production (must fix before any real deployment)

### 1. Production data sources default to mock (DEV-only gateway gating)

| Field | Value |
|-------|-------|
| **Complexity** | 3/10 (mechanical, repetitive) |
| **Impact** | 10/10 (entire app is non-functional in production) |
| **Analyses** | #1-3, #2-7, #3-5 |

**Problem:** ~20+ hooks use `(import.meta.env?.DEV ?? false) && useLiveGateway` to decide whether to hit the gateway or return mock data. In production (`DEV=false`), the app **always** returns mocks for agents, conversations, nodes, devices, exec approvals, and agent status.

**Affected files:**
- `hooks/queries/useAgents.ts` (3 hooks)
- `hooks/queries/useConversations.ts` (4 hooks)
- `hooks/queries/useNodes.ts` (3 hooks)
- `hooks/queries/useAgentStatus.ts`
- `hooks/mutations/useAgentMutations.ts` (4 hooks)
- `hooks/mutations/useConversationMutations.ts`
- `main.tsx`, `routes/__root.tsx`

**Proposed fix:** Invert the default: always use gateway data; only fall back to mocks when `import.meta.env.DEV && !useLiveGateway` (i.e. developer explicitly opts into mock mode). Add a `GatewayProvider` connection-state check so hooks gracefully degrade when the gateway is unreachable rather than silently serving stale mocks.

**Why this approach:** A single inversion in `useUIStore` + a `gatewayEnabled` computed value (already partially exists in `__root.tsx:30`) propagated to all hooks keeps the change mechanical and low-risk. No API contract changes needed.

---

### 2. Gateway URL hardcoded + no auth persistence/URL cleanup

| Field | Value |
|-------|-------|
| **Complexity** | 4/10 |
| **Impact** | 8/10 (blocks any non-localhost deployment) |
| **Analyses** | #1-1, #2-8 |

**Problem:** `useGatewayUrl()` hardcodes `ws://127.0.0.1:18789`. Legacy supports query-param override + confirmation view + credential persistence. The new UI reads `token`/`password` from query params but never strips them from the URL or persists them.

**Proposed fix:**
1. Read gateway URL from `localStorage` with `ws://127.0.0.1:18789` as fallback
2. Add a settings field (already partially in `GatewayConfigConnected.tsx`) for URL + auth
3. On first load with `?gatewayUrl=` or `?token=`, persist to localStorage and `history.replaceState` to strip sensitive params
4. `GatewayAuthModal.tsx` + `GatewayAuthGuard.tsx` already exist as shells -- wire them

---

### 3. `exec.approvals.set` sends wrong parameter name

| Field | Value |
|-------|-------|
| **Complexity** | 1/10 (one-line fix) |
| **Impact** | 7/10 (exec approvals silently fail) |
| **Analyses** | #1-11 |

**Problem:** `apps/web/src/lib/api/nodes.ts:186` sends `{ file, hash }` but the gateway expects `{ file, baseHash }`. The `exec.approvals.node.set` call at line 180 also sends `hash` instead of `baseHash`. Every other config mutation in the codebase correctly uses `baseHash`.

**Proposed fix:** Rename `hash` to `baseHash` in both calls at lines 180-186.

---

### 4. Skills API calls non-existent RPCs (`skills.uninstall`, `skills.reload`)

| Field | Value |
|-------|-------|
| **Complexity** | 2/10 |
| **Impact** | 6/10 (skill management partially broken) |
| **Analyses** | #3-4 |

**Problem:** `apps/web/src/lib/api/skills.ts:129,137` calls `skills.uninstall` and `skills.reload` which don't exist on the gateway (only `skills.status`, `skills.bins`, `skills.install`, `skills.update` are supported).

**Proposed fix:** Remove `uninstallSkill()` and `reloadSkills()` from the API adapter. If uninstall UX is needed, investigate whether `skills.update` with a removal flag is feasible, or hide the button until the gateway adds the RPC.

---

## Tier 2: Major Feature Gaps (core legacy functionality missing)

### 5. Cron/Jobs page is mock-only with RPC mismatches

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 7/10 (cron management unusable) |
| **Analyses** | #1-4, #2-5, #3-2 |

**Problem:** Two issues: (a) `/jobs` route renders entirely mock data despite `lib/api/cron.ts` having correct RPC calls (`cron.list`, `cron.add`, `cron.run`, `cron.runLog`, etc.); (b) the API also calls `cron.get`, `cron.enable`, `cron.disable` which may not exist on the gateway (legacy uses `cron.status` + `cron.update` for enable/disable).

**Proposed fix:**
1. Wire `/jobs/index.tsx` to use `useCronJobs()` / `useCronRunHistory()` hooks backed by `lib/api/cron.ts`
2. Verify `cron.get`/`cron.enable`/`cron.disable` exist on current gateway; if not, replace with `cron.status` + `cron.update` patterns from legacy
3. Add run history panel (legacy's `cron.runs` + `cron.runLog`)

---

### 6. Debug console is mock-only

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 6/10 (diagnostics/troubleshooting blocked) |
| **Analyses** | #1-10, #2-4, #3-3 |

**Problem:** `routes/debug/index.tsx` starts with `// Mock data for system status` (line 58) and uses hardcoded service statuses, RPC methods, event types, and logs. Legacy debug uses `status`, `health`, `models.list`, `last-heartbeat`, live event stream, and arbitrary RPC execution.

**Proposed fix:**
1. Replace mock services with `status` + `health` RPC calls
2. Add models panel via `models.list`
3. Wire event log to gateway event stream (WebSocket subscription)
4. Add manual RPC console (text input -> `client.request(method, params)` -> JSON output)
5. The workbench route (`debug/workbench.tsx`) also appears mock -- audit and wire

---

### 7. Channel configuration partially mock (connect/disconnect/QR flows)

| Field | Value |
|-------|-------|
| **Complexity** | 6/10 |
| **Impact** | 7/10 (channel setup broken) |
| **Analyses** | #1-2, #2-9, #3-1 |

**Problem:** `ChannelConfig.tsx` uses `setTimeout` placeholders for connect/disconnect/QR. A `ChannelConfigConnected.tsx` exists with real `channels.status`, `channels.logout`, and `config.apply` calls using `baseHash` -- but the settings page appears to render the static version. Legacy has full `web.login.start` / `web.login.wait` / QR flows. Nostr channel config is absent entirely.

**Proposed fix:**
1. Ensure settings renders `ChannelConfigConnected` (not static `ChannelConfig`)
2. Add WhatsApp QR flow (`web.login.start` -> `web.login.wait` polling)
3. Add Nostr channel config (follow legacy `channels.nostr*.ts` patterns)
4. Wire Telegram/Discord/Signal/Slack connect flows

---

### 8. Logs view missing (no `logs.tail`)

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 6/10 (no live log visibility) |
| **Analyses** | #1-5, #2-2 |

**Problem:** Legacy uses `logs.tail` with cursor-based streaming and JSONL parsing. New UI has no `/logs` route and no reference to `logs.tail` anywhere.

**Proposed fix:**
1. Add `/logs` route
2. Implement `logs.tail` RPC call with cursor pagination
3. Add auto-scroll, level filtering (info/warn/error), and search
4. Consider reusing `WebTerminal.tsx` component for log display

---

### 9. Sessions management missing (global list/patch/delete)

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 5/10 |
| **Analyses** | #1-6 |

**Problem:** Legacy has `sessions.list` with filters (active minutes, limit, include global/unknown), `sessions.patch` (label, thinking level), and `sessions.delete`. New UI only shows per-agent session chat -- no global session management.

**Proposed fix:**
1. Add `/sessions` route with filterable table
2. Wire to `sessions.list`, `sessions.patch`, `sessions.delete` RPCs
3. Add inline editing for session labels and thinking level
4. Add delete with confirmation dialog (reuse `ConfirmDialog.tsx`)

---

### 10. Usage/analytics view missing

| Field | Value |
|-------|-------|
| **Complexity** | 6/10 |
| **Impact** | 5/10 |
| **Analyses** | #1-7, #3-7 |

**Problem:** `UsageSection.tsx` exists in settings but uses hardcoded mock data. Legacy has `sessions.usage`, `usage.cost`, `sessions.usage.timeseries`, and `sessions.usage.logs`. None of these RPCs are referenced in `apps/web/src`.

**Proposed fix:**
1. Wire `UsageSection` to `sessions.usage` + `usage.cost` RPCs
2. Add time-series chart (use existing chart library or add lightweight one)
3. Add session log drill-down via `sessions.usage.logs`
4. Consider adding to settings page first, then promote to standalone route if needed

---

### 11. Automations + Run History missing

| Field | Value |
|-------|-------|
| **Complexity** | 6/10 |
| **Impact** | 5/10 |
| **Analyses** | #2-1, #3-6 |

**Problem:** Legacy has full automations management (`automations.list/create/run/update/delete/cancel/history`). No automations route, API adapter, or hooks exist in `apps/web/src`.

**Proposed fix:**
1. Create `lib/api/automations.ts` adapter
2. Add `/automations` route with CRUD table
3. Add run history panel with timeline view
4. Wire to `automations.*` gateway RPCs

---

### 12. Instances/Presence view missing

| Field | Value |
|-------|-------|
| **Complexity** | 4/10 |
| **Impact** | 4/10 |
| **Analyses** | #1-9, #2-3 |

**Problem:** Legacy `instances.ts` uses `system-presence` to show gateway/client beacons with heartbeat timestamps. No equivalent in `apps/web`. The gateway client does have `stateVersion.presence` in its type definition but it's unused.

**Proposed fix:**
1. Add `/instances` route
2. Create `lib/api/presence.ts` adapter for `system-presence` RPC
3. Show connected clients, heartbeat status, gateway version
4. Auto-refresh on presence events

---

### 13. Goals page uses mock data despite API adapter existing

| Field | Value |
|-------|-------|
| **Complexity** | 4/10 |
| **Impact** | 5/10 |
| **Analyses** | #2-6 |

**Problem:** `hooks/queries/useGoals.ts` returns hardcoded mock goals (lines 50-121 are fake data with `setTimeout`). Meanwhile, `lib/api/overseer.ts` has fully typed `overseer.goals.list/create/status/pause/resume/cancel/delete` adapters, and `hooks/queries/useOverseer.ts` exists with a `goals.filter` call. These are disconnected.

**Proposed fix:**
1. Replace `fetchGoals()` mock in `useGoals.ts` with calls to `useOverseerGoals()` from `useOverseer.ts`
2. Wire mutation hooks (`useGoalMutations.ts`) to `overseer.goals.*` RPCs
3. Update `GoalList.tsx` and `/goals` route to handle loading/error states from real data

---

### 14. Skills management page (global enable/install/API keys)

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 4/10 |
| **Analyses** | #1-8 |

**Problem:** New UI only has per-agent skill allowlists (`AgentSkillsTab.tsx`). Legacy provides global skills management with enable/disable, install, and API key management via `skills.status`, `skills.bins`, `skills.install`, `skills.update`.

**Proposed fix:**
1. Add `/skills` route or skills section in settings
2. Wire to `skills.status` (list all skills + their state)
3. Add install flow via `skills.install`, update via `skills.update`
4. Add per-skill API key configuration if applicable

---

## Tier 3: Important but Lower Priority

### 15. Onboarding is UI-only (no gateway validation)

| Field | Value |
|-------|-------|
| **Complexity** | 4/10 |
| **Impact** | 4/10 |
| **Analyses** | #3-8 |

**Problem:** `useOnboardingCheck.ts` only checks localStorage + whether an API key exists in config. Legacy onboarding validates via `config.get`, `config.set`, `health`, `channels.status`, and `agent.test` to confirm the gateway is actually functional.

**Proposed fix:**
1. Add gateway health check step to onboarding
2. Validate channel connectivity via `channels.status` after config
3. Run `agent.test` as final verification step
4. Keep localStorage fast-path for return visits

---

### 16. Filesystem/Worktree UI is mock-only

| Field | Value |
|-------|-------|
| **Complexity** | 7/10 (depends on backend) |
| **Impact** | 3/10 |
| **Analyses** | #1-12, #2-10 |

**Problem:** `apps/web/src/integrations/worktree/` has explicit `mock.ts` and notes that `worktree.*` RPCs are not registered on the gateway. The `/filesystem` route uses mock file trees.

**Proposed fix:** This is **backend-blocked**. Options:
- **Option A:** Register `worktree.*` RPCs on the gateway (requires backend work)
- **Option B:** Use `agent.files.*` or similar existing RPCs if available
- **Option C:** Defer this feature and hide the route in production
- **Recommended:** Option C for now, with Option A tracked as a backend task

---

### 17. Gateway event coverage gaps

| Field | Value |
|-------|-------|
| **Complexity** | 5/10 |
| **Impact** | 4/10 |
| **Analyses** | #3-9 |

**Problem:** Legacy handles events for presence, cron state changes, `device.pair.requested/resolved`, and `exec.approval.requested/resolved`. New UI event handling focuses on chat/agent streams only.

**Proposed fix:**
1. Add event handlers in `GatewayProvider` or a dedicated `useGatewayEvents` hook
2. Handle presence events (update instances view)
3. Handle cron events (refresh jobs list)
4. Handle device pairing events (show notification/approval dialog)
5. Handle exec approval events (show approval nudge -- `ApprovalAttentionNudge.tsx` already exists)

---

### 18. Cron API uses potentially unsupported RPCs

| Field | Value |
|-------|-------|
| **Complexity** | 2/10 |
| **Impact** | 3/10 |
| **Analyses** | #3-2 (partial) |

**Problem:** `cron.get`, `cron.enable`, `cron.disable` in `lib/api/cron.ts` may not exist on the gateway. Legacy uses `cron.status` for single-job queries and `cron.update` to toggle enabled state.

**Proposed fix:** Verify these RPCs against gateway handler registration. If missing, replace `cron.get` with `cron.status`, and `cron.enable`/`cron.disable` with `cron.update({ id, enabled: true/false })`.

---

## Cross-Cutting Themes

### Mock Data Removal Strategy
42 files reference mock data. Recommended approach:
1. **Phase 1:** Fix the DEV-only gating (item #1) -- this unblocks ~60% of data paths
2. **Phase 2:** Wire remaining mock-only routes (jobs, debug, goals, usage) to existing API adapters
3. **Phase 3:** Build missing API adapters (automations, logs, presence, sessions)
4. **Phase 4:** Remove mock data files entirely once all routes are wired

### Shared Infrastructure Needs
Several items would benefit from shared work:
- **Unified gateway connection state** in `GatewayProvider` with auto-reconnect
- **Event bus** for gateway events (presence, cron, approvals, device pairing)
- **Error boundary** pattern for graceful degradation when gateway is unreachable

---

## Priority Matrix

| # | Item | Complexity | Impact | Priority Score |
|---|------|-----------|--------|---------------|
| 1 | DEV-only mock gating | 3 | 10 | **P0** |
| 3 | exec.approvals.set param | 1 | 7 | **P0** |
| 4 | skills.uninstall/reload | 2 | 6 | **P0** |
| 2 | Gateway URL + auth | 4 | 8 | **P0** |
| 5 | Cron/Jobs wiring | 5 | 7 | **P1** |
| 7 | Channel config flows | 6 | 7 | **P1** |
| 6 | Debug console | 5 | 6 | **P1** |
| 8 | Logs tail view | 5 | 6 | **P1** |
| 13 | Goals -> Overseer | 4 | 5 | **P1** |
| 9 | Sessions management | 5 | 5 | **P2** |
| 10 | Usage analytics | 6 | 5 | **P2** |
| 11 | Automations | 6 | 5 | **P2** |
| 12 | Instances/Presence | 4 | 4 | **P2** |
| 14 | Skills management | 5 | 4 | **P2** |
| 15 | Onboarding validation | 4 | 4 | **P3** |
| 17 | Event coverage | 5 | 4 | **P3** |
| 18 | Cron RPC alignment | 2 | 3 | **P3** |
| 16 | Filesystem/Worktree | 7 | 3 | **P3 (blocked)** |

---

## Analysis Cross-Reference

| Deduplicated Item | Analysis #1 | Analysis #2 | Analysis #3 |
|-------------------|-------------|-------------|-------------|
| 1. DEV mock gating | #3 | #7 | #5 |
| 2. Gateway URL/auth | #1 | #8 | -- |
| 3. exec.approvals param | #11 | -- | -- |
| 4. skills.uninstall/reload | -- | -- | #4 |
| 5. Cron/Jobs | #4 | #5 | #2 |
| 6. Debug console | #10 | #4 | #3 |
| 7. Channel config | #2 | #9 | #1 |
| 8. Logs tail | #5 | #2 | -- |
| 9. Sessions | #6 | -- | -- |
| 10. Usage analytics | #7 | -- | #7 |
| 11. Automations | -- | #1 | #6 |
| 12. Instances/Presence | #9 | #3 | -- |
| 13. Goals/Overseer | -- | #6 | -- |
| 14. Skills management | #8 | -- | -- |
| 15. Onboarding | -- | -- | #8 |
| 16. Filesystem/Worktree | #12 | #10 | -- |
| 17. Event coverage | -- | -- | #9 |
| 18. Cron RPC alignment | -- | -- | #2 (partial) |
