# SYSTEM_STATUS.md — Live System State

**Last Updated:** <!-- Update this timestamp when modifying -->

---

## Port Map

| Port  | Service          | Status     | Notes                      |
| ----- | ---------------- | ---------- | -------------------------- |
| 6380  | Redis            | ⬜ UNKNOWN | Agent memory & switchboard |
| 8787  | ArchAgents API   | ⬜ UNKNOWN | Backend orchestration      |
| 11434 | Ollama           | ⬜ UNKNOWN | Local LLM (phi3)           |
| 8000  | Cerebro          | ⬜ UNKNOWN | Knowledge dashboard        |
| 18789 | Clawdbot Gateway | ⬜ UNKNOWN | Kip's gateway              |

---

## Agent Status

| Agent          | Model        | Status     | Last Seen |
| -------------- | ------------ | ---------- | --------- |
| Kip 🦊         | Claude       | ⬜ UNKNOWN |           |
| Antigravity 🚀 | Gemini       | ⬜ UNKNOWN |           |
| ArchAgents 🤖  | Gemini Flash | ⬜ UNKNOWN |           |

---

## Service Health

| Service                             | Status     | Notes |
| ----------------------------------- | ---------- | ----- |
| `kip-inbox-watcher.service`         | ⬜ UNKNOWN |       |
| `antigravity-inbox-watcher.service` | ⬜ UNKNOWN |       |
| `agent-bridge.service`              | ⬜ UNKNOWN |       |

---

_Update this file when system state changes._
