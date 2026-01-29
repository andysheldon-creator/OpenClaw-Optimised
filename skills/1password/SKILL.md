---
name: 1password
description: Set up and use 1Password CLI (op). Use when installing the CLI, enabling desktop app integration, signing in (single or multi-account), or reading/injecting/running secrets via op.
homepage: https://developer.1password.com/docs/cli/get-started/
metadata: {"moltbot":{"emoji":"🔐","requires":{"bins":["op"]},"install":[{"id":"brew","kind":"brew","formula":"1password-cli","bins":["op"],"label":"Install 1Password CLI (brew)"}]}}
---

# 1Password CLI

## Steve's Setup (USE THIS)

You have a persistent `op-safe` tmux session and `OP_PASSWORD` in your env. **Do NOT use the desktop app UI.**

### Quick Reference

```bash
# Check if authenticated
tmux send-keys -t op-safe 'op whoami' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -5

# If you see "no active session" → re-authenticate (see below)
# If you see your email → you're good, run commands
```

### Re-authenticate (when session expires)

```bash
# Load password from env
source ~/.clawdbot/.env

# Sign in
tmux send-keys -t op-safe 'eval $(op signin --account my.1password.com)' Enter
sleep 1
tmux send-keys -t op-safe "$OP_PASSWORD" Enter
sleep 2

# Verify
tmux send-keys -t op-safe 'op whoami' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -5
```

### Read Secrets

```bash
# List all items
tmux send-keys -t op-safe 'op item list' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -30

# Get specific item as JSON
tmux send-keys -t op-safe 'op item get "item name" --format json' Enter && sleep 2 && tmux capture-pane -t op-safe -p -S -50

# Get specific field
tmux send-keys -t op-safe 'op item get "item name" --fields label=password' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -5

# List items in specific vault
tmux send-keys -t op-safe 'op item list --vault "MeshGuard"' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -20
```

### Account Details

- **Account**: my.1password.com
- **Email**: steve@withagency.ai
- **Tmux session**: `op-safe` (persistent, don't kill it)
- **Password env var**: `OP_PASSWORD` in `~/.clawdbot/.env`

### Vaults Available

- **Steve** — personal secrets, skill configs (clawdbot skill: xxx items)
- **MeshGuard** — MeshGuard-specific secrets

## Workflow (Step by Step)

1. **Check auth status first:**
   ```bash
   tmux send-keys -t op-safe 'op whoami 2>&1' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -5
   ```

2. **If expired ("no active session")**, re-auth:
   ```bash
   source ~/.clawdbot/.env
   tmux send-keys -t op-safe 'eval $(op signin --account my.1password.com)' Enter
   sleep 1
   tmux send-keys -t op-safe "$OP_PASSWORD" Enter
   sleep 2
   ```

3. **Verify auth worked:**
   ```bash
   tmux send-keys -t op-safe 'op whoami' Enter && sleep 1 && tmux capture-pane -t op-safe -p -S -5
   ```

4. **Run your op commands** through tmux send-keys + capture-pane

## Guardrails

- **Never paste secrets into chat or logs** — only reference them by item name
- **Never run `op` directly** — always use the `op-safe` tmux session
- **Prefer `op run` / `op inject`** over writing secrets to disk when running scripts
- **Session expires after ~30 minutes of inactivity** — just re-auth using the steps above

## Troubleshooting

**"no active session found"** → Re-authenticate using the steps above

**tmux session doesn't exist** → Create it:
```bash
tmux new-session -d -s op-safe
```

**Wrong account** → Specify account explicitly:
```bash
tmux send-keys -t op-safe 'eval $(op signin --account my.1password.com)' Enter
```

## References (for setup/install)

- `references/get-started.md` (install + app integration + sign-in flow)
- `references/cli-examples.md` (real `op` examples)
