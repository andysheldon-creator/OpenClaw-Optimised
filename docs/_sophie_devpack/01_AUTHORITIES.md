# Sophie / Moltbot — Authority Hierarchy
**Version:** v1.0
**Generated:** 2026-02-05
**Purpose:** Define precedence rules and change control for all governance documents.

---

## 0) Core Principle

**Contracts and tests beat prose.**

When there is conflict:
1. Acceptance tests define "what works"
2. Contracts define "how it must work"
3. Cookbooks and guides provide context
4. If docs contradict code, code wins until docs are updated

### Jurisdictional Boundary

This authority hierarchy governs **Sophie's behavior at runtime**. It defines how Sophie reasons, what tools Sophie may use, what side effects require approval, and how Sophie handles security.

This hierarchy does NOT govern:

- How code is edited or committed (governed by `CLAUDE.md` at repo root)
- How the repository is structured (governed by `AGENTS.md` at repo root)
- What tasks the builder agent may perform (governed by `AGENT_WORK_CONTRACT.md` at repo root)
- What model IDs, ports, or commands the builder system uses at dev time

Operational defaults (model IDs, ports, startup commands) that appear in devpack documents are **informative snapshots**. The authoritative source for operational facts is runtime source code, then `RUNBOOK.md`, then explicit human instruction. If a devpack document contains a stale operational fact, it is a doc bug -- not a reason to change source code.

The builder agent (Claude Code) treats devpack documents as **product specifications**: requirements to implement, not rules to obey.

---

## 1) Authority Layers (Precedence Order)

### Layer 1: BINDING CONTRACTS (Highest Authority)
These documents are **non-negotiable** and enforced by tests + CI.

**Documents:**
- `02_CONTRACTS/tool_authority_matrix.md`
- `02_CONTRACTS/permissions_matrix.md`
- `02_CONTRACTS/interfaces_contracts_spec_sophie_moltbot.md`
- `05_PROMPTS/prompt_stack_contract.md`
- `07_OPERATIONS/model_routing_and_context_policy.md`

**Change Control:**
- Version bump required
- Acceptance tests must be updated
- Founder approval required
- Breaking changes require migration plan

**Enforcement:**
- Automated: CI tests fail if violated
- Runtime: System refuses to operate if contract broken

---

### Layer 2: ACCEPTANCE TESTS (Definition of Done)
These documents define **what "done" means**.

**Documents:**
- `03_TESTS/acceptance_tests_pack_sophie_moltbot_do_d_gwt_fixtures.md`
- `03_TESTS/contract_test_runner_checklist_sophie_moltbot_ci_map.md`
- `03_TESTS/fixtures/` (golden test cases)

**Change Control:**
- Must remain in sync with Layer 1 contracts
- New features require new test fixtures
- Test failures block merge

**Enforcement:**
- CI pipeline
- Manual review for edge cases

---

### Layer 3: SECURITY POLICIES (Mandatory)
These documents define **threat responses** and **abuse case handling**.

**Documents:**
- `04_SECURITY/security_threat_model_sophie_moltbot.md`
- `04_SECURITY/security_threat_model_sophie_moltbot_solo_founder.md`
- `04_SECURITY/abuse_cases_misuse_scenarios_sophie_moltbot.md`

**Change Control:**
- Security escalations require immediate doc + test update
- Threat model reviewed quarterly
- Founder approval required

**Enforcement:**
- Automated: Secret detection, logging checks
- Manual: Code review, security audit

---

### Layer 4: OPERATIONAL GUIDES (Informative)
These documents provide **context and setup instructions**.

**Documents:**
- `06_COOKBOOKS/sophie_moltbot_prd_developer_handoff_kimi_setup_gates_notes_email.md`
- `07_OPERATIONS/` (routing policy, defaults, state machine docs)

**Change Control:**
- Can be updated freely if contracts remain satisfied
- Version bumps recommended for major changes
- No approval required for clarifications

**Enforcement:**
- None (informative only)

---

## 2) Conflict Resolution Rules

### Rule 1: Tests Define Truth
If a test passes but behavior seems wrong → update the test.
If a test fails but behavior seems right → behavior is wrong.

### Rule 2: Contracts Beat Code
If code violates a contract → code is wrong.
If contract is impossible → contract needs version bump + migration.

### Rule 3: Security Overrides Features
If a feature conflicts with security policy → feature is blocked.
Security policy changes require explicit approval + risk assessment.

### Rule 4: No Silent Degradation
If a contract cannot be satisfied:
- System must fail-closed (refuse to operate)
- Log clear error with contract reference
- Never silently downgrade or fallback

---

## 3) Version Control & Change Log

### Version Format
`vMAJOR.MINOR (YYYY-MM-DD)`

**MAJOR:** Breaking change to contract or test
**MINOR:** Additive change, clarification, or new optional feature

### Change Log Location
Each contract document maintains its own version header.

Global change log (optional):
`docs/_sophie_devpack/CHANGELOG.md`

---

## 4) Approval Matrix

| Change Type | Approval Required | Test Updates Required |
|-------------|-------------------|----------------------|
| Contract modification | Founder | Yes |
| Test fixture addition | Developer | No |
| Security policy change | Founder | Yes |
| Cookbook update | Developer | No |
| Breaking change | Founder + Migration Plan | Yes |

---

## 5) Archive Policy

When documents are superseded:
- Move old version to `90_ARCHIVE/`
- Add header: `ARCHIVED: Superseded by vX.Y`
- Preserve for audit trail

Never delete governance docs.

---

## 6) Bootstrap Note

This authority hierarchy was established during initial Sophie bootstrap (2026-02-05).

**What was NOT done during bootstrap:**
- No product features implemented
- No Kimi provider code written
- No tool implementations
- No prompt files created

**What WAS done:**
- Documentation organized
- Loop scaffolding created
- Entry points established
- Work queue seeded

Implementation begins after founder reviews and approves this structure.

---

## 7) Contact & Escalation

**Document Owner:** Andrew (Founder)
**Repository:** ~/Documents/clawdbot
**Escalation:** For contract conflicts or security issues, stop work and document issue in TODO_QUEUE.md with BLOCKED status.

---

## Owner Sign-Off

This hierarchy ensures:
- Deterministic behavior
- Fail-closed safety
- Audit trail
- Clear change control

Violating it breaks the system.
