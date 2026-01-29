# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## System Cron Jobs (launchd)

These run independently of the gateway via macOS launchd. You can manage them:

```bash
# List all jobs
launchctl list | grep com.steve.cron

# Run a job manually
/Users/steve/clawd/personal-scripts/cron-wrappers/<name>.sh

# Disable a job
launchctl bootout gui/501/com.steve.cron.<name>

# Re-enable a job
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.steve.cron.<name>.plist
```

| Job | Schedule | What it does |
|-----|----------|--------------|
| sync-skills | 0,4,8,12,16,20:00 | Git sync upstream + push changes |
| steve-email-check | Hourly at :00 | Check email, notify if new |
| daily-weather-steve | 5:55 AM | Morning weather report |
| daily-verse | 6:05 AM | Bible verse of the day |
| daily-recap-posterboard | 5:00 PM | Daily recap summary |
| archive-media | Every 2h at :30 | Archive inbound media to Dropbox Steve_Journal |
| extract-facts | Every 30 min | Extract durable facts from conversations → ppl.gift |
| synthesize-memory | Sun 6:00 PM | Weekly synthesis of facts, update summaries |

**Wrapper scripts**: `/Users/steve/clawd/personal-scripts/cron-wrappers/`
**Launchd plists**: `~/Library/LaunchAgents/com.steve.cron.*.plist`
**Logs**: `~/.clawdbot/logs/cron-*.log`

## SSH Hosts

### synology
- **IP**: 192.168.4.84
- **User**: steve
- **Port**: 22
- **Services**: Plex, Radarr, Sonarr, SABnzbd, Home Assistant
- **Use**: `ssh synology`

### mac-mini
- **IP**: TBD
- **User**: steve
- **Services**: Future "brain" - will host migrated services
- **Use**: `ssh mac-mini`

## Smart Home

### Hue Bridge
- **IP**: 192.168.4.95
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

## 1Password CLI

**DO NOT use desktop app UI.** Use the `op` CLI via the `op-safe` tmux session.

- **Account**: steve@withagency.ai at my.1password.com
- **Password**: `OP_PASSWORD` in `~/.clawdbot/.env`
- **Tmux session**: `op-safe` (persistent)

### Re-authenticate when session expires

```bash
# Send signin command
tmux send-keys -t op-safe 'eval $(op signin --account my.1password.com)' Enter
sleep 1
# Send password from env
tmux send-keys -t op-safe "$OP_PASSWORD" Enter
sleep 2
# Verify
tmux send-keys -t op-safe 'op whoami' Enter
```

### Read secrets via tmux

```bash
# List items
tmux send-keys -t op-safe 'op item list' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -30

# Get specific item
tmux send-keys -t op-safe 'op item get "item name" --format json' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -50
```

### Vaults available
- **Steve** — personal secrets, skill configs
- **MeshGuard** — MeshGuard-specific secrets

---

Add whatever helps you do your job. This is your cheat sheet.
