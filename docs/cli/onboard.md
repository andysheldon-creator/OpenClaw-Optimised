---
summary: "CLI reference for `clawdbrain onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and skills
---

# `clawdbrain onboard`

Interactive onboarding wizard (local or remote Gateway setup).

Related:
- Wizard guide: [Onboarding](/start/onboarding)

## Examples

```bash
clawdbrain onboard
clawdbrain onboard --flow quickstart
clawdbrain onboard --flow manual
clawdbrain onboard --mode remote --remote-url ws://gateway-host:18789
```

Flow notes:
- `quickstart`: minimal prompts, auto-generates a gateway token.
- `manual`: full prompts for port/bind/auth (alias of `advanced`).
- Fastest first chat: `clawdbrain dashboard` (Control UI, no channel setup).
