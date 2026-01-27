---
summary: "CLI reference for `clawdbrain reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
---

# `clawdbrain reset`

Reset local config/state (keeps the CLI installed).

```bash
clawdbrain reset
clawdbrain reset --dry-run
clawdbrain reset --scope config+creds+sessions --yes --non-interactive
```

