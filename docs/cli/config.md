---
summary: "CLI reference for `clawdbrain config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
---

# `clawdbrain config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `clawdbrain configure`).

## Examples

```bash
clawdbrain config get browser.executablePath
clawdbrain config set browser.executablePath "/usr/bin/google-chrome"
clawdbrain config set agents.defaults.heartbeat.every "2h"
clawdbrain config set agents.list[0].tools.exec.node "node-id-or-name"
clawdbrain config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
clawdbrain config get agents.defaults.workspace
clawdbrain config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
clawdbrain config get agents.list
clawdbrain config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
clawdbrain config set agents.defaults.heartbeat.every "0m"
clawdbrain config set gateway.port 19001 --json
clawdbrain config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
