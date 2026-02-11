# Mission Control Setup Guide

## What You Need To Provide

### 1. GitHub Token (Required for PRs)

Create a Personal Access Token:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`
4. Copy the token (starts with `ghp_`)

### 2. Repository Settings

Edit `/Users/claw/.openclaw/workspace/rifthome/mission-control/.env`:

```bash
# Required
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=yourusername/yourrepo
GITHUB_BRANCH=main

# OpenClaw Gateway (usually auto-detected)
OPENCLAW_GATEWAY_URL=http://127.0.0.1:8080
OPENCLAW_GATEWAY_TOKEN=your-gateway-token  # Get from ~/.openclaw/profiles/dev/config.json
```

### 3. GitHub Webhook Setup

In your GitHub repo:

1. Settings → Webhooks → Add webhook
2. Payload URL: `http://localhost:3000/api/webhooks/github`
3. Content type: `application/json`
4. Events: Select **Pull requests** and **Pull request reviews**
5. Active: ✓

### 4. Start Everything

```bash
cd /Users/claw/.openclaw/workspace/rifthome

# Option A: Start Mission Control manually
./scripts/start-mission-control.sh

# Option B: Start with Gateway (coming soon)
pnpm gateway:dev:mc
```

### Dashboard: http://localhost:3000

## How It Works

1. **Create task** in Mission Control
2. **Click "Assign Agent"** → Branch created + Agent spawned
3. **Agent works** → Commits to branch → Creates PR
4. **Webhook fires** → Task moves to "Review"
5. **You review PR** on GitHub:
   - Approve → Merge → Task → "Done"
   - Request changes → Task → "Revising" → Agent fixes
6. **Revision loop** continues until approved

## Troubleshooting

### "Failed to create Git branch"

- Check GITHUB_TOKEN is valid
- Check GITHUB_REPO format (owner/repo)
- Ensure token has `repo` scope

### "OpenClaw spawn failed"

- Gateway must be running on :8080
- Check OPENCLAW_GATEWAY_TOKEN

### Webhooks not firing

- Verify webhook URL is accessible from GitHub
- Check ngrok if running locally (http://localhost won't work from GitHub)

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   GitHub    │──────│ Mission Ctrl │──────│  OpenClaw   │
│   (PRs)     │◀─────│  (:3000)     │─────▶│ GW (:8080)  │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ mission_control.db
                     │ episodic_memory.db
                     └──────────────┘
```
