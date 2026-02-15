# Mission Control Integration

> Embedding [Danm72/mission-control](https://github.com/Danm72/mission-control) alongside
> the built-in Control UI in OpenClaw-Optimised.

---

## 1. What Is Mission Control?

Mission Control is a **SaaS coordination layer for AI agent squads** built to
work with OpenClaw. It provides:

| Capability | Description |
|------------|-------------|
| Squad Design Chat | Conversational Claude UI for defining agent roles, personalities, workflows |
| One-Click Deploy | Setup URLs that bootstrap agent ecosystems locally |
| Heartbeat System | Periodic agent check-ins (every 2-5 min, staggered) |
| Task Management | Full Kanban lifecycle: inbox -> assigned -> in_progress -> review -> done/blocked |
| Team Comms | Squad-wide broadcasts, DMs, task comments with @mentions |
| Document Storage | Agents can create and retrieve drafts, research, protocols |
| Real-time Dashboard | Monitor agents, tasks, activity via Supabase Realtime |

**Self-described status:** "a proof of concept that is barely functional."

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, `output: "standalone"`) |
| Runtime | Node.js >= 22 |
| Language | TypeScript |
| React | React 19 |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (dashboard) + API key per squad (agents) |
| AI | Anthropic Claude via `@ai-sdk/anthropic` + Vercel AI SDK |
| UI | Tailwind CSS 4, Radix UI, Lucide icons, dnd-kit |
| Rate Limiting | Upstash Redis (optional) |
| Monorepo | pnpm 9.15 workspaces + Turborepo |

---

## 3. Repository Structure

```
Danm72/mission-control/
  apps/
    web/              Next.js dashboard + API (the main app)
    gateway/          Placeholder (.gitkeep only)
  packages/
    database/         Supabase client, types, 12-table schema, migrations
    shared/           Shared utilities
  skills/
    mission-control/          Runtime skill (SKILL.md + HEARTBEAT.md)
    mission-control-setup/    Bootstrap skill (SKILL.md)
  agents/
    lead/             Lead agent SOUL.md template
    social/           Social agent SOUL.md template
    writer/           Writer agent SOUL.md template
  ralph/              Shell scripts (migration/maintenance)
```

---

## 4. How It Connects to OpenClaw

**Architecture: REST API pull model (no WebSocket, no Gateway dependency).**

OpenClaw agents poll Mission Control's REST API on a heartbeat schedule:

```
Agent (OpenClaw)                    Mission Control (Next.js)
     |                                       |
     |--- POST /api/heartbeat ------------->|  (status update)
     |<-- 200 { notifications, spec_hash } --|
     |                                       |
     |--- GET  /api/tasks ----------------->|  (fetch assigned work)
     |<-- 200 { tasks[] } ------------------|
     |                                       |
     |--- GET  /api/squad-chat ------------->|  (check team messages)
     |<-- 200 { messages[] } ----------------|
```

**Two OpenClaw Skills:**

1. **`mission-control-setup`** (bootstrap) -- triggered by setup URL, creates
   agent sessions, writes SOUL.md files, installs runtime skill, configures
   cron heartbeats. One-time setup token expires after 24 hours.

2. **`mission-control`** (runtime) -- runs on every heartbeat: POST heartbeat ->
   process notifications -> GET tasks -> GET squad-chat -> act on urgent items.

**Authentication per request:**
```
Authorization: Bearer mc_{prefix}_{secret}
X-Agent-Name: {agent_name}
Content-Type: application/json
```

---

## 5. Existing Control UI Architecture

The built-in Control UI (`ui/` directory) is served by the Gateway at `/`:

| Property | Value |
|----------|-------|
| Framework | Vite + Lit (Web Components) |
| Build output | `dist/control-ui/` (static files) |
| Served by | `handleControlUiHttpRequest()` in `src/gateway/control-ui.ts` |
| Prefix | `/` (root) with `/assets/` for static resources |
| Auth | WebSocket handshake token/password |
| Config | `gateway.controlUi.enabled` (default: true) |

**HTTP handler chain in `server.ts` (line 1885):**

```
Request --> handleHooksRequest
        --> handleA2uiHttpRequest   (canvas)
        --> canvasHost.handleHttpRequest
        --> handleControlUiHttpRequest  (Control UI)
        --> 404 Not Found
```

Each handler returns `boolean`: `true` = handled, `false` = pass to next.

---

## 6. Can We Serve It as Static Files?

**No.** Mission Control is NOT a static site. It requires a Node.js server:

- 17+ API route handlers (`/api/heartbeat`, `/api/tasks`, `/api/squad-chat`, etc.)
- `output: "standalone"` (not `export`)
- Server-side Supabase operations with service role key
- Server-side Claude AI streaming for onboarding chat
- bcrypt password hashing, rate limiting

---

## 7. Integration Options

### Option A: Reverse-Proxy Through Gateway (Recommended)

Add a new HTTP handler in the gateway that proxies requests at `/mc/` to a
local Mission Control instance running on its own port.

| Component | Detail |
|-----------|--------|
| Mission Control | Runs as separate process on port 3100 |
| Gateway handler | `handleMissionControlProxy()` at `/mc/*` |
| Config key | `gateway.missionControl.enabled` + `gateway.missionControl.url` |
| Auth | Gateway auth layer protects the proxy; MC has its own auth |

**Pros:** Single entry-point URL, gateway auth wraps MC, no CORS issues.
**Cons:** Adds proxy complexity, WebSocket upgrade forwarding needed if MC uses it.

### Option B: Docker Compose Side-by-Side (Simplest)

Run Mission Control alongside the Gateway in Docker with shared networking:

```yaml
services:
  openclaw-gateway:
    image: openclaw:local
    ports:
      - "18789:18789"

  mission-control:
    build: ./mission-control
    ports:
      - "3100:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=...
      - SUPABASE_SERVICE_ROLE_KEY=...
      - ANTHROPIC_API_KEY=...

  postgres:
    image: supabase/postgres:15
    ports:
      - "54332:5432"

  supabase-auth:
    image: supabase/gotrue
    ports:
      - "9998:9999"
```

| URL | Service |
|-----|---------|
| `http://localhost:18789/` | OpenClaw Control UI |
| `http://localhost:3100/` | Mission Control Dashboard |

**Pros:** Zero gateway changes, clean separation, easiest to maintain.
**Cons:** Two URLs to bookmark, separate auth.

### Option C: Nginx/Caddy Front-End (Production)

Put a reverse proxy in front of both services:

```
https://ai.example.com/         --> OpenClaw Gateway :18789
https://ai.example.com/mc/      --> Mission Control :3000
```

**Pros:** Single domain + TLS, production-grade, supports WebSocket upgrade.
**Cons:** Extra infra component.

---

## 8. Required Environment Variables

### Mission Control Core (Required)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server-side) |
| `SUPABASE_JWT_SECRET` | JWT signing secret |
| `POSTGRES_URL` | Direct database connection |
| `ANTHROPIC_API_KEY` | Claude API key for onboarding |
| `SUPABASE_PROJECT_ID` | Supabase project identifier |

### Mission Control Optional

| Variable | Purpose |
|----------|---------|
| `UPSTASH_REDIS_REST_URL` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting auth |
| `TELEGRAM_BOT_TOKEN` | Notification integration |
| `TELEGRAM_CHAT_ID` | Notification target |

### Agent-Side Requirements

| Requirement | Detail |
|-------------|--------|
| Skill installed | `~/.openclaw/skills/mission-control/` |
| HEARTBEAT.md | In agent workspace directory |
| Config entry | `heartbeat: {}` in `openclaw.json` |
| Env var | `MISSION_CONTROL_API_KEY=mc_{prefix}_{secret}` |

---

## 9. Database Schema (12 Tables)

| Table | Purpose |
|-------|---------|
| `squads` | Team/org container |
| `agent_specs` | Agent role definitions + SOUL.md content |
| `agents` | Runtime agent instances + status |
| `tasks` | Kanban task records |
| `task_assignees` | M:N task-to-agent assignments |
| `messages` | Task-scoped messages |
| `squad_chat` | Team-wide chat messages |
| `direct_messages` | Agent-to-agent DMs |
| `notifications` | Unread notification queue |
| `documents` | Agent-created documents |
| `activities` | Activity feed/audit log |
| `watch_items` | Subscription watches |

All tables use Supabase Row-Level Security (RLS) for multi-tenant isolation.

---

## 10. Integration Docker Compose (Full Stack)

Mission Control provides a full local stack via `./scripts/docker-integration.sh`:

| Service | Port | Purpose |
|---------|------|---------|
| Mission Control | 3100 | Web dashboard + API |
| OpenClaw Gateway | 18789 | Agent coordination |
| PostgreSQL | 54332 | Database |
| GoTrue | 9998 | Auth service |
| PostgREST | 3001 | Auto-generated REST API |
| Kong | 8000 | API gateway for Supabase |

---

## 11. Implementation Plan

### Phase 1: Standalone Side-by-Side (Option B)

**Effort:** ~2 hours | **Risk:** Low

1. Clone `Danm72/mission-control` into workspace
2. Configure `.env.local` with Supabase credentials
3. Run `pnpm install && pnpm --filter @mission-control/database db:push`
4. Start with `pnpm dev` on port 3100
5. Verify dashboard loads at `http://localhost:3100`
6. Install MC skills into OpenClaw: copy `skills/mission-control/` to `~/.openclaw/skills/`
7. Test agent heartbeat cycle end-to-end

### Phase 2: Gateway Proxy Handler (Option A)

**Effort:** ~4 hours | **Risk:** Medium

1. Add `MissionControlConfig` type to `src/config/config.ts`:
   ```typescript
   export type MissionControlConfig = {
     enabled?: boolean;      // default: false
     url?: string;           // default: "http://127.0.0.1:3100"
     basePath?: string;      // default: "/mc"
   };
   ```
2. Create `src/gateway/mission-control-proxy.ts`:
   - Pattern follows `control-ui.ts` handler signature
   - Strips `/mc` prefix, forwards to MC `url`
   - Proxies request body + headers, returns response
   - Handles WebSocket upgrade if needed
3. Wire into HTTP handler chain in `server.ts` (before Control UI handler)
4. Add config docs to `docs/configuration.md`

### Phase 3: Production Deployment (Option C)

**Effort:** ~2 hours | **Risk:** Low

1. Add Caddy/Nginx config template to `config/reverse-proxy/`
2. Docker Compose production profile with TLS
3. Health check endpoints for both services

---

## 12. Remaining Considerations

| Item | Notes |
|------|-------|
| Supabase dependency | MC requires a full Supabase stack (hosted or local Docker) |
| Dual auth | Gateway auth and MC Supabase auth are separate; consider SSO |
| Resource overhead | MC is a full Next.js server + Supabase -- non-trivial memory |
| MC maturity | Self-described as "barely functional" POC -- expect rough edges |
| Upstream sync | MC is actively developed; pin to a commit hash for stability |
| Agent skill install | Each agent needs the MC skill + HEARTBEAT.md manually installed |
| API key management | Each squad needs its own `mc_{prefix}_{secret}` API key |
