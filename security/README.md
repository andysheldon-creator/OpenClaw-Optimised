# Security Notes (Attack Surfaces + Mitigations)

This directory is a static, repo-local security reference focusing on:

- Prompt construction / prompt injection surfaces (including channels + extensions + skills).
- Outbound calls (network / subprocess / filesystem) and “unexpected invocation paths”.
- Concrete mitigations with code pointers.

Docs:

- `SECURITY/ATTACK-VECTORS.md` — inventory of obvious + nonobvious attack vectors with evidence.
- `SECURITY/PROMPT-INJECTION.md` — prompt-injection-specific analysis + mitigations.
- `SECURITY/MITIGATIONS.md` — prioritized, minimal-change mitigations and hardening checklist.

Upstream-sync audit artifacts (historical snapshots):

- `UPSTREAM/SECURITY-REVIEW-UPSTREAM.md`
- `UPSTREAM/SECURITY-AUDIT-COMPLETE-2026-02-02.md`
- `UPSTREAM/SECURITY-AUDIT-SYNOPSIS-2026-02-02.md`
