# Agentic Workflow UX Audit

> **Audit Date:** 2026-01-25
> **Scope:** UI/UX for surfacing and managing agentic workstreams with human guidance

---

## Executive Summary

This audit identifies the **weakest areas** of Clawdbrain's user interface for managing agentic workflows, focusing on how users can monitor, intervene, and guide autonomous agent behavior. The core finding is that while the backend infrastructure (Overseer, execution approvals, agent events) is well-architected, the **user-facing controls are fragmented across CLI and UI**, creating friction for human-in-the-loop supervision.

---

## Critical Gaps

### 1. **No UI Controls for Goal Management**

**Current State:** Goal lifecycle operations are CLI-only.

| Operation       | CLI                                  | Web UI | macOS | iOS |
| --------------- | ------------------------------------ | ------ | ----- | --- |
| Create goal     | ✅ `clawdbrain overseer goal create` | ❌     | ❌    | ❌  |
| Pause goal      | ✅ `clawdbrain overseer goal pause`  | ❌     | ❌    | ❌  |
| Resume goal     | ✅ `clawdbrain overseer goal resume` | ❌     | ❌    | ❌  |
| Mark work done  | ✅ `clawdbrain overseer work done`   | ❌     | ❌    | ❌  |
| Block work node | ✅ `clawdbrain overseer work block`  | ❌     | ❌    | ❌  |

**Impact:** Users must switch to terminal to intervene in running workflows, breaking flow and increasing latency for urgent corrections.

**Files:**

- `src/cli/overseer-cli.ts` - CLI implementation
- `ui/src/ui/views/overseer.ts:1112` - Stalled panel has a "Retry" button that does nothing

---

### 2. **No Mid-Execution Abort in Web UI**

**Current State:** The chat interface has `canAbort` prop and `onAbort` handler wired up (`ui/src/ui/views/chat.ts:36-37, 74`), but:

- Only works during active streaming
- No abort capability for background agent tasks
- No abort for Overseer-dispatched work

**Evidence:**

```typescript
// chat.ts:187
const canAbort = Boolean(props.canAbort && props.onAbort);
```

The CLI has `clawdbrain agent --abort` but this is not exposed in any UI.

**Impact:** Users cannot stop runaway agent operations from the dashboard.

---

### 3. **Execution Approval UX Friction**

**Current State:** `ui/src/ui/views/exec-approval.ts` provides a modal overlay with three options:

- Allow once
- Always allow
- Deny

**Problems:**

1. **No approval history view** - Can't see what was previously approved/denied
2. **No bulk management** - Must handle approvals one-by-one
3. **No pattern-based rules in UI** - `exec-approvals.ts` settings exist but are buried
4. **Timeout pressure** - Approvals have expiry timer with no way to extend
5. **No "allow for this session"** option - Only "once" or "always"

**Files:**

- `ui/src/ui/views/exec-approval.ts` - Approval modal (79 lines, minimal)
- `ui/src/ui/controllers/exec-approval.ts` - Queue management

---

### 4. **Mobile Has No Workflow Visibility**

**Current State:** iOS app (`apps/ios/Sources/RootCanvas.swift`) is primarily a camera/voice interface with:

- Chat sheet for conversations
- Status pill showing gateway connection
- Voice wake functionality

**Missing entirely:**

- No Overseer view
- No agent list
- No session management
- No execution approval handling
- No task breakdown sidebar

**Impact:** Mobile users have zero visibility into agentic workflows - they can only send messages and hope for the best.

---

### 5. **Activity Feed is Passive Only**

**Current State:** `ui/src/ui/views/overseer.ts:1123-1186` renders an activity feed showing:

- Task dispatched events
- Stalled assignments
- Crystallizations
- Goal status changes

**Problems:**

1. **No actionable items** - Events are display-only
2. **No click-through** - Can't jump to related goal/task
3. **No filtering** - Can't focus on errors or a specific agent
4. **No notifications** - Must keep tab open to see updates
5. **Capped at 20 events** - `events.slice(0, 20)` loses history

---

### 6. **Task Sidebar Lacks Intervention Controls**

**Current State:** `ui/src/ui/views/chat-task-sidebar.ts` shows:

- Task tree with status icons
- Activity log entries
- Completion stats

**Missing:**

1. **No cancel/abort per task**
2. **No retry mechanism**
3. **No priority adjustment**
4. **No reassignment to different agent**
5. **No manual completion marking**

The sidebar is read-only observation, not a control surface.

---

### 7. **Agent Events Window (macOS) is Developer-Focused**

**Current State:** `apps/macos/Sources/Clawdbrain/AgentEventsWindow.swift` displays:

- Raw event stream with JSON pretty-printing
- Run ID and sequence numbers
- Timestamp formatting

**Problems:**

1. **Too technical** - Shows raw `[String: AnyCodable]` payloads
2. **No action buttons** - Can only "Clear" history
3. **No filtering** - All events mixed together
4. **No correlation** - Can't link events to goals/sessions
5. **Scroll position resets** - `events.reversed()` in LazyVStack

---

### 8. **Sessions View Lacks Agent Context**

**Current State:** `ui/src/ui/views/sessions.ts` shows session table with:

- Key, label, kind, updated, tokens
- Thinking/verbose/reasoning level controls
- Delete action

**Problems:**

1. **No agent association visible** - Can't see which agent owns which session
2. **No active task indicator** - No way to know if session is running work
3. **No "view logs" shortcut** - Must navigate separately
4. **No session pause/resume**

---

## Human Guidance/Nudging Gaps

### Current Mechanisms

| Mechanism           | Implementation   | UX Quality             |
| ------------------- | ---------------- | ---------------------- |
| Execution approvals | Modal overlay    | ⚠️ Minimal (3 buttons) |
| Thinking level      | Session dropdown | ✅ Adequate            |
| Verbose level       | Session dropdown | ✅ Adequate            |
| Stalled detection   | Passive display  | ❌ No action path      |
| Crystallization     | CLI only         | ❌ No UI               |

### Missing Nudging Capabilities

1. **No "suggest next action"** - Can't prompt agent with hints
2. **No priority override** - Can't reprioritize tasks in flight
3. **No resource limits** - Can't cap tokens/time per task
4. **No checkpoint/rollback** - Can't revert to earlier state
5. **No "explain yourself"** - Can't request reasoning for decisions
6. **No feedback loop** - Can't rate agent performance per task

---

## Recommendations

### High Priority (Immediate UX Wins)

1. **Add goal controls to Overseer UI**
   - Create/pause/resume buttons in header
   - Work node context menu: mark done, block with reason
   - Location: `ui/src/ui/views/overseer.ts`

2. **Wire stalled panel retry button**
   - Currently renders but has no `@click` handler
   - Location: `ui/src/ui/views/overseer.ts:1112`

3. **Add abort button to task sidebar**
   - Per-task abort for in-progress items
   - Location: `ui/src/ui/views/chat-task-sidebar.ts`

4. **Execution approval improvements**
   - Add "allow for session" option
   - Add approval history view
   - Add pattern rule editor in settings

### Medium Priority (Workflow Improvements)

5. **Activity feed enhancements**
   - Click events to navigate to source
   - Filter by severity/agent/goal
   - Configurable history limit
   - Browser notifications for errors

6. **Session-agent linkage**
   - Show agent badge on session rows
   - Add "active task" indicator
   - Quick link to agent's Overseer assignments

7. **macOS Agent Events cleanup**
   - Add filters (by stream, by run, by agent)
   - Add summary cards instead of raw JSON
   - Add action buttons (abort run, view in Overseer)

### Lower Priority (Mobile Parity)

8. **iOS Overseer view**
   - Goal status cards
   - Stalled alert banner
   - Tap to view details

9. **iOS execution approvals**
   - Push notification for pending approvals
   - Quick actions from notification

---

## Architecture Observations

### Strengths

1. **Unified RPC protocol** - All UIs share the same gateway methods
2. **Type-safe event system** - `OverseerGoalStatusResult`, `ChatTask`, etc.
3. **Real-time streaming** - Agent events flow to all connected clients
4. **Modular view layer** - Lit components are composable

### Weaknesses

1. **CLI-first design** - Many features added to CLI before UI
2. **No UI for write operations** - Most views are read-only dashboards
3. **Mobile treated as secondary** - iOS is a companion, not full control surface
4. **No unified intervention panel** - Controls scattered across views

---

## Files Reviewed

| File                                     | Lines | Purpose                |
| ---------------------------------------- | ----- | ---------------------- |
| `ui/src/ui/views/overseer.ts`            | 1188  | Workflow visualization |
| `ui/src/ui/views/exec-approval.ts`       | 79    | Approval modal         |
| `ui/src/ui/views/sessions.ts`            | 488   | Session table          |
| `ui/src/ui/views/chat.ts`                | 300+  | Chat interface         |
| `ui/src/ui/views/chat-task-sidebar.ts`   | 274   | Task breakdown         |
| `src/cli/overseer-cli.ts`                | -     | CLI commands           |
| `apps/macos/.../AgentEventsWindow.swift` | 110   | macOS events           |
| `apps/ios/Sources/RootCanvas.swift`      | 342   | iOS main view          |

---

## Conclusion

The Clawdbrain UI excels at **observability** (seeing what's happening) but is weak at **controllability** (intervening in what's happening). The backend supports rich intervention via CLI, but this power isn't surfaced in the graphical interfaces. For agentic workflows where human oversight is critical, this creates a dangerous gap where users can watch problems unfold but struggle to respond quickly.

The highest-impact improvement would be adding goal management controls directly to the Overseer view, eliminating the need to context-switch to CLI for basic supervision tasks.
