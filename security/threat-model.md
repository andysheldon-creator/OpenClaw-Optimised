# OpenClaw Threat Model

## System Overview

OpenClaw is a personal AI assistant gateway that:

- Connects to messaging platforms (WhatsApp, Telegram, Discord, Slack, Signal, etc.)
- Routes messages to AI providers (Claude, GPT, etc.)
- Executes tools and skills on behalf of users
- Stores session history and configuration locally

## Assets (What We Protect)

| Asset             | Description                          | Confidentiality | Integrity | Availability |
| ----------------- | ------------------------------------ | --------------- | --------- | ------------ |
| Database Rows     | User data, chat history, preferences | HIGH            | HIGH      | MEDIUM       |
| API Keys          | Provider keys, platform tokens       | CRITICAL        | HIGH      | MEDIUM       |
| Agent Identity    | Bot accounts, user sessions          | HIGH            | CRITICAL  | MEDIUM       |
| Chat Logs         | Message history, context             | HIGH            | MEDIUM    | LOW          |
| Configuration     | Gateway settings, allowlists         | MEDIUM          | CRITICAL  | HIGH         |
| Credentials Store | Platform login sessions              | CRITICAL        | HIGH      | MEDIUM       |

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        UNTRUSTED ZONE                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Internet  │  │  Messaging  │  │   Remote    │             │
│  │   Users     │  │  Platforms  │  │   Skills    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         │                │                │                     │
├─────────┼────────────────┼────────────────┼─────────────────────┤
│         │      TRUST BOUNDARY (TLS + Auth)│                     │
├─────────┼────────────────┼────────────────┼─────────────────────┤
│         ▼                ▼                ▼                     │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              OPENCLAW GATEWAY                         │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │      │
│  │  │  Auth    │  │ Message  │  │  Skill   │           │      │
│  │  │  Layer   │  │ Router   │  │ Sandbox  │           │      │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘           │      │
│  │       │             │             │                  │      │
│  │       ▼             ▼             ▼                  │      │
│  │  ┌────────────────────────────────────────────┐     │      │
│  │  │              Internal Services              │     │      │
│  │  │  Session Store │ Config │ Logging          │     │      │
│  │  └────────────────────────────────────────────┘     │      │
│  └──────────────────────────────────────────────────────┘      │
│                              │                                  │
├──────────────────────────────┼──────────────────────────────────┤
│                    DATABASE BOUNDARY (RLS)                      │
├──────────────────────────────┼──────────────────────────────────┤
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                   SUPABASE / DATABASE                 │      │
│  │  (service_role NEVER crosses gateway boundary)        │      │
│  └──────────────────────────────────────────────────────┘      │
│                        TRUSTED ZONE                             │
└─────────────────────────────────────────────────────────────────┘
```

## Threat Actors

### External Attackers (Internet)

- **Capability**: Network access, public API knowledge
- **Motivation**: Data theft, service disruption, cryptocurrency mining
- **Example Attacks**: Credential stuffing, API abuse, SSRF

### Malicious Platform Users

- **Capability**: Legitimate platform access (WhatsApp, Discord, etc.)
- **Motivation**: Abuse AI capabilities, access unauthorized data
- **Example Attacks**: Prompt injection, identity spoofing, command abuse

### Supply Chain Attackers

- **Capability**: Publish malicious packages/skills
- **Motivation**: Backdoor access, data exfiltration
- **Example Attacks**: Typosquatting, dependency confusion, skill poisoning

### Insider Threats

- **Capability**: Access to source code, deployment systems
- **Motivation**: Various
- **Example Attacks**: Credential theft, backdoor insertion

## Threats and Mitigations

### T1: Supabase Key Leak → Database Takeover

| Attribute      | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| **STRIDE**     | Spoofing, Tampering, Information Disclosure, Elevation of Privilege |
| **Likelihood** | MEDIUM (keys can leak via commits, logs, client code)               |
| **Impact**     | CRITICAL (full database access, identity spoofing)                  |

**Attack Path**:

1. Attacker obtains service_role key from git history/logs/client bundle
2. Uses key to bypass RLS and access all data
3. Can impersonate any user, modify any record, exfiltrate everything

**Mitigations**:

- [x] Pre-commit hooks block service_role patterns
- [x] Gitleaks CI scanning
- [x] RLS enforced on all tables
- [x] service_role never sent to client
- [ ] Key rotation automation
- [ ] Database activity monitoring

### T2: Gateway Public Exposure → Unauthorized Access

| Attribute      | Value                                          |
| -------------- | ---------------------------------------------- |
| **STRIDE**     | Information Disclosure, Elevation of Privilege |
| **Likelihood** | MEDIUM (misconfiguration possible)             |
| **Impact**     | HIGH (full gateway control)                    |

**Attack Path**:

1. User binds gateway to 0.0.0.0 without auth
2. Attacker scans and finds open port
3. Gains full gateway access: config, commands, chat history

**Mitigations**:

- [x] Default bind is 127.0.0.1
- [x] public_bind_guard refuses public bind without strong auth
- [x] Admin endpoints require auth token
- [x] Rate limiting enabled
- [ ] Automatic exposure detection/alerting

### T3: Skills Supply Chain → Code Execution

| Attribute      | Value                                  |
| -------------- | -------------------------------------- |
| **STRIDE**     | Tampering, Elevation of Privilege      |
| **Likelihood** | MEDIUM (one-liner installs are common) |
| **Impact**     | CRITICAL (arbitrary code execution)    |

**Attack Path**:

1. Attacker publishes malicious skill or compromises registry
2. User installs via `curl|sh` or marketplace
3. Skill executes arbitrary code with user privileges

**Mitigations**:

- [x] Remote skill install disabled by default
- [x] One-liner command blocklist
- [x] Skills allowlist enforcement
- [x] Skill sandbox (limited fs/network/subprocess)
- [ ] Skill signing/verification

### T4: Identity Impersonation → Message Spoofing

| Attribute      | Value                                |
| -------------- | ------------------------------------ |
| **STRIDE**     | Spoofing                             |
| **Likelihood** | LOW (requires API access)            |
| **Impact**     | MEDIUM (can send messages as others) |

**Attack Path**:

1. Attacker crafts request with fake identity fields
2. System uses attacker-provided identity for message attribution
3. Messages appear from spoofed user

**Mitigations**:

- [x] All user-provided identity fields stripped
- [x] Identity derived only from session/bot identity
- [ ] Message signing for verification

### T5: Secret Leakage via Logs

| Attribute      | Value                         |
| -------------- | ----------------------------- |
| **STRIDE**     | Information Disclosure        |
| **Likelihood** | MEDIUM (logging is pervasive) |
| **Impact**     | HIGH (credential exposure)    |

**Attack Path**:

1. Secrets accidentally logged (headers, payloads, env vars)
2. Logs stored in accessible location or shipped to external service
3. Attacker obtains logs and extracts secrets

**Mitigations**:

- [x] Redaction of sensitive headers (Authorization, Cookie, x-api-key)
- [x] Redaction of sensitive payload fields
- [x] process.env never logged directly
- [ ] Log encryption at rest

### T6: SSRF via Skills/Tools

| Attribute      | Value                            |
| -------------- | -------------------------------- |
| **STRIDE**     | Information Disclosure           |
| **Likelihood** | LOW (requires skill execution)   |
| **Impact**     | MEDIUM (internal service access) |

**Attack Path**:

1. Skill makes request to internal/metadata endpoint
2. Accesses cloud metadata (169.254.169.254) or internal services
3. Extracts credentials or sensitive data

**Mitigations**:

- [x] SSRF protection in web-fetch tool
- [x] Blocked internal IP ranges
- [ ] Network namespace isolation for skills

## Security Testing Checklist

- [ ] Run `security/scripts/local_security_smoketest.sh` before release
- [ ] Verify gitleaks passes on all branches
- [ ] Test public bind guard with various configurations
- [ ] Verify skills sandbox restrictions
- [ ] Test identity stripping with crafted requests
- [ ] Verify log redaction coverage
- [ ] Run SAST/DAST tools on gateway endpoints

## References

- [STRIDE Threat Model](https://docs.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [CWE Top 25](https://cwe.mitre.org/top25/)
