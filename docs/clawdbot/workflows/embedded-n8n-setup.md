# Embedded n8n Setup

This guide covers how the n8n workflow engine is embedded inside the Clawdbot stack, how the Docker Compose configuration works, and how to get it running locally.

## Architecture

n8n runs as a Docker container behind an Nginx reverse proxy. The Clawdbot dashboard loads the n8n editor in an iframe at the `/workflows` path. The reverse proxy ensures both the dashboard and n8n share a single origin, avoiding cross-origin issues.

```
Browser
  |
  +-- /            -> Dashboard (dashboard:5174)
  +-- /workflows/* -> n8n editor (n8n:5678)
  +-- /gateway/*   -> OpenClaw gateway (openclaw-gateway:18789)
  +-- /health      -> Nginx health check
  |
  [Nginx :8080]
      |
      +-- upstream dashboard
      +-- upstream n8n
      +-- upstream openclaw-gateway
      |
      [Postgres :5432]  [Redis :6379]
```

## Prerequisites

- Docker and Docker Compose v2+
- Node 22+ (for the Clawdbot dashboard and CLI)
- Ports 5432, 5678, 6379, and 8080 available

## Starting the Stack

From the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

This starts six services:

| Service            | Image              | Port  | Purpose                         |
| ------------------ | ------------------ | ----- | ------------------------------- |
| `openclaw-gateway` | `openclaw:local`   | 18789 | Gateway runtime + control plane |
| `dashboard`        | `openclaw:local`   | 5174  | Dashboard UI                    |
| `postgres`         | postgres:16-alpine | 5432  | Shared database                 |
| `redis`            | redis:7-alpine     | 6379  | Caching and pub/sub             |
| `n8n`              | n8nio/n8n:latest   | 5678  | Workflow engine                 |
| `nginx`            | nginx:alpine       | 8080  | Reverse proxy (single origin)   |

On startup, the `openclaw-gateway` container also initializes local gateway settings so the dashboard can connect through Nginx:

- `gateway.mode=local`
- `gateway.bind=lan`
- `gateway.auth.mode=token`
- `gateway.auth.token=$OPENCLAW_GATEWAY_TOKEN` (defaults to `dev-local-token`)
- `gateway.controlUi.allowInsecureAuth=true` (local container profile)

## Key Environment Variables

The `n8n` service is configured with these settings in `docker/docker-compose.yml`:

| Variable                      | Value                              | Why                                              |
| ----------------------------- | ---------------------------------- | ------------------------------------------------ |
| `N8N_DISABLE_X_FRAME_OPTIONS` | `true`                             | Allow embedding in an iframe                     |
| `N8N_EDITOR_BASE_URL`         | `http://localhost:8080/workflows/` | Editor assets served under `/workflows`          |
| `N8N_PATH`                    | `/workflows`                       | API routes prefixed with `/workflows`            |
| `N8N_BASIC_AUTH_ACTIVE`       | `false`                            | Auth handled by the Clawdbot dashboard (not n8n) |
| `WEBHOOK_URL`                 | `http://localhost:8080/workflows`  | External webhook base URL                        |
| `DB_TYPE`                     | `postgresdb`                       | Use Postgres instead of SQLite                   |
| `OPENCLAW_N8N_BASE_URL`       | `http://n8n:5678/workflows`        | Gateway inventory sync target                    |

## Nginx Reverse Proxy

The Nginx config at `docker/nginx/default.conf` routes traffic:

- `location /workflows/` proxies to the n8n upstream with WebSocket support (required for the n8n editor's real-time updates)
- `location /gateway/ws` proxies dashboard websocket traffic to the OpenClaw gateway
- `location /gateway/` proxies gateway HTTP endpoints
- `location /` proxies to the dashboard upstream
- `location /health` returns a simple 200 for load balancer health checks

WebSocket headers (`Upgrade`, `Connection`) are set on `/workflows/` and `/gateway/ws`.

`/workflows/` currently uses 600-second proxy connect/send/read timeouts in `docker/nginx/default.conf`.

## Clawdbot Custom Nodes

The `n8n-nodes-clawdbot` package provides custom n8n nodes that bridge to the Clawdbot runtime:

- **Clawdbot Skill** -- invoke any registered skill
- **Clawdbot Approval Gate** -- pause for human approval via the dashboard
- **Clawdbot Artifact** -- store outputs as run artifacts

To make these available inside n8n, mount or install the package into the n8n container. Add to the `n8n` service volumes:

```yaml
volumes:
  - n8n_data:/home/node/.n8n
  - ../node_modules/n8n-nodes-clawdbot:/home/node/.n8n/nodes/n8n-nodes-clawdbot
```

## Data Bridge

The Clawdbot runtime communicates with n8n through the data bridge (`src/clawdbot/workflows/data-bridge.ts`). In development, an in-memory implementation is used. For production, configure Redis pub/sub by setting:

```
CLAWDBOT_BRIDGE_TRANSPORT=redis
CLAWDBOT_BRIDGE_REDIS_URL=redis://redis:6379
```

## Verifying the Setup

1. Check all containers are running:

```bash
docker compose -f docker/docker-compose.yml ps
```

2. Hit the health endpoint:

```bash
curl http://localhost:8080/health
```

3. Open the n8n editor directly:

```
http://localhost:8080/workflows/
```

4. Open the full dashboard:

```
http://localhost:8080/
```

5. Verify gateway websocket upgrade through Nginx:

```bash
curl -i --max-time 3 --http1.1 \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Authorization: Bearer dev-local-token' \
  http://localhost:8080/gateway/ws
```

## Stopping the Stack

```bash
docker compose -f docker/docker-compose.yml down
```

To also remove persisted volumes (database, n8n data, Redis):

```bash
docker compose -f docker/docker-compose.yml down -v
```

## Troubleshooting

**n8n editor shows a blank page in the iframe**

- Confirm `N8N_DISABLE_X_FRAME_OPTIONS` is set to `true`
- Check browser console for `X-Frame-Options` or CSP errors
- Ensure the Nginx proxy is running and `/workflows/` is reachable

**WebSocket connection drops**

- Verify the Nginx config includes `proxy_set_header Upgrade` and `proxy_set_header Connection "upgrade"`
- Check that timeouts are long enough (default is 7 days in the provided config)

**Custom nodes not appearing in n8n palette**

- Confirm the `n8n-nodes-clawdbot` volume mount is correct
- Restart the n8n container after mounting: `docker compose -f docker/docker-compose.yml restart n8n`
- Check n8n logs: `docker compose -f docker/docker-compose.yml logs n8n`

## Related

- [Workflows Guide](/clawdbot/workflows/guide)
- [Template Library](/clawdbot/workflows/template-library)
- [Architecture Overview](/clawdbot/architecture/overview)
