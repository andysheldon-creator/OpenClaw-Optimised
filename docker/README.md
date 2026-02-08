# Clawdbot Docker Stack

This stack runs Clawdbot with an embedded n8n instance behind an Nginx reverse proxy.

## Services

| Service            | Purpose                                 | Internal Port |
| ------------------ | --------------------------------------- | ------------- |
| `openclaw-gateway` | OpenClaw gateway + control-plane RPC    | `18789`       |
| `dashboard`        | Clawdbot dashboard (Vite preview)       | `5174`        |
| `n8n`              | Embedded workflow engine                | `5678`        |
| `nginx`            | Single-origin reverse proxy             | `80`          |
| `postgres`         | n8n persistence                         | `5432`        |
| `redis`            | Optional workflow/queue cache transport | `6379`        |

Nginx exposes one host entrypoint:

- `http://localhost:8080/` -> Dashboard (monitoring, runs, approvals)
- `http://localhost:8080/chat/` -> Chat UI (talk to the agent)
- `http://localhost:8080/workflows/editor` -> Dashboard with embedded n8n canvas
- `http://localhost:8080/workflows/` -> n8n editor (standalone)
- `ws://localhost:8080/gateway/ws` -> Gateway WebSocket

## Quick Start

### 1. Build and start

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### 2. Run interactive onboarding (first time only)

The gateway needs an AI provider to function. Run the onboarding wizard
inside the container:

```bash
docker exec -it clawdbot-openclaw-gateway node dist/index.js onboard
```

This will walk you through:

- **Risk acknowledgement**
- **AI provider auth** (OpenAI Codex OAuth, API key, Anthropic, etc.)
- **Default model selection**
- **Channel setup** (skip if using env vars for Telegram)
- **Tool API keys** (Brave search, Firecrawl, etc.)

For OpenAI Codex OAuth: the wizard shows a URL to open in your browser.
After signing in, the browser redirects to `http://localhost:1455/auth/callback`
which the container captures automatically (port 1455 is mapped to the host).
If the callback doesn't auto-complete, paste the full redirect URL back into
the terminal.

All credentials persist in the `openclaw_state` Docker volume. You only
need to run onboarding once unless you wipe volumes.

### 3. Open the Chat UI

- `http://localhost:8080/chat/` — talk to the agent

The dashboard at `http://localhost:8080/` is for monitoring runs,
approvals, and workflows. The Chat UI is where you actually interact
with the agent.

Default gateway token: `dev-local-token`

## Telegram

To connect a Telegram bot, set the token before starting:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF docker compose -f docker/docker-compose.yml up -d
```

The gateway auto-detects the token and starts the Telegram channel.
No additional config needed.

## Gateway Initialization

The gateway uses an entrypoint script (`docker/gateway-entrypoint.sh`) that
handles first-run and subsequent-run config automatically:

**First run** (no init marker in the volume):

- Seeds gateway config: mode, bind, auth, trusted proxies, Control UI basePath
- Writes an init marker so the full seed is not repeated

**Subsequent runs** (init marker exists):

- Patches only env-driven values (token, trusted proxies) so they
  stay in sync with docker-compose environment variables
- Preserves any manual config changes you made via `openclaw config set`

**Volume reset** (`docker compose down -v`):

- Removes the init marker, config, and credentials — next start does a fresh
  seed, and you'll need to re-run onboarding

Config and credentials are stored in the `openclaw_state` volume at
`/home/node/.openclaw/`.

## Key Environment Variables

You can override these when starting compose:

- `OPENCLAW_GATEWAY_TOKEN` (default: `dev-local-token`)
- `OPENCLAW_GATEWAY_PORT` (default: `18789`)
- `OPENCLAW_TRUSTED_PROXIES` (default: `172.28.0.10` — the nginx container IP)
- `TELEGRAM_BOT_TOKEN` (optional; auto-enables Telegram channel)
- `OPENCLAW_N8N_BASE_URL` (default: `http://n8n:5678/workflows`)
- `OPENCLAW_N8N_API_KEY` (optional; set if your n8n API is secured)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `POSTGRES_PORT`, `REDIS_PORT`

Example:

```bash
OPENCLAW_GATEWAY_TOKEN=my-token \
TELEGRAM_BOT_TOKEN=123456:ABC-DEF \
docker compose -f docker/docker-compose.yml up -d --build
```

## Verification

```bash
docker compose -f docker/docker-compose.yml ps
curl http://localhost:8080/health
```

## Stop

```bash
docker compose -f docker/docker-compose.yml down
```

Remove volumes too (resets all state including credentials):

```bash
docker compose -f docker/docker-compose.yml down -v
```
