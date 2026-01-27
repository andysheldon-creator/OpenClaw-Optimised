---
summary: "Setup guide: keep your Clawdbrain setup tailored while staying up-to-date"
read_when:
  - Setting up a new machine
  - You want “latest + greatest” without breaking your personal setup
---

# Setup

Last updated: 2026-01-01

## TL;DR
- **Tailoring lives outside the repo:** `~/clawd` (workspace) + `~/.clawdbrain/clawdbrain.json` (config).
- **Stable workflow:** install the macOS app; let it run the bundled Gateway.
- **Bleeding edge workflow:** run the Gateway yourself via `pnpm gateway:watch`, then let the macOS app attach in Local mode.

## Prereqs (from source)
- Node `>=22`
- `pnpm`
- Docker (optional; only for containerized setup/e2e — see [Docker](/install/docker))

## Tailoring strategy (so updates don’t hurt)

If you want “100% tailored to me” *and* easy updates, keep your customization in:

- **Config:** `~/.clawdbrain/clawdbrain.json` (JSON/JSON5-ish)
- **Workspace:** `~/clawd` (skills, prompts, memories; make it a private git repo)

Bootstrap once:

```bash
clawdbrain setup
```

From inside this repo, use the local CLI entry:

```bash
clawdbrain setup
```

If you don’t have a global install yet, run it via `pnpm clawdbrain setup`.

## Stable workflow (macOS app first)

1) Install + launch **Clawdbrain.app** (menu bar).
2) Complete the onboarding/permissions checklist (TCC prompts).
3) Ensure Gateway is **Local** and running (the app manages it).
4) Link surfaces (example: WhatsApp):

```bash
clawdbrain channels login
```

5) Sanity check:

```bash
clawdbrain health
```

If onboarding is not available in your build:
- Run `clawdbrain setup`, then `clawdbrain channels login`, then start the Gateway manually (`clawdbrain gateway`).

## Bleeding edge workflow (Gateway in a terminal)

Goal: work on the TypeScript Gateway, get hot reload, keep the macOS app UI attached.

### 0) (Optional) Run the macOS app from source too

If you also want the macOS app on the bleeding edge:

```bash
./scripts/restart-mac.sh
```

### 1) Start the dev Gateway

```bash
pnpm install
pnpm gateway:watch
```

`gateway:watch` runs the gateway in watch mode and reloads on TypeScript changes.

### 2) Point the macOS app at your running Gateway

In **Clawdbrain.app**:

- Connection Mode: **Local**
The app will attach to the running gateway on the configured port.

### 3) Verify

- In-app Gateway status should read **“Using existing gateway …”**
- Or via CLI:

```bash
clawdbrain health
```

### Common footguns
- **Wrong port:** Gateway WS defaults to `ws://127.0.0.1:18789`; keep app + CLI on the same port.
- **Where state lives:**
  - Credentials: `~/.clawdbrain/credentials/`
  - Sessions: `~/.clawdbrain/agents/<agentId>/sessions/`
  - Logs: `/tmp/clawdbrain/`

## Credential storage map

Use this when debugging auth or deciding what to back up:

- **WhatsApp**: `~/.clawdbrain/credentials/whatsapp/<accountId>/creds.json`
- **Telegram bot token**: config/env or `channels.telegram.tokenFile`
- **Discord bot token**: config/env (token file not yet supported)
- **Slack tokens**: config/env (`channels.slack.*`)
- **Pairing allowlists**: `~/.clawdbrain/credentials/<channel>-allowFrom.json`
- **Model auth profiles**: `~/.clawdbrain/agents/<agentId>/agent/auth-profiles.json`
- **Legacy OAuth import**: `~/.clawdbrain/credentials/oauth.json`
More detail: [Security](/gateway/security#credential-storage-map).

## Updating (without wrecking your setup)

- Keep `~/clawd` and `~/.clawdbrain/` as “your stuff”; don’t put personal prompts/config into the `clawdbrain` repo.
- Updating source: `git pull` + `pnpm install` (when lockfile changed) + keep using `pnpm gateway:watch`.

## Linux (systemd user service)

Linux installs use a systemd **user** service. By default, systemd stops user
services on logout/idle, which kills the Gateway. Onboarding attempts to enable
lingering for you (may prompt for sudo). If it’s still off, run:

```bash
sudo loginctl enable-linger $USER
```

For always-on or multi-user servers, consider a **system** service instead of a
user service (no lingering needed). See [Gateway runbook](/gateway) for the systemd notes.

## Related docs

- [Gateway runbook](/gateway) (flags, supervision, ports)
- [Gateway configuration](/gateway/configuration) (config schema + examples)
- [Discord](/channels/discord) and [Telegram](/channels/telegram) (reply tags + replyToMode settings)
- [Clawdbrain assistant setup](/start/clawd)
- [macOS app](/platforms/macos) (gateway lifecycle)
