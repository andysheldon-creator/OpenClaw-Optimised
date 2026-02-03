# Mitigations & Hardening Checklist (Prioritized)

This is a “minimal-change first” hardening plan. It focuses on reducing blast radius from prompt injection and preventing “unexpected API calls” from low-trust inputs.

Each item links to at least one concrete code point.

## P0 — High leverage, high risk-reduction

1. **Add explicit trust-boundary instructions around injected context files.**
   - Injection point: `lines.push("# Project Context"...` (`src/agents/system-prompt.ts:542`)
   - Goal: make it unambiguous that “Project Context” content is untrusted data, never policy.

2. **Eliminate nonobvious permission expansion (`exec` ⇒ `apply_patch`) or document it very explicitly.**
   - Evidence: `if (normalized === "apply_patch" && matchesAny("exec", allow)) {` (`src/agents/pi-tools.policy.ts:72`)
   - Goal: avoid accidental enabling of write-capable tools.

3. **Centralize SSRF/URL policy and require it for all non-`web_fetch` fetches.**
   - Evidence: `fetch(config.url)` (`src/automations/executors/webhook.ts:219`)
   - Evidence: `fetch(url)` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)
   - Goal: consistent “no localhost/private IP/metadata endpoints” behavior.

4. **Harden remote admin surfaces: `POST /tools/invoke` and worktree RPC.**
   - `POST /tools/invoke` tool execution: (`src/gateway/tools-invoke-http.ts:313`)
   - Worktree write: `await fs.writeFile(...)` (`src/gateway/server-methods/worktree.ts:273`)
   - Goal: reduce consequences of credential leaks and prevent surprise remote writes.

## P1 — Reduce prompt-injection escalation paths

5. **Constrain SOUL.md persona authority.**
   - Evidence: persona instruction (`src/agents/system-prompt.ts:545`)
   - Options: require explicit operator opt-in; enforce “persona-only, never tool policy”; or restrict to a trusted directory.

6. **Treat skills as code (supply chain + review + allowlist).**
   - Evidence: agent instructed to follow skills (`src/agents/system-prompt.ts:30`)
   - Evidence: remote install exists (`src/gateway/server-methods/skills.ts:108`, `src/agents/skills-install.ts:182`)
   - Goal: make it hard for a compromised skill to become a prompt-injection foothold.

7. **Strengthen channel scoping for tools (especially group chats and “social network” channels).**
   - Evidence: per-group tool policies exist (`src/channels/dock.ts:112-115`)
   - Goal: low-trust channels should only have read-only + message-send tools by default.

## P2 — Hygiene and operational guardrails

8. **Rate-limit and audit high-risk endpoints and methods.**
   - `POST /tools/invoke` (`src/gateway/tools-invoke-http.ts:108`)
   - Worktree RPC methods (`src/gateway/server-methods.ts:127-130`)

9. **Add explicit warnings in operator docs/UI when enabling high-risk features.**
   - `/bash` capability is present and gated but high impact (`src/auto-reply/reply/bash-command.ts:220`, `src/auto-reply/reply/bash-command.ts:375`)

10. **Log redaction review for credentials and sensitive payloads.**

- This doc does not enumerate all log call sites; prioritize auth tokens and webhook secrets around gateway and channel webhooks.
