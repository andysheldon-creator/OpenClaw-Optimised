# OpenClaw Security Patchset

This document details the known security risks in OpenClaw and the applied mitigations.

## Known Risks (Priority Ordered)

### P0 - Critical

#### 1. Supabase service_role Key Exposure

**Risk**: If a `service_role` key is exposed (via client code, logs, or version control), an attacker gains full database access—bypassing Row-Level Security (RLS), spoofing any user identity, and exfiltrating/modifying all data.

**Mitigations Applied**:

- Pre-commit hooks block any commit containing `service_role`
- Gitleaks scans for Supabase key patterns
- RLS template enforces deny-by-default policies
- Documentation explicitly prohibits service_role in client code

#### 2. Gateway Public Exposure

**Risk**: Binding the gateway to `0.0.0.0` or a public IP without authentication allows anyone on the network to:

- Access/modify configuration
- Impersonate users
- Execute commands via connected agents
- Exfiltrate chat history and credentials

**Mitigations Applied**:

- Default bind is `127.0.0.1` (loopback only)
- `public_bind_guard` module refuses public bind without:
  - `OPENCLAW_ALLOW_PUBLIC_BIND=true` env var
  - `OPENCLAW_PUBLIC_BIND_IP_ALLOWLIST` configured (IP/CIDR; enforced for HTTP + WS)
  - Gateway TLS enabled (`gateway.tls.enabled=true`) so secrets aren’t sent over plaintext
  - Gateway auth configured (token/password and/or Tailscale Serve identity)
- Admin endpoints require `Authorization: Bearer` token
- Auth failures are rate-limited per IP (to reduce brute-force/scanner noise)
- Request size limits enforced on hook + HTTP API surfaces

#### 3. Skills Supply-Chain Poisoning

**Risk**: Malicious skills can be installed via:

- Remote marketplaces/registries
- Copy-paste one-liner commands (`curl|sh`)
- Compromised plugin repos

**Mitigations Applied**:

- Remote skills installation disabled by default (`OPENCLAW_SKILLS_ALLOW_REMOTE_INSTALL=false`)
- Skills allowlist enforcement (`config/skills_allowlist.json`)
- One-liner command blocklist (detects `curl|sh`, `wget|bash`, etc.)
- Skills sandbox with restricted filesystem, network, and subprocess access

### P1 - High

#### 4. Identity Impersonation

**Risk**: Accepting user-provided identity fields (`agent_id`, `display_name`, `actor`, `impersonate`, `post_as`) allows attackers to spoof messages and actions.

**Mitigation**: All user-provided identity fields are stripped. Identity is derived only from authenticated session or bot identity.

#### 5. Secret Leakage in Logs

**Risk**: Sensitive data (tokens, keys, passwords) may appear in logs, making them accessible to anyone with log access.

**Mitigation**: Enhanced log redaction for headers (Authorization, Cookie, x-api-key) and payload fields (token, key, secret, api_key).

#### 6. Abnormal Behavior Detection

**Risk**: Without monitoring, attacks (brute force, rate abuse, data exfiltration) go unnoticed.

**Mitigation**: Anomaly detector monitors auth failures, request spikes, and abnormal write volumes. Triggers SECURITY_EVENT logs and optional webhook alerts.

### P2 - Medium

#### 7. Git History Secret Exposure

**Risk**: Secrets committed in the past remain in git history even after deletion.

**Mitigation**: `scan_git_history_for_secrets.sh` script to audit entire git history.

## Prohibited Patterns

The following are **strictly prohibited** in OpenClaw deployments:

1. **service_role key in client code** - Never include Supabase service_role keys in:
   - Frontend/UI bundles
   - Plugin/extension code
   - Configuration examples or README files
   - Gateway JavaScript

2. **curl|sh or wget|bash patterns** - Never execute remote code via:
   - `curl <url> | sh`
   - `wget <url> | bash`
   - `bash <(curl ...)`
   - `powershell iwr | iex`
   - `python -c` with urllib/requests + exec

3. **Public gateway binding without auth** - Never bind to `0.0.0.0` or public IP without:
   - Strong authentication (token/password over HTTPS/WSS, and preferably an IP allowlist)
   - IP allowlist configured
   - Explicit opt-in via environment variable

## Security Verification Scripts

Run these scripts to verify security posture:

```bash
# Check for public bind issues
./security/scripts/check_no_public_bind.sh

# Check for secrets in code
./security/scripts/check_no_secrets.sh

# Verify skills allowlist
./security/scripts/check_skills_allowlist.sh

# Scan git history for leaked secrets
./security/scripts/scan_git_history_for_secrets.sh

# Run comprehensive security smoketest
./security/scripts/local_security_smoketest.sh
```

## Related Documents

- [Runbook](./OPENCLAW_RUNBOOK.md) - Incident response procedures
- [Threat Model](./threat-model.md) - Detailed threat analysis
- [RLS Template](./rls/SUPABASE_RLS_TEMPLATE.sql) - Database security baseline
- [Skill Manifest Schema](./sandbox/skill_manifest.schema.json) - Skill validation schema
