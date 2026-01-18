# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## 1Password Access

**IMPORTANT:** Use the existing `op-safe` tmux session for all 1Password operations!
- Session name: `op-safe` (default tmux socket)
- Already authenticated (may need re-auth periodically)
- Commands: `tmux send-keys -t op-safe "op <command>" Enter`
- Capture output: `tmux capture-pane -p -t op-safe -S -20`

Do NOT create new tmux sessions for op commands — use op-safe!

## SSH Hosts

### synology
- **IP**: 192.168.4.84
- **User**: dbhurley
- **Port**: 22
- **Services**: Plex, Radarr, Sonarr, SABnzbd, Home Assistant
- **Use**: `ssh synology`

### mac-mini (Steve's Brain) ✅ ONLINE
- **IP**: 192.168.7.86
- **Hostname**: steve.local
- **User**: steve
- **Password**: BendDontBreak!
- **Specs**: Mac mini M4 Pro, 14 cores, 64GB RAM, 926GB SSD
- **macOS**: 26.1 (Sequoia)
- **Services**: Future "brain" - will host migrated services
- **Git Repo**: /users/steve/git
- **Use**: `ssh mac-mini` or `ssh steve@192.168.7.86`

## Smart Home

### Hue Bridge
- **IP**: 192.168.4.95
- **Status**: Connection issues as of Jan 4, 2026
- **Rooms**: Master Suite (need to map lights)

## Media Server (Synology)

- **Plex**: http://192.168.4.84:32400
- **Radarr**: http://192.168.4.84:7878
- **Sonarr**: http://192.168.4.84:8989
- **SABnzbd**: http://192.168.4.84:8080

## Package Managers

**Use pnpm for global packages** (it's first in PATH):
```bash
pnpm add -g <package>    # ✅ correct
npm install -g <package>  # ❌ goes to wrong location
```

Global bins: `/Users/steve/Library/pnpm/`

## Twitter/X

### Steve's Account (@Steve_Hurley_)
- **Script:** `scripts/steve-tweet.sh` (uses my own cookies)
- **Usage:** `scripts/steve-tweet.sh <command> [args]`
- **Examples:**
  - `scripts/steve-tweet.sh whoami` — verify auth
  - `scripts/steve-tweet.sh tweet "Hello!"` — post a tweet
  - `scripts/steve-tweet.sh read <url>` — read a tweet
- **Config:** Credentials in `~/.clawdbot/clawdbot.json` under `skills.entries.bird`

### David's Account (default `bird` command)
- Uses browser cookies automatically
- Just run `bird <command>` for David's account

## Webhooks

### TradingView
- **URL**: `https://stevehooks.ngrok.app/hooks/tradingview?token=tv-webhook-8f3k2m9x`
- **Tunnel**: stevehooks.ngrok.app → localhost:18789
- **Config**: hooks.mappings in clawdbot.json

### MS Teams
- **Tunnel**: opie.ngrok.app → localhost:3978

## Credentials Access

### Standard: clawdbot.json
All credentials should be stored in `~/.clawdbot/clawdbot.json` under `skills.entries.<skill-name>.env`:
```json
{
  "skills": {
    "entries": {
      "my-skill": {
        "env": {
          "MY_API_KEY": "...",
          "MY_SECRET": "..."
        }
      }
    }
  }
}
```

Scripts run by cron jobs can reference these via environment variables in the job prompt, or the agent can read them at runtime.

### Fallback: 1Password
If a credential is **not** in clawdbot.json, use the 1Password skill via the `op-safe` tmux session:
```bash
tmux send-keys -t op-safe "op item get 'Item Name' --fields password" Enter
tmux capture-pane -p -t op-safe -S -5
```

### Cron Script Guidelines
- **Never hardcode credentials** in scripts
- Scripts should output meaningful text for actions, or **nothing** for no-action (silent ack)
- HEARTBEAT_OK only works for heartbeat runs, not isolated cron sessions

---

Add whatever helps you do your job. This is your cheat sheet.
