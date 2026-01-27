---
summary: "Uninstall Clawdbrain completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Clawdbrain from a machine
  - The gateway service is still running after uninstall
---

# Uninstall

Two paths:
- **Easy path** if `clawdbrain` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
clawdbrain uninstall
```

Non-interactive (automation / npx):

```bash
clawdbrain uninstall --all --yes --non-interactive
npx -y clawdbrain uninstall --all --yes --non-interactive
```

Manual steps (same result):

1) Stop the gateway service:

```bash
clawdbrain gateway stop
```

2) Uninstall the gateway service (launchd/systemd/schtasks):

```bash
clawdbrain gateway uninstall
```

3) Delete state + config:

```bash
rm -rf "${CLAWDBRAIN_STATE_DIR:-$HOME/.clawdbrain}"
```

If you set `CLAWDBRAIN_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4) Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/clawd
```

5) Remove the CLI install (pick the one you used):

```bash
npm rm -g clawdbrain
pnpm remove -g clawdbrain
bun remove -g clawdbrain
```

6) If you installed the macOS app:

```bash
rm -rf /Applications/Clawdbrain.app
```

Notes:
- If you used profiles (`--profile` / `CLAWDBRAIN_PROFILE`), repeat step 3 for each state dir (defaults are `~/.clawdbrain-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `clawdbrain` is missing.

### macOS (launchd)

Default label is `com.clawdbrain.gateway` (or `com.clawdbrain.<profile>`):

```bash
launchctl bootout gui/$UID/com.clawdbrain.gateway
rm -f ~/Library/LaunchAgents/com.clawdbrain.gateway.plist
```

If you used a profile, replace the label and plist name with `com.clawdbrain.<profile>`.

### Linux (systemd user unit)

Default unit name is `clawdbrain-gateway.service` (or `clawdbrain-gateway-<profile>.service`):

```bash
systemctl --user disable --now clawdbrain-gateway.service
rm -f ~/.config/systemd/user/clawdbrain-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Clawdbrain Gateway` (or `Clawdbrain Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Clawdbrain Gateway"
Remove-Item -Force "$env:USERPROFILE\.clawdbrain\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.clawdbrain-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://clawdbrain.bot/install.sh` or `install.ps1`, the CLI was installed with `npm install -g clawdbrain@latest`.
Remove it with `npm rm -g clawdbrain` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `clawdbrain ...` / `bun run clawdbrain ...`):

1) Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2) Delete the repo directory.
3) Remove state + workspace as shown above.
