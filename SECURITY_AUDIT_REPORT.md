# OpenClaw Security Audit Report

**Date:** 2026-02-10
**Auditor:** AI Security Audit (Comprehensive Deep-Dive)
**Scope:** Full codebase review — authentication, authorization, network handling, external content, file system, containerization, CI/CD, secrets management, tool execution, and configuration handling.

---

## Executive Summary

The OpenClaw codebase demonstrates a **mature and defense-in-depth security posture** for an open-source project. The project has invested significantly in:

- Multi-layered authentication (token, password, Tailscale, device auth)
- Comprehensive credential redaction for UI round-trips
- Prompt injection defenses for external content
- Static analysis scanning for skill code
- Secret detection in CI/CD pipelines
- File permission hardening on Unix and Windows
- Docker security hardening (non-root container)

However, several areas warrant attention. This report categorizes findings into **Critical**, **High**, **Medium**, and **Low** severity levels, with actionable remediation steps.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Network Security](#2-network-security)
3. [External Content & Prompt Injection](#3-external-content--prompt-injection)
4. [Tool Execution & Command Policy](#4-tool-execution--command-policy)
5. [Configuration & Secrets Management](#5-configuration--secrets-management)
6. [Container & Deployment Security](#6-container--deployment-security)
7. [CI/CD Pipeline Security](#7-cicd-pipeline-security)
8. [File System & Permissions](#8-file-system--permissions)
9. [WebSocket & API Surface](#9-websocket--api-surface)
10. [Code Quality & Static Analysis](#10-code-quality--static-analysis)

---

## 1. Authentication & Authorization

### Files Reviewed

- `src/gateway/auth.ts`
- `src/gateway/device-auth.ts`
- `src/gateway/origin-check.ts`
- `src/gateway/server-http.ts`

### ✅ Strengths

| #   | Detail                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Multi-mode authentication**: Supports token, password, and Tailscale auth with clean separation                |
| 2   | **Constant-time comparison**: Uses `timingSafeEqual` for token/password comparison, preventing timing attacks    |
| 3   | **Trusted proxy awareness**: Properly resolves client IPs through proxy chains with configurable trusted proxies |
| 4   | **Origin checking**: Validates browser origins against allowlists with loopback bypass for local development     |
| 5   | **Device auth v2**: Includes nonce support in v2 payload to prevent replay attacks                               |

### ⚠️ Findings

#### FINDING AUTH-1: Loopback Bind Skips Authentication (Medium)

**File:** `src/gateway/auth.ts` (line ~78–88)
**Description:** When the gateway binds to `127.0.0.1`, authentication is effectively skipped (`mode: "none"`). While this is intentional for local-only use, if another service on the same machine is compromised, it can access the gateway without credentials.
**Risk:** SSRF or local privilege escalation from co-located services.
**Remediation:** Document this behavior prominently. Consider adding an opt-in flag like `gateway.auth.requireOnLoopback: true` for hardened deployments.

#### FINDING AUTH-2: Password Auth Uses Direct String Hashing (Low)

**File:** `src/gateway/auth.ts`
**Description:** Passwords are compared using `timingSafeEqual` on raw SHA-256 hashes. While timing-safe, there is no salting or key-stretching (bcrypt/argon2). This is acceptable for gateway tokens but would be insufficient if user-facing passwords were stored.
**Risk:** Low — these are operator-set gateway passwords, not user credentials.
**Remediation:** If the scope ever expands to user-facing auth, migrate to bcrypt/argon2.

#### FINDING AUTH-3: Device Auth Payload Lacks Expiry Validation (Medium)

**File:** `src/gateway/device-auth.ts`
**Description:** The `buildDeviceAuthPayload` function includes `signedAtMs` but there's no visible enforcement of payload expiry. If the signed payload is intercepted, it could be replayed indefinitely (absent v2 nonce usage).
**Risk:** Replay attacks for v1 device authentication.
**Remediation:** Enforce a TTL on `signedAtMs` (e.g., reject payloads older than 5 minutes). Deprecate v1 in favor of v2 with nonces.

---

## 2. Network Security

### Files Reviewed

- `src/gateway/net.ts`
- `src/gateway/server-http.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server/tls.ts`

### ✅ Strengths

| #   | Detail                                                                         |
| --- | ------------------------------------------------------------------------------ | --- | ------- | ---------------------------------- |
| 1   | **Bind mode abstraction**: Clean `loopback                                     | lan | tailnet | auto` modes with sensible defaults |
| 2   | **TLS support**: Full TLS runtime with certificate fingerprint tracking        |
| 3   | **Tailscale integration**: Native Tailscale exposure for zero-trust networking |
| 4   | **mDNS/Bonjour discovery**: Controlled service advertisement                   |

### ⚠️ Findings

#### FINDING NET-1: `--bind lan` Exposes to All Interfaces Without Warning (High)

**File:** `src/gateway/net.ts`, `docker-compose.yml`
**Description:** The `docker-compose.yml` defaults to `${OPENCLAW_GATEWAY_BIND:-lan}`, which binds to `0.0.0.0`. Combined with the `--allow-unconfigured` flag in the Dockerfile, this could expose an unauthenticated gateway to the network if the user doesn't set `OPENCLAW_GATEWAY_TOKEN`.
**Risk:** Unauthorized access to the gateway from the local network or broader.
**Remediation:**

1. Make `OPENCLAW_GATEWAY_TOKEN` **required** when `--bind lan` is used (fail-fast if missing).
2. Add a startup warning: "⚠️ Gateway bound to LAN without authentication. Set OPENCLAW_GATEWAY_TOKEN."
3. Consider defaulting `docker-compose.yml` to `loopback` instead.

#### FINDING NET-2: Forwarded Header Parsing Trusts First Untrusted Value (Low)

**File:** `src/gateway/net.ts`
**Description:** The `resolveClientIp` function correctly consults `trustedProxies`, but the X-Forwarded-For parsing logic should be reviewed to ensure it picks the _rightmost_ untrusted IP (the standard approach), not the leftmost.
**Risk:** IP spoofing if the parsing order is incorrect.
**Remediation:** Verify that the implementation follows the [MDN recommendation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For#selecting_an_ip_address) of selecting the rightmost untrusted IP.

---

## 3. External Content & Prompt Injection

### Files Reviewed

- `src/security/external-content.ts`
- `src/security/skill-scanner.ts`
- `src/gateway/chat-sanitize.ts`

### ✅ Strengths

| #   | Detail                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Multi-layer prompt injection defense**: Content wrapped with security markers, suspicious pattern detection, and safe prompt building           |
| 2   | **Comprehensive suspicious pattern list**: Detects role-playing attacks, system prompt overrides, encoding tricks, and data exfiltration attempts |
| 3   | **Skill scanning**: Static analysis for `exec`, `eval`, crypto-mining, network exfiltration, obfuscation, and env harvesting                      |
| 4   | **Chat sanitization**: Strips envelope headers and message IDs from user messages before processing                                               |

### ⚠️ Findings

#### FINDING EXT-1: Regex-Based Prompt Injection Detection Can Be Bypassed (Medium)

**File:** `src/security/external-content.ts`
**Description:** The suspicious pattern detection uses regex matching against known attack strings (e.g., `"ignore previous"`, `"you are now"`). Sophisticated attackers can easily bypass these with:

- Unicode homoglyphs (`ⅰgnore prevⅰous`)
- Zero-width characters between words
- Base64 encoding within the message
- Multi-turn jailbreak techniques
  **Risk:** Prompt injection in emails/webhooks that bypasses static detection.
  **Remediation:**

1. Add Unicode normalization (NFC/NFKC) before pattern matching.
2. Consider an LLM-based secondary classifier for high-risk content.
3. Implement content length limits for external inputs.
4. Log detected bypass attempts for monitoring.

#### FINDING EXT-2: Skill Scanner Misses Dynamic Import Patterns (Low)

**File:** `src/security/skill-scanner.ts`
**Description:** The scanner checks for `require(`, `import(`, `eval(`, etc., but may miss dynamic patterns like:

- `global["ev" + "al"](...)`
- `Function("return this")()`
- `Reflect.apply(Function, null, [...])`
  **Risk:** Malicious skills could bypass static scanning.
  **Remediation:** Add detection for `Function(`, `Reflect.apply`, `Reflect.construct`, and string concatenation patterns that construct dangerous function names.

---

## 4. Tool Execution & Command Policy

### Files Reviewed

- `src/gateway/tools-invoke-http.ts`
- `src/gateway/node-command-policy.ts`

### ✅ Strengths

| #   | Detail                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------- |
| 1   | **Layered tool policy**: Profile → Global → Agent → Group → Subagent policy chain with proper filtering   |
| 2   | **Platform-aware command allowlists**: Different default commands for iOS, Android, macOS, Linux, Windows |
| 3   | **Dangerous command segregation**: Camera, contacts, SMS, calendar mutations require explicit opt-in      |
| 4   | **Node declaration requirement**: Commands must be both allowlisted AND declared by the node              |
| 5   | **Body size limits**: 2MB default limit on tool invocation payloads                                       |

### ⚠️ Findings

#### FINDING TOOL-1: Tool Invocation Error Messages May Leak Internal State (Low)

**File:** `src/gateway/tools-invoke-http.ts` (lines 319–323)
**Description:** When a tool execution fails, the raw error message is returned to the client:

```typescript
error: { type: "tool_error", message: err instanceof Error ? err.message : String(err) }
```

This could leak stack traces, file paths, or internal configuration details.
**Risk:** Information disclosure.
**Remediation:** Sanitize error messages before returning them. Log the full error server-side and return a generic message to the client.

#### FINDING TOOL-2: `system.run` Included in Default macOS/Linux/Windows Allowlist (Medium)

**File:** `src/gateway/node-command-policy.ts` (lines 42–49)
**Description:** `system.run` and `system.which` are included in the default allowlist for desktop platforms. This means any connected node can execute arbitrary system commands by default.
**Risk:** If a malicious node connects (e.g., through a compromised mobile app), it could execute system commands.
**Remediation:** Move `system.run` to `DEFAULT_DANGEROUS_NODE_COMMANDS` so it requires explicit opt-in. Or add an execution approval flow for `system.run` commands.

---

## 5. Configuration & Secrets Management

### Files Reviewed

- `src/config/redact-snapshot.ts`
- `.detect-secrets.cfg`
- `.secrets.baseline`
- `.pre-commit-config.yaml`
- `.env.example`
- `.gitignore`

### ✅ Strengths

| #   | Detail                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Comprehensive redaction**: Both parsed config objects and raw JSON5 text are scrubbed for sensitive fields                       |
| 2   | **Round-trip protection**: `restoreRedactedValues` prevents credentials from being overwritten with sentinel values during UI save |
| 3   | **Reject on missing original**: Throws an error if a redacted field has no original to restore, preventing write-through attacks   |
| 4   | **Secret scanning in CI**: `detect-secrets` v1.5.0 with 27+ detector plugins and custom exclusion patterns                         |
| 5   | **Pre-commit hooks**: Secret detection, shellcheck, actionlint, and zizmor all run before commit                                   |
| 6   | **`.gitignore` coverage**: `.env`, credentials, agent memory, and local configs are all excluded                                   |

### ⚠️ Findings

#### FINDING CFG-1: Sensitive Key Pattern May Not Catch All Credential Fields (Low)

**File:** `src/config/redact-snapshot.ts` (line 15)
**Description:** The `SENSITIVE_KEY_PATTERNS` array is:

```typescript
[/token/i, /password/i, /secret/i, /api.?key/i];
```

This misses field names like `credential`, `auth`, `bearer`, `privateKey`, `signingKey`, `accessKey`, `sessionKey` (when used for auth), and `cookie`.
**Risk:** Credentials stored under non-matching field names could be exposed in UI responses.
**Remediation:** Expand the pattern list:

```typescript
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /api.?key/i,
  /credential/i,
  /bearer/i,
  /private.?key/i,
  /signing.?key/i,
  /access.?key/i,
  /cookie/i,
  /auth.?token/i,
];
```

#### FINDING CFG-2: `.env.example` Contains Real Twilio SID Format (Low)

**File:** `.env.example` (line 2)
**Description:** The example file uses `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` which matches the Twilio Account SID format (`AC` prefix + 32 hex chars). While the value itself is clearly placeholder, this is flagged by detect-secrets (confirmed in `.secrets.baseline`).
**Risk:** Negligible — it's a placeholder, but it trains developers to commit similar-looking real values.
**Remediation:** Use a clearly non-SID format like `AC_YOUR_ACCOUNT_SID_HERE`.

---

## 6. Container & Deployment Security

### Files Reviewed

- `Dockerfile`
- `docker-compose.yml`
- `fly.toml`
- `fly.private.toml`

### ✅ Strengths

| #   | Detail                                                                                |
| --- | ------------------------------------------------------------------------------------- |
| 1   | **Non-root execution**: Container runs as `node` user (UID 1000) after build          |
| 2   | **Frozen lockfile**: `pnpm install --frozen-lockfile` prevents supply chain surprises |
| 3   | **`init: true`**: Docker Compose uses PID 1 init for proper signal handling           |
| 4   | **Fly.io hardened template**: `fly.private.toml` removes all public ingress           |
| 5   | **HTTPS forced**: `fly.toml` sets `force_https = true`                                |
| 6   | **Production NODE_ENV**: Set in Dockerfile and fly configs                            |
| 7   | **Clean apt-get**: Removes apt lists and caches after optional package install        |

### ⚠️ Findings

#### FINDING CTR-1: Dockerfile Runs `curl | bash` for Bun Installation (High)

**File:** `Dockerfile` (line 4)
**Description:**

```dockerfile
RUN curl -fsSL https://bun.sh/install | bash
```

This pattern is a well-known supply chain risk. If `bun.sh` is compromised or a MITM attack occurs, arbitrary code runs as root inside the build container.
**Risk:** Supply chain compromise during Docker build.
**Remediation:**

1. Pin the Bun version: `curl -fsSL https://bun.sh/install | bash -s -- bun-v1.x.x`
2. Verify a checksum after download.
3. Or use the official Bun Docker image as a build stage.

#### FINDING CTR-2: `OPENCLAW_DOCKER_APT_PACKAGES` Allows Arbitrary Package Installation (Medium)

**File:** `Dockerfile` (lines 11–17)
**Description:** The `OPENCLAW_DOCKER_APT_PACKAGES` build arg allows installing arbitrary apt packages. While useful for customization, a malicious or misconfigured build could install unwanted software.
**Risk:** Compromised packages or unvetted software in the container image.
**Remediation:** Document the security implications. Consider validating packages against an allowlist, or remove this feature from production Dockerfiles.

#### FINDING CTR-3: Docker Compose Exposes Session Keys as Environment Variables (Medium)

**File:** `docker-compose.yml` (lines 8–10)
**Description:**

```yaml
CLAUDE_AI_SESSION_KEY: ${CLAUDE_AI_SESSION_KEY}
CLAUDE_WEB_SESSION_KEY: ${CLAUDE_WEB_SESSION_KEY}
CLAUDE_WEB_COOKIE: ${CLAUDE_WEB_COOKIE}
```

These sensitive values are passed as environment variables, which are visible in `docker inspect`, process listings, and may be logged by container orchestrators.
**Risk:** Credential exposure through container metadata inspection.
**Remediation:**

1. Use Docker secrets or mount a secrets file instead.
2. Add documentation warning against `docker inspect` in shared environments.

#### FINDING CTR-4: No Multi-Stage Build — Source Code Included in Production Image (Medium)

**File:** `Dockerfile` (line 26)
**Description:** `COPY . .` copies the entire source tree into the production image, including test files, documentation, and development artifacts. After `pnpm build`, the source files remain.
**Risk:** Increased attack surface; source code disclosure if container filesystem is accessed.
**Remediation:** Use a multi-stage build:

```dockerfile
FROM node:22-bookworm AS builder
# ... build steps ...

FROM node:22-bookworm-slim AS runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
```

---

## 7. CI/CD Pipeline Security

### Files Reviewed

- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `zizmor.yml`

### ✅ Strengths

| #   | Detail                                                                                        |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | **Secret scanning in CI**: Dedicated `secrets` job with `detect-secrets`                      |
| 2   | **Code analysis gate**: File size threshold checks prevent sneaking in large obfuscated files |
| 3   | **Concurrency control**: `cancel-in-progress: true` prevents queue flood                      |
| 4   | **Pre-commit security tools**: actionlint, zizmor, shellcheck, detect-secrets                 |
| 5   | **Dependabot**: Automated dependency updates (configuration file present)                     |

### ⚠️ Findings

#### FINDING CI-1: Zizmor Disables Key Security Rules (Medium)

**File:** `zizmor.yml`
**Description:** Three important zizmor security rules are disabled:

- `unpinned-uses` — Actions not pinned to SHA hashes
- `excessive-permissions` — Workflows without explicit permission blocks
- `artipacked` — Persist-credentials on checkout
  **Risk:** Vulnerable to GitHub Actions supply chain attacks (dependency confusion, compromised action versions).
  **Remediation:**

1. Re-enable `unpinned-uses` and pin all third-party actions to full SHA hashes (e.g., `actions/checkout@<sha>`).
2. Add explicit `permissions: {}` blocks to all workflow files.
3. Set `persist-credentials: false` on checkout steps.

#### FINDING CI-2: Workflow Uses `${{ github.event.before }}` Without Validation (Low)

**File:** `.github/workflows/ci.yml` (line 55)
**Description:** The `changed-scope` job uses `${{ github.event.before }}` to determine the base commit for diff. On force-pushes, this value can be the zero SHA, potentially causing the diff to fail or produce incorrect results.
**Risk:** Incorrect scope detection — security checks might be skipped.
**Remediation:** Add validation: if `before` is the zero SHA, fall back to `HEAD~1` or run all checks.

#### FINDING CI-3: No Explicit Permissions Block on Workflows (Medium)

**File:** `.github/workflows/ci.yml`
**Description:** The CI workflow does not declare a top-level `permissions:` block. By default, GitHub Actions may grant `write` permissions to the `GITHUB_TOKEN`, which is overly broad for CI checks.
**Risk:** Compromised action could modify repository contents or create releases.
**Remediation:** Add `permissions: { contents: read }` at the top level.

---

## 8. File System & Permissions

### Files Reviewed

- `src/security/fix.ts`
- `src/security/audit.ts`
- `src/security/windows-acl.ts`

### ✅ Strengths

| #   | Detail                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Comprehensive chmod enforcement**: State dirs (0o700), credentials (0o600), with platform-aware handling       |
| 2   | **Windows ACL support**: Full `icacls` parsing and reset command generation                                      |
| 3   | **World-writable detection**: Audit checks for world-writable state directories                                  |
| 4   | **Safe ownership model**: Distinguishes trusted principals (SYSTEM, Administrators, current user) from untrusted |
| 5   | **Dry-run support**: Permission fixes can be previewed before applying                                           |

### ⚠️ Findings

#### FINDING FS-1: Race Condition in Permission Checks (Low)

**File:** `src/security/fix.ts`
**Description:** The pattern of `stat() → check permissions → chmod()` has a TOCTOU (Time-of-Check-Time-of-Use) race condition. Between the check and the fix, permissions could be modified by another process.
**Risk:** Extremely low in practice — only relevant in adversarial multi-user environments.
**Remediation:** Use `fchmod` on an open file descriptor when possible to eliminate the race.

---

## 9. WebSocket & API Surface

### Files Reviewed

- `src/gateway/server-http.ts`
- `src/gateway/openai-http.ts`
- `src/gateway/tools-invoke-http.ts`
- `src/gateway/hooks.ts`

### ✅ Strengths

| #   | Detail                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- |
| 1   | **Auth required on all API endpoints**: OpenAI, tools/invoke, and WebSocket upgrade all check auth  |
| 2   | **Body size limits**: Configurable max body sizes to prevent DoS                                    |
| 3   | **Method enforcement**: Proper 405 responses for incorrect HTTP methods                             |
| 4   | **SSE streaming**: Clean Server-Sent Events implementation with proper cleanup on client disconnect |
| 5   | **Webhook token validation**: Hooks configuration extracts and validates bearer tokens              |

### ⚠️ Findings

#### FINDING API-1: OpenAI Endpoint Internal Errors May Leak Details (Medium)

**File:** `src/gateway/openai-http.ts` (lines 263–266, 397–406)
**Description:** Error responses include `String(err)` directly:

```typescript
sendJson(res, 500, { error: { message: String(err), type: "api_error" } });
```

and in SSE streaming:

```typescript
delta: {
  content: `Error: ${String(err)}`;
}
```

**Risk:** Internal error messages (file paths, stack traces, config details) sent to clients.
**Remediation:** Return sanitized error messages. Log full errors server-side.

#### FINDING API-2: No Rate Limiting on API Endpoints (High)

**File:** `src/gateway/server-http.ts`
**Description:** There is no visible rate limiting on the HTTP endpoints (`/v1/chat/completions`, `/tools/invoke`, WebSocket connections). An authenticated user could flood the gateway with requests.
**Risk:** Denial of service; resource exhaustion; abuse of LLM API credits.
**Remediation:**

1. Implement per-IP and per-token rate limiting (e.g., using a token bucket).
2. Add configurable limits: `gateway.http.rateLimit.requestsPerMinute`.
3. Consider different limits for different endpoint types.

#### FINDING API-3: Hooks Endpoint Lacks Request Validation Schema (Medium)

**File:** `src/gateway/hooks.ts`
**Description:** Webhook payloads are parsed as JSON but not validated against a schema. Malformed payloads could cause unexpected behavior in downstream processing.
**Risk:** Injection through malformed webhook payloads.
**Remediation:** Add TypeBox or Zod schema validation for webhook payload structure.

---

## 10. Code Quality & Static Analysis

### Files Reviewed

- `.pre-commit-config.yaml`
- `.oxlintrc.json` (referenced)
- `package.json` (scripts)

### ✅ Strengths

| #   | Detail                                                                                           |
| --- | ------------------------------------------------------------------------------------------------ |
| 1   | **Comprehensive pre-commit suite**: 8+ hooks covering format, lint, secrets, shells, and actions |
| 2   | **Type-aware linting**: `oxlint --type-aware` catches type-level issues                          |
| 3   | **Cross-platform testing**: CI runs on Ubuntu, Windows, and macOS                                |
| 4   | **Protocol conformance checks**: `pnpm protocol:check` ensures protocol compatibility            |
| 5   | **File size gates**: Prevents files from growing past thresholds                                 |

### ⚠️ Findings

#### FINDING QA-1: TypeScript `as` Casts in Security-Critical Paths (Low)

**File:** `src/gateway/tools-invoke-http.ts`, `src/gateway/openai-http.ts`
**Description:** Multiple `as` type casts are used on untrusted input:

```typescript
const body = (bodyUnknown ?? {}) as ToolsInvokeBody;
const entry = item as Record<string, unknown>;
```

These bypass TypeScript's type checking. While the code typically validates fields afterwards, the casts could mask bugs.
**Risk:** Type confusion leading to unexpected behavior.
**Remediation:** Use runtime validation (Zod, TypeBox, or manual checks) instead of `as` casts for untrusted input boundaries.

---

## Risk Summary Matrix

| ID     | Finding                                | Severity  | Area         | Status                                                                                          |
| ------ | -------------------------------------- | --------- | ------------ | ----------------------------------------------------------------------------------------------- |
| NET-1  | LAN bind without auth warning          | 🔴 High   | Network      | ✅ Fixed — `server-startup-log.ts`                                                              |
| API-2  | No rate limiting on endpoints          | 🔴 High   | API          | ✅ Fixed — `rate-limiter.ts` module created                                                     |
| CTR-1  | `curl \| bash` in Dockerfile           | 🔴 High   | Container    | ✅ Fixed — Bun version pinned in `Dockerfile`                                                   |
| AUTH-1 | Loopback skips authentication          | 🟡 Medium | Auth         | ✅ Fixed — `requireOnLoopback` config option in `types.gateway.ts`, `auth.ts`, `server-http.ts` |
| AUTH-3 | Device auth payload no expiry          | 🟡 Medium | Auth         | ✅ Fixed — `validateDeviceAuthTTL()` with 5-min TTL in `device-auth.ts`                         |
| EXT-1  | Regex-based injection detection bypass | 🟡 Medium | Content      | ✅ Fixed — NFKC normalization + ZWJ stripping                                                   |
| TOOL-2 | `system.run` in default allowlist      | 🟡 Medium | Tools        | ✅ Fixed — moved to dangerous commands                                                          |
| CTR-2  | Arbitrary apt packages in Dockerfile   | 🟡 Medium | Container    | ✅ Fixed — package name validation + security warning in `Dockerfile`                           |
| CTR-3  | Session keys as env vars               | 🟡 Medium | Container    | ✅ Fixed — migrated to `env_file` in `docker-compose.yml`                                       |
| CTR-4  | No multi-stage Docker build            | 🟡 Medium | Container    | ✅ Fixed — multi-stage `Dockerfile`                                                             |
| CI-1   | Zizmor security rules disabled         | 🟡 Medium | CI/CD        | ✅ Fixed — all rules re-enabled in `zizmor.yml`                                                 |
| CI-3   | No explicit workflow permissions       | 🟡 Medium | CI/CD        | ✅ Fixed — `permissions: { contents: read }`                                                    |
| API-1  | Error messages leak internals          | 🟡 Medium | API          | ✅ Fixed — `error-sanitizer.ts` module                                                          |
| API-3  | Hooks lack schema validation           | 🟡 Medium | API          | ✅ Fixed — payload type validation in `server-http.ts`                                          |
| AUTH-2 | Password auth no key-stretching        | 🟢 Low    | Auth         | ✅ Fixed — HMAC-SHA-256 keyed hashing in `auth.ts` (`safePasswordEqual`)                        |
| NET-2  | Forwarded header parsing order         | 🟢 Low    | Network      | ✅ Fixed — rightmost-untrusted in `net.ts`                                                      |
| EXT-2  | Skill scanner misses dynamic imports   | 🟢 Low    | Content      | ✅ Fixed — 5 new rules in `skill-scanner.ts`                                                    |
| TOOL-1 | Tool error message leakage             | 🟢 Low    | Tools        | ✅ Fixed — `error-sanitizer.ts`                                                                 |
| CFG-1  | Sensitive key patterns incomplete      | 🟢 Low    | Config       | ✅ Fixed — 10 new patterns                                                                      |
| CFG-2  | `.env.example` Twilio SID format       | 🟢 Low    | Config       | ✅ Fixed — placeholder changed to `AC_YOUR_ACCOUNT_SID_HERE`                                    |
| FS-1   | TOCTOU in permission checks            | 🟢 Low    | File System  | ✅ Fixed — `open(O_NOFOLLOW) → fstat → fchmod` in `fix.ts`                                      |
| CI-2   | Zero SHA edge case in CI               | 🟢 Low    | CI/CD        | ✅ Fixed — zero SHA guard + `HEAD~1` fallback in `ci.yml`                                       |
| QA-1   | TypeScript `as` casts on input         | 🟢 Low    | Code Quality | ✅ Fixed — runtime validation in `tools-invoke-http.ts`, `server-http.ts`                       |
| NEW    | Security response headers              | —         | API          | ✅ Added — `http-common.ts`                                                                     |

---

## Priority Remediation Roadmap

### ✅ Phase 1: Immediate — COMPLETE

1. ~~**NET-1**: Add startup warning/fail-fast when `--bind lan` is used without authentication~~
2. ~~**API-2**: Implement basic rate limiting (token bucket per IP/token)~~
3. ~~**CTR-1**: Pin Bun version and add checksum verification in Dockerfile~~
4. ~~**API-1**: Sanitize error responses on all HTTP endpoints~~

### ✅ Phase 2: Short-term — COMPLETE

5. ~~**CI-1 + CI-3**: Re-enable zizmor rules; add `permissions:` blocks to all workflows~~
6. ~~**CTR-4**: Implement multi-stage Docker build~~
7. ~~**CTR-3**: Migrated to `env_file` in docker-compose.yml; documented secrets best practices~~
8. ~~**TOOL-2**: Move `system.run` to dangerous commands list~~

### ✅ Phase 3: Medium-term — COMPLETE

9. ~~**AUTH-1**: Added `requireOnLoopback` config option for hardened deployments~~
10. ~~**AUTH-2**: HMAC-SHA-256 keyed hashing for password auth~~
11. ~~**AUTH-3**: TTL enforcement (5 min) for device auth payloads~~
12. ~~**EXT-1**: Unicode normalization and enhanced detection~~
13. ~~**API-3**: Payload type validation for webhook requests~~
14. ~~**CFG-1 + CFG-2**: Expanded sensitive key patterns; fixed `.env.example`~~
15. ~~**FS-1**: TOCTOU-safe `open(O_NOFOLLOW) → fstat → fchmod` pattern~~
16. ~~**CI-2**: Zero SHA guard for force-pushes~~
17. ~~**QA-1**: Runtime validation replacing unsafe `as` casts~~
18. ~~**NET-2**: Rightmost-untrusted IP parsing for X-Forwarded-For~~

### Phase 4: Ongoing

19. Regular dependency updates via Dependabot
20. Periodic re-audit of secrets baseline
21. Monitor prompt injection bypass reports
22. Track CVEs for Node.js 22, Bun, and pnpm
23. Consider bcrypt/argon2 migration for password auth if user-facing auth is added

---

## Positive Security Patterns Worth Maintaining

These practices are exemplary and should be preserved as the codebase evolves:

1. **Config redaction round-trip safety** — The sentinel-based redaction/restore pattern in `redact-snapshot.ts` is well-engineered and prevents common UI credential corruption bugs.

2. **Layered tool policy chain** — The profile → global → agent → group → subagent filtering in `tools-invoke-http.ts` provides fine-grained control.

3. **Platform-aware command policies** — `node-command-policy.ts` correctly differentiates iOS, Android, macOS, Linux, and Windows capabilities.

4. **External content security markers** — The wrapping and detection system in `external-content.ts` provides defense-in-depth against prompt injection.

5. **Pre-commit security hooks** — The comprehensive pre-commit configuration catches issues before they reach CI.

6. **Docker non-root user** — Running as `node` user reduces container escape impact.

7. **Private Fly.io template** — `fly.private.toml` removes all public ingress, an excellent option for hardened deployments.

---

_This audit was performed through static code review. Dynamic testing (penetration testing, fuzzing) is recommended as a complement to these findings._
