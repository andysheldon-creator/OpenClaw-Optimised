---
summary: "CLI reference for `clawdbrain voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
---

# `clawdbrain voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:
- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
clawdbrain voicecall status --call-id <id>
clawdbrain voicecall call --to "+15555550123" --message "Hello" --mode notify
clawdbrain voicecall continue --call-id <id> --message "Any questions?"
clawdbrain voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
clawdbrain voicecall expose --mode serve
clawdbrain voicecall expose --mode funnel
clawdbrain voicecall unexpose
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.

