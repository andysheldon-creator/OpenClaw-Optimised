---
summary: "CLI reference for `clawdbrain logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
---

# `clawdbrain logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:
- Logging overview: [Logging](/logging)

## Examples

```bash
clawdbrain logs
clawdbrain logs --follow
clawdbrain logs --json
clawdbrain logs --limit 500
```

