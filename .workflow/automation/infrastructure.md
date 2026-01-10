# Infrastructure

## Implemented

### Git Worktree Setup

```bash
./scripts/setup-worktrees.sh              # Creates agent-dev, agent-test, agent-review
./scripts/setup-worktrees.sh ~/sandboxes  # Custom location
```

Creates worktrees at `~/clawdbot-sandboxes/agent-{dev,test,review}` with deps installed.

**Cleanup**:
```bash
git worktree remove ~/clawdbot-sandboxes/agent-dev
git worktree prune
```

### tmux Sessions

```bash
SOCKET="${TMPDIR}/clawdbot-tmux-sockets/clawdbot.sock"
mkdir -p "$(dirname "$SOCKET")"

tmux -S "$SOCKET" new -d -s agent-dev -n main
tmux -S "$SOCKET" list-sessions
tmux -S "$SOCKET" attach -t agent-dev
```

### Daily Builds

```bash
./scripts/daily-all.sh                    # ARM + x86 parallel
./scripts/daily-build.sh                  # ARM only (local)
./scripts/daily-build-k8s.sh              # x86 only (k8s)
```

Results: `~/.clawdbot/daily-builds/summary-$(date +%Y-%m-%d).log`

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAWDBOT_CONFIG_PATH` | Config file location |
| `CLAWDBOT_GATEWAY_URL` | Gateway WebSocket URL |
| `CLAWDBOT_GATEWAY_PORT` | Gateway port |
| `CLAWDBOT_TMUX_SOCKET_DIR` | tmux socket directory |
| `CLAWDBOT_SKIP_PROVIDERS` | Skip provider init (testing) |
| `CLAWDBOT_ENABLE_BRIDGE_IN_TESTS` | Enable bridge (testing) |

---

## Log Locations

| Log | Location |
|-----|----------|
| Gateway | stdout/stderr |
| Sessions | `~/.clawdbot/sessions/*.jsonl` |
| Agent | `~/.claude/session.log` |
| macOS unified | `./scripts/clawlog.sh --follow` |

---

## Troubleshooting

```bash
pgrep -f "clawdbot gateway"               # Check if running
lsof -i :8080                             # Check port
tailscale status                          # Check network
ls -la ${TMPDIR}/clawdbot-tmux-sockets/   # tmux sockets
tmux -S $SOCKET kill-server               # Reset tmux
```

---

## Templates

See `project/drafts/infrastructure-templates.md` for:
- k3s cluster setup
- Kubernetes manifests
- Tailscale ACL configuration
- Additional automation scripts
