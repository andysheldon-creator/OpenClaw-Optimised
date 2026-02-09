# 7. OpenClaw 위협 모델 v1.0

## 8. MITRE ATLAS 프레임워크

9. **버전:** 1.0-draft
   **마지막 업데이트:** 2026-02-04
   **방법론:** MITRE ATLAS + 데이터 흐름 다이어그램
   **프레임워크:** [MITRE ATLAS](https://atlas.mitre.org/) (AI 시스템을 위한 적대적 위협 환경)

### 10. 프레임워크 출처

11. 이 위협 모델은 AI/ML 시스템에 대한 적대적 위협을 문서화하기 위한 산업 표준 프레임워크인 [MITRE ATLAS](https://atlas.mitre.org/)를 기반으로 구축되었습니다. 12. ATLAS는 AI 보안 커뮤니티와의 협력을 통해 [MITRE](https://www.mitre.org/)에서 유지 관리하고 있습니다.

13. **주요 ATLAS 리소스:**

- [ATLAS 기법](https://atlas.mitre.org/techniques/)
- 15. [ATLAS 전술](https://atlas.mitre.org/tactics/)
- 16. [ATLAS 사례 연구](https://atlas.mitre.org/studies/)
- 17. [ATLAS GitHub](https://github.com/mitre-atlas/atlas-data)
- 18. [ATLAS에 기여하기](https://atlas.mitre.org/resources/contribute)

### 19. 이 위협 모델에 기여하기

20. 이 문서는 OpenClaw 커뮤니티에서 유지 관리하는 살아있는 문서입니다. 21. 기여 지침은 [CONTRIBUTING-THREAT-MODEL.md](./CONTRIBUTING-THREAT-MODEL.md)를 참조하세요:

- 22. 새로운 위협 보고
- 23. 기존 위협 업데이트
- 24. 공격 체인 제안
- 25. 완화 방안 제안

---

## 26. 1. 27. 소개

### 28. 1.1 목적

29. 이 위협 모델은 AI/ML 시스템을 위해 특별히 설계된 MITRE ATLAS 프레임워크를 사용하여 OpenClaw AI 에이전트 플랫폼과 ClawHub 스킬 마켓플레이스에 대한 적대적 위협을 문서화합니다.

### 30. 1.2 범위

| 31. 구성 요소             | 32. 포함 여부 | 33. 비고                                           |
| -------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| 34. OpenClaw 에이전트 런타임 | 35. 예     | 36. 핵심 에이전트 실행, 도구 호출, 세션                        |
| 37. 게이트웨이             | 38. 예     | 39. 인증, 라우팅, 채널 통합                               |
| 40. 채널 통합             | 41. 예     | 42. WhatsApp, Telegram, Discord, Signal, Slack 등 |
| 43. ClawHub 마켓플레이스    | 44. 예     | 45. 스킬 게시, 검토, 배포                                |
| 46. MCP 서버            | 47. 예     | 48. 외부 도구 제공자                                    |
| 49. 사용자 디바이스          | 50. 부분적   | Mobile apps, desktop clients                                            |

### 1.3 Out of Scope

Nothing is explicitly out of scope for this threat model.

---

## 2. System Architecture

### 2.1 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  WhatsApp   │  │  Telegram   │  │   Discord   │  ...         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST BOUNDARY 1: Channel Access                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      GATEWAY                              │   │
│  │  • Device Pairing (30s grace period)                      │   │
│  │  • AllowFrom / AllowList validation                       │   │
│  │  • Token/Password/Tailscale auth                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST BOUNDARY 2: Session Isolation              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   AGENT SESSIONS                          │   │
│  │  • Session key = agent:channel:peer                       │   │
│  │  • Tool policies per agent                                │   │
│  │  • Transcript logging                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST BOUNDARY 3: Tool Execution                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  EXECUTION SANDBOX                        │   │
│  │  • Docker sandbox OR Host (exec-approvals)                │   │
│  │  • Node remote execution                                  │   │
│  │  • SSRF protection (DNS pinning + IP blocking)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST BOUNDARY 4: External Content               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              FETCHED URLs / EMAILS / WEBHOOKS             │   │
│  │  • External content wrapping (XML tags)                   │   │
│  │  • Security notice injection                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST BOUNDARY 5: Supply Chain                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      CLAWHUB                              │   │
│  │  • Skill publishing (semver, SKILL.md required)           │   │
│  │  • Pattern-based moderation flags                         │   │
│  │  • VirusTotal scanning (coming soon)                      │   │
│  │  • GitHub account age verification                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flows

| Flow | Source  | Destination | Data                                    | Protection           |
| ---- | ------- | ----------- | --------------------------------------- | -------------------- |
| F1   | Channel | Gateway     | User messages                           | TLS, AllowFrom       |
| F2   | Gateway | Agent       | Routed messages                         | Session isolation    |
| F3   | Agent   | Tools       | Tool invocations                        | Policy enforcement   |
| F4   | Agent   | External    | web_fetch requests | SSRF blocking        |
| F5   | ClawHub | Agent       | Skill code                              | Moderation, scanning |
| F6   | Agent   | Channel     | Responses                               | Output filtering     |

---

## 3. Threat Analysis by ATLAS Tactic

### 3.1 Reconnaissance (AML.TA0002)

#### T-RECON-001: Agent Endpoint Discovery

| Attribute       | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| **ATLAS ID**    | 1. AML.T0006 - 능동적 스캐닝 |
| **설명**          | 공격자가 노출된 OpenClaw 게이트웨이 엔드포인트를 스캔함                            |
| **공격 벡터**       | 네트워크 스캐닝, shodan 쿼리, DNS 열거                                   |
| **영향 받는 구성 요소** | 게이트웨이, 노출된 API 엔드포인트                                          |
| **현재 완화책**      | Tailscale 인증 옵션, 기본적으로 루프백에 바인딩                               |
| **잔존 위험**       | 중간 - 공개 게이트웨이 발견 가능                                           |
| **권고 사항**       | 보안 배포 문서화, 탐색 엔드포인트에 속도 제한 추가                                 |

#### T-RECON-002: 채널 통합 프로빙

| 속성              | 값                                   |
| --------------- | ----------------------------------- |
| **ATLAS ID**    | AML.T0006 - 능동적 스캐닝 |
| **설명**          | 공격자가 AI 관리 계정을 식별하기 위해 메시징 채널을 프로빙함 |
| **공격 벡터**       | 테스트 메시지 전송, 응답 패턴 관찰                |
| **영향 받는 구성 요소** | 모든 채널 통합                            |
| **현재 완화책**      | 특별한 사항 없음                           |
| **잔존 위험**       | 낮음 - 단순 발견만으로는 가치가 제한적              |
| **권고 사항**       | 응답 타이밍 무작위화를 고려                     |

---

### 3.2 초기 접근 (AML.TA0004)

#### T-ACCESS-001: 페어링 코드 가로채기

| 속성              | 값                                           |
| --------------- | ------------------------------------------- |
| **ATLAS ID**    | AML.T0040 - AI 모델 추론 API 접근 |
| **설명**          | 공격자가 30초 유예 기간 동안 페어링 코드를 가로챔               |
| **공격 벡터**       | 숄더 서핑, 네트워크 스니핑, 사회공학                       |
| **영향 받는 구성 요소** | 디바이스 페어링 시스템                                |
| **현재 완화책**      | 30초 만료, 기존 채널을 통해 코드 전송                     |
| **잔존 위험**       | 중간 - 유예 기간 악용 가능                            |
| **권고 사항**       | 유예 기간 단축, 확인 단계 추가                          |

#### T-ACCESS-002: AllowFrom 스푸핑

| 속성                      | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **Recommendations**     | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute               | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                |
| **Description**         | Attacker steals authentication tokens from config files                  |
| **Attack Vector**       | Malware, unauthorized device access, config backup exposure              |
| **Affected Components** | ~/.openclaw/credentials/, config storage |
| **Current Mitigations** | File permissions                                                         |
| **Residual Risk**       | High - Tokens stored in plaintext                                        |
| **Recommendations**     | Implement token encryption at rest, add token rotation                   |

---

### 3.3 Execution (AML.TA0005)

#### T-EXEC-001: Direct Prompt Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker sends crafted prompts to manipulate agent behavior                                  |
| **Attack Vector**       | Channel messages containing adversarial instructions                                         |
| **Affected Components** | Agent LLM, all input surfaces                                                                |
| **Current Mitigations** | Pattern detection, external content wrapping                                                 |
| **Residual Risk**       | Critical - Detection only, no blocking; sophisticated attacks bypass                         |
| **Recommendations**     | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: 간접 프롬프트 인젝션

| 속성             | 값                                                                                |
| -------------- | -------------------------------------------------------------------------------- |
| **ATLAS ID**   | AML.T0051.001 - LLM 프롬프트 인젝션: 간접 |
| **설명**         | 공격자가 가져온 콘텐츠에 악성 지시를 삽입함                                                         |
| **공격 벡터**      | 악성 URL, 오염된 이메일, 침해된 웹훅                                                          |
| **영향받는 구성 요소** | web_fetch, 이메일 수집, 외부 데이터 소스                                |
| **현재 완화 조치**   | XML 태그로 콘텐츠를 감싸고 보안 공지 추가                                                        |
| **잔여 위험**      | 높음 - LLM이 래퍼 지시를 무시할 수 있음                                                        |
| **권장 사항**      | 콘텐츠 정화 구현, 실행 컨텍스트 분리                                                            |

#### T-EXEC-003: 도구 인자 인젝션

| 속성             | 값                                                                                |
| -------------- | -------------------------------------------------------------------------------- |
| **ATLAS ID**   | AML.T0051.000 - LLM 프롬프트 인젝션: 직접 |
| **설명**         | 공격자가 프롬프트 인젝션을 통해 도구 인자를 조작함                                                     |
| **공격 벡터**      | 도구 매개변수 값에 영향을 미치는 조작된 프롬프트                                                      |
| **영향받는 구성 요소** | 모든 도구 호출                                                                         |
| **현재 완화 조치**   | 위험한 명령에 대한 실행 승인                                                                 |
| **잔여 위험**      | 높음 - 사용자 판단에 의존                                                                  |
| **권장 사항**      | 인자 검증 구현, 매개변수화된 도구 호출                                                           |

#### T-EXEC-004: 실행 승인 우회

| 속성             | 값                                                 |
| -------------- | ------------------------------------------------- |
| **ATLAS ID**   | AML.T0043 - 적대적 데이터 제작            |
| **설명**         | 공격자가 승인 허용 목록을 우회하는 명령을 제작함                       |
| **공격 벡터**      | 명령 난독화, 별칭 악용, 경로 조작                              |
| **영향받는 구성 요소** | exec-approvals.ts, 명령 허용 목록       |
| **현재 완화 조치**   | 허용 목록 + 질의 모드                                     |
| **잔여 위험**      | 높음 - 명령 정화가 없음                                    |
| **권장 사항**      | Implement command normalization, expand blocklist |

---

### 3.4 Persistence (AML.TA0006)

#### T-PERSIST-001: Malicious Skill Installation

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker publishes malicious skill to ClawHub                                                        |
| **Attack Vector**       | Create account, publish skill with hidden malicious code                                             |
| **Affected Components** | ClawHub, skill loading, agent execution                                                              |
| **Current Mitigations** | GitHub account age verification, pattern-based moderation flags                                      |
| **Residual Risk**       | Critical - No sandboxing, limited review                                                             |
| **Recommendations**     | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **Recommendations**     | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute               | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**         | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**       | Config file modification, settings injection                                                  |
| **Affected Components** | Agent config, tool policies                                                                   |
| **Current Mitigations** | File permissions                                                                              |
| **Residual Risk**       | Medium - Requires local access                                                                |
| **Recommendations**     | Config integrity verification, audit logging for config changes                               |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute               | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data                                        |
| **Description**         | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**       | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components** | ClawHub moderation.ts                                                     |
| **Current Mitigations** | Pattern-based FLAG_RULES                                             |
| **Residual Risk**       | High - Simple regex easily bypassed                                                       |
| **Recommendations**     | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **Recommendations**     | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute                              | Value                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| **ATLAS ID**                           | AML.T0040 - AI Model Inference API Access |
| **Description**                        | Attacker enumerates available tools through prompting     |
| **Attack Vector**                      | "What tools do you have?" style queries                   |
| **Affected Components**                | Agent tool registry                                       |
| 1. **현재 완화 조치** | 2. 특별한 사항 없음                       |
| 3. **잔존 위험**    | 4. 낮음 - 도구가 일반적으로 문서화되어 있음         |
| 5. **권장 사항**    | 6. 도구 가시성 제어 고려                    |

#### 7. T-DISC-002: 세션 데이터 추출

| 8. 속성              | 9. 값                                            |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| 10. **ATLAS ID**   | 11. AML.T0040 - AI 모델 추론 API 접근 |
| 12. **설명**         | 13. 공격자가 세션 컨텍스트에서 민감한 데이터를 추출함                 |
| 14. **공격 벡터**      | 15. "우리가 무엇을 논의했지?" 질의, 컨텍스트 탐색                 |
| 16. **영향받는 구성 요소** | 17. 세션 전사본, 컨텍스트 윈도우                            |
| 18. **현재 완화 조치**   | 19. 발신자별 세션 격리                                  |
| 20. **잔존 위험**      | 21. 중간 - 세션 내 데이터 접근 가능                         |
| 22. **권장 사항**      | 23. 컨텍스트에서 민감 데이터 마스킹 구현                        |

---

### 24. 3.7 수집 및 유출 (AML.TA0009, AML.TA0010)

#### 25. T-EXFIL-001: web_fetch를 통한 데이터 탈취

| 26. 속성             | 27. 값                                        |
| ----------------------------------------- | ------------------------------------------------------------------- |
| 28. **ATLAS ID**   | 29. AML.T0009 - 수집           |
| 30. **설명**         | 31. 공격자가 에이전트에게 외부 URL로 전송하도록 지시하여 데이터를 유출함  |
| 32. **공격 벡터**      | 33. 프롬프트 인젝션으로 에이전트가 공격자 서버로 데이터를 POST하도록 유도 |
| 34. **영향받는 구성 요소** | 35. web_fetch 도구        |
| 36. **현재 완화 조치**   | 37. 내부 네트워크에 대한 SSRF 차단                      |
| 38. **잔존 위험**      | 39. 높음 - 외부 URL 허용됨                          |
| 40. **권장 사항**      | 41. URL 허용 목록 구현, 데이터 분류 인식                  |

#### 42. T-EXFIL-002: 무단 메시지 전송

| 43. 속성           | 44. 값                                      |
| --------------------------------------- | ----------------------------------------------------------------- |
| 45. **ATLAS ID** | 46. AML.T0009 - 수집         |
| 47. **설명**       | 48. 공격자가 민감한 데이터를 포함한 메시지를 에이전트가 전송하도록 유발함 |
| 49. **공격 벡터**    | 50. 프롬프트 인젝션으로 에이전트가 공격자에게 메시지를 전송하도록 유도   |
| **Affected Components**                 | Message tool, channel integrations                                |
| **Current Mitigations**                 | Outbound messaging gating                                         |
| **Residual Risk**                       | Medium - Gating may be bypassed                                   |
| **Recommendations**                     | Require explicit confirmation for new recipients                  |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **Recommendations**     | Skill sandboxing, credential isolation                  |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001: Unauthorized Command Execution

| Attribute               | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker executes arbitrary commands on user system  |
| **Attack Vector**       | Prompt injection combined with exec approval bypass  |
| **Affected Components** | Bash tool, command execution                         |
| **Current Mitigations** | Exec approvals, Docker sandbox option                |
| **Residual Risk**       | Critical - Host execution without sandbox            |
| **Recommendations**     | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **Recommendations**     | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute               | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity    |
| **Description**         | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**       | Prompt injection causing inappropriate responses        |
| **Affected Components** | Output generation, channel messaging                    |
| **현재 완화책**              | LLM provider content policies                           |
| **Residual Risk**       | Medium - Provider filters imperfect                     |
| **Recommendations**     | Output filtering layer, user controls                   |

---

## 4. ClawHub Supply Chain Analysis

### 4.1 Current Security Controls

| Control                           | Implementation                                                   | Effectiveness                                        |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| GitHub Account Age                | `requireGitHubAccountAge()`                                      | Medium - Raises bar for new attackers                |
| Path Sanitization                 | `sanitizePath()`                                                 | High - Prevents path traversal                       |
| File Type Validation              | `isTextFile()`                                                   | Medium - Only text files, but can still be malicious |
| Size Limits                       | 50MB total bundle                                                | High - Prevents resource exhaustion                  |
| Required SKILL.md | Mandatory readme                                                 | Low security value - Informational only              |
| Pattern Moderation                | FLAG_RULES in moderation.ts | 낮음 - 쉽게 우회 가능                                        |
| 모더레이션 상태                          | `moderationStatus` 필드                                            | 중간 - 수동 검토 가능                                        |

### 4.2 모더레이션 플래그 패턴

`moderation.ts`의 현재 패턴:

```javascript
// Known-bad identifiers
/(keepcold131\/ClawdAuthenticatorTool|ClawdAuthenticatorTool)/i

// Suspicious keywords
/(malware|stealer|phish|phishing|keylogger)/i
/(api[-_ ]?key|token|password|private key|secret)/i
/(wallet|seed phrase|mnemonic|crypto)/i
/(discord\.gg|webhook|hooks\.slack)/i
/(curl[^\n]+\|\s*(sh|bash))/i
/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd)/i
```

**제한 사항:**

- slug, displayName, summary, frontmatter, metadata, 파일 경로만 검사
- 실제 스킬 코드 콘텐츠는 분석하지 않음
- 단순한 정규식은 난독화로 쉽게 우회 가능
- 행동 분석 없음

### 4.3 계획된 개선 사항

| 개선 항목         | 상태                                             | 영향                                                                |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| VirusTotal 통합 | 진행 중                                           | 높음 - 코드 인사이트 기반 행동 분석                                             |
| 커뮤니티 신고       | 부분적 (`skillReports` 테이블 존재) | 중간                                                                |
| 감사 로그         | 부분적 (`auditLogs` 테이블 존재)    | 중간                                                                |
| 배지 시스템        | 구현 완료                                          | 중간 - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. 위험 매트릭스

### 5.1 가능성 vs 영향

| 위협 ID         | 가능성    | 영향       | 위험 수준      | 우선순위 |
| ------------- | ------ | -------- | ---------- | ---- |
| T-EXEC-001    | 높음     | 치명적      | **치명적**    | P0   |
| T-PERSIST-001 | 높음     | 치명적      | **치명적**    | P0   |
| T-EXFIL-003   | 중간     | 치명적      | **치명적**    | P0   |
| T-IMPACT-001  | Medium | Critical | **High**   | P1   |
| T-EXEC-002    | High   | High     | **High**   | P1   |
| T-EXEC-004    | Medium | High     | **High**   | P1   |
| T-ACCESS-003  | Medium | High     | **High**   | P1   |
| T-EXFIL-001   | Medium | High     | **High**   | P1   |
| T-IMPACT-002  | High   | Medium   | **High**   | P1   |
| T-EVADE-001   | High   | Medium   | **Medium** | P2   |
| T-ACCESS-001  | Low    | High     | **Medium** | P2   |
| T-ACCESS-002  | Low    | High     | **Medium** | P2   |
| T-PERSIST-002 | Low    | High     | **Medium** | P2   |

### 5.2 Critical Path Attack Chains

**Attack Chain 1: Skill-Based Data Theft**

```
T-PERSIST-001 → T-EVADE-001 → T-EXFIL-003
(Publish malicious skill) → (Evade moderation) → (Harvest credentials)
```

**Attack Chain 2: Prompt Injection to RCE**

```
T-EXEC-001 → T-EXEC-004 → T-IMPACT-001
(Inject prompt) → (Bypass exec approval) → (Execute commands)
```

**Attack Chain 3: Indirect Injection via Fetched Content**

```
T-EXEC-002 → T-EXFIL-001 → External exfiltration
(Poison URL content) → (Agent fetches & follows instructions) → (Data sent to attacker)
```

---

## 6. Recommendations Summary

### 6.1 Immediate (P0)

| ID    | Recommendation                              | Addresses                  |
| ----- | ------------------------------------------- | -------------------------- |
| R-001 | Complete VirusTotal integration             | T-PERSIST-001, T-EVADE-001 |
| R-002 | Implement skill sandboxing                  | T-PERSIST-001, T-EXFIL-003 |
| R-003 | Add output validation for sensitive actions | T-EXEC-001, T-EXEC-002     |

### 6.2 Short-term (P1)

| ID    | Recommendation                                                | Addresses    |
| ----- | ------------------------------------------------------------- | ------------ |
| R-004 | Implement rate limiting                                       | T-IMPACT-002 |
| R-005 | Add token encryption at rest                                  | T-ACCESS-003 |
| R-006 | Improve exec approval UX and validation                       | T-EXEC-004   |
| R-007 | Implement URL allowlisting for web_fetch | T-EXFIL-001  |

### 6.3 Medium-term (P2)

| ID    | Recommendation                                        | Addresses     |
| ----- | ----------------------------------------------------- | ------------- |
| R-008 | Add cryptographic channel verification where possible | T-ACCESS-002  |
| R-009 | Implement config integrity verification               | T-PERSIST-003 |
| R-010 | 업데이트 서명 및 버전 고정 추가                                    | T-PERSIST-002 |

---

## 7. 부록

### 7.1 ATLAS 기법 매핑

| ATLAS ID                                      | 기법 이름                            | OpenClaw 위협                                                      |
| --------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | 능동 스캐닝                           | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | 수집                               | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | 공급망: AI 소프트웨어    | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | 공급망: 데이터         | T-PERSIST-003                                                    |
| AML.T0031                     | AI 모델 무결성 훼손                     | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI 모델 추론 API 접근                  | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | 적대적 데이터 제작                       | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM 프롬프트 인젝션: 직접 | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM 프롬프트 인젝션: 간접 | T-EXEC-002                                                       |

### 7.2 주요 보안 파일

| 경로                                  | 목적          | 위험 수준   |
| ----------------------------------- | ----------- | ------- |
| `src/infra/exec-approvals.ts`       | 명령 승인 로직    | **치명적** |
| `src/gateway/auth.ts`               | 게이트웨이 인증    | **치명적** |
| `src/web/inbound/access-control.ts` | 채널 접근 제어    | **치명적** |
| `src/infra/net/ssrf.ts`             | SSRF 보호     | **중요**  |
| `src/security/external-content.ts`  | 프롬프트 인젝션 완화 | **중요**  |
| `src/agents/sandbox/tool-policy.ts` | 도구 정책 집행    | **중요**  |
| `convex/lib/moderation.ts`          | ClawHub 중재  | **높음**  |
| `convex/lib/skillPublish.ts`        | 스킬 게시 흐름    | **높음**  |
| `src/routing/resolve-route.ts`      | 세션 격리       | **중간**  |

### 7.3 용어집

| 용어           | 정의                               |
| ------------ | -------------------------------- |
| **ATLAS**    | MITRE의 AI 시스템을 위한 적대적 위협 환경      |
| **ClawHub**  | OpenClaw의 스킬 마켓플레이스              |
| **Gateway**  | OpenClaw의 메시지 라우팅 및 인증 계층        |
| **MCP**      | 모델 컨텍스트 프로토콜 - 도구 제공자 인터페이스      |
| **프롬프트 인젝션** | 악성 지시가 입력에 포함되는 공격               |
| **스킬**       | OpenClaw 에이전트를 위한 다운로드 가능한 확장 기능 |
| **SSRF**     | 서버 측 요청 위조                       |

---

_이 위협 모델은 지속적으로 업데이트되는 문서입니다._ 보안 문제는 security@openclaw.ai 로 신고해 주세요
