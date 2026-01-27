---
summary: "CLI reference for `clawdbrain browser` (profiles, tabs, actions, extension relay)"
read_when:
  - You use `clawdbrain browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to use the Chrome extension relay (attach/detach via toolbar button)
---

# `clawdbrain browser`

Manage Clawdbrain’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:
- Browser tool + API: [Browser tool](/tools/browser)
- Chrome extension relay: [Chrome extension](/tools/chrome-extension)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
clawdbrain browser --browser-profile chrome tabs
clawdbrain browser --browser-profile clawd start
clawdbrain browser --browser-profile clawd open https://example.com
clawdbrain browser --browser-profile clawd snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:
- `clawd`: launches/attaches to a dedicated Clawdbrain-managed Chrome instance (isolated user data dir).
- `chrome`: controls your existing Chrome tab(s) via the Chrome extension relay.

```bash
clawdbrain browser profiles
clawdbrain browser create-profile --name work --color "#FF5A36"
clawdbrain browser delete-profile --name work
```

Use a specific profile:

```bash
clawdbrain browser --browser-profile work tabs
```

## Tabs

```bash
clawdbrain browser tabs
clawdbrain browser open https://docs.clawdbrain.bot
clawdbrain browser focus <targetId>
clawdbrain browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
clawdbrain browser snapshot
```

Screenshot:

```bash
clawdbrain browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
clawdbrain browser navigate https://example.com
clawdbrain browser click <ref>
clawdbrain browser type <ref> "hello"
```

## Chrome extension relay (attach via toolbar button)

This mode lets the agent control an existing Chrome tab that you attach manually (it does not auto-attach).

Install the unpacked extension to a stable path:

```bash
clawdbrain browser extension install
clawdbrain browser extension path
```

Then Chrome → `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select the printed folder.

Full guide: [Chrome extension](/tools/chrome-extension)

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
