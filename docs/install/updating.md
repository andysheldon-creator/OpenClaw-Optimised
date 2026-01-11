---
summary: "Updating Clawdbot safely (npm or source), plus rollback strategy"
read_when:
  - Updating Clawdbot
  - Something breaks after an update
---

# Updating

Clawdbot is moving fast (pre “1.0”). Treat updates like shipping infra: update → run checks → restart → verify.

## Before you update

- Know how you installed: **npm** (global) vs **from source** (git clone).
- Know how your Gateway is running: **foreground terminal** vs **supervised service** (launchd/systemd).
- Snapshot your tailoring:
  - Config: `~/.clawdbot/clawdbot.json`
  - Credentials: `~/.clawdbot/credentials/`
  - Workspace: `~/clawd`

## Update (npm install)

Global install (pick one):

```bash
npm i -g clawdbot@latest
```

```bash
pnpm add -g clawdbot@latest
```

Then:

```bash
clawdbot doctor
clawdbot gateway restart
clawdbot health
```

Notes:
- If your Gateway runs as a service, `clawdbot gateway restart` is preferred over killing PIDs.
- If you’re pinned to a specific version, see “Rollback / pinning” below.

## Update (from source)

From the repo checkout:

```bash
git pull
pnpm install
pnpm build
pnpm ui:install
pnpm ui:build
pnpm clawdbot doctor
pnpm clawdbot health
```

Notes:
- `pnpm build` matters when you run the packaged `clawdbot` binary ([`dist/entry.js`](https://github.com/clawdbot/clawdbot/blob/main/dist/entry.js)) or use Node to run `dist/`.
- If you run directly from TypeScript (`pnpm clawdbot ...` / `bun run clawdbot ...`), a rebuild is usually unnecessary, but **config migrations still apply** → run doctor.

## macOS: “I pull from git and run the Gateway in the background”

This is the recommended workflow when you:
- run from a repo checkout
- want the Gateway supervised (LaunchAgent) instead of tied to a terminal
- pull updates regularly

### One-time setup (install LaunchAgent)

Install the Gateway LaunchAgent (daemon) via the onboarding wizard once:

```bash
bun run clawdbot onboard --non-interactive \
  --mode local \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills \
  --skip-health
```

Notes:
- **Use `--daemon-runtime node` if you use WhatsApp**. Bun’s WebSocket implementation is currently incompatible with Baileys on reconnect (can crash / corrupt memory).
- If you prefer `pnpm`, use `pnpm clawdbot ...` instead of `bun run clawdbot ...`.

### Every time you pull (fast, safe checklist)

From your repo checkout:

```bash
git pull

# Pick ONE and stick with it:
bun install

# Update dist/ for Node-supervised services:
bun run build

# Migrations + safety checks:
bun run clawdbot doctor

# Restart the supervised Gateway:
bun run clawdbot gateway restart
```

Alternative restart (launchd directly):

```bash
launchctl kickstart -k gui/$UID/com.clawdbot.gateway
```

Logs:
- `~/.clawdbot/logs/gateway.log` (stdout)
- `~/.clawdbot/logs/gateway.err.log` (stderr)

### Updating the macOS app (if you run it from this repo)

If you’re developing/running **Clawdbot.app** from source, rebuild + relaunch it after pulls:

```bash
./scripts/restart-mac.sh
```

## Always run: `clawdbot doctor`

Doctor is the “safe update” command. It’s intentionally boring: repair + migrate + warn.

Typical things it does:
- Migrate deprecated config keys / legacy config file locations.
- Audit DM policies and warn on risky “open” settings.
- Check Gateway health and can offer to restart.
- Detect and migrate older gateway services (launchd/systemd; legacy schtasks) to current Clawdbot services.
- On Linux, ensure systemd user lingering (so the Gateway survives logout).

Details: [Doctor](/gateway/doctor)

## Start / stop / restart the Gateway

CLI (works regardless of OS):

```bash
clawdbot gateway stop
clawdbot gateway restart
clawdbot gateway --port 18789
```

If you’re supervised:
- macOS launchd (app-bundled LaunchAgent): `launchctl kickstart -k gui/$UID/com.clawdbot.gateway`
- Linux systemd user service: `systemctl --user restart clawdbot-gateway.service`
- Windows (WSL2): `systemctl --user restart clawdbot-gateway.service`

Runbook + exact service labels: [Gateway runbook](/gateway)

## Rollback / pinning (when something breaks)

### Pin (npm)

Install a known-good version:

```bash
npm i -g clawdbot@2026.1.7
```

Then restart + re-run doctor:

```bash
clawdbot doctor
clawdbot gateway restart
```

### Pin (source) by date

Pick a commit from a date (example: “state of main as of 2026-01-01”):

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
```

Then reinstall deps + restart:

```bash
pnpm install
pnpm build
clawdbot gateway restart
```

If you want to go back to latest later:

```bash
git checkout main
git pull
```

## If you’re stuck

- Run `clawdbot doctor` again and read the output carefully (it often tells you the fix).
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: https://discord.gg/clawd
