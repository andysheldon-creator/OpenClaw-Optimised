# OpenClaw Threat Model v1.0

## MITRE ATLAS Framework

**Version:** 1.0-draft
**Last Updated:** 2026-02-04
**Methodology:** MITRE ATLAS + Data Flow Diagrams
**Framework:** [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems)

### Framework Attribution

This threat model is built on [MITRE ATLAS](https://atlas.mitre.org/), the industry-standard framework for documenting adversarial threats to AI/ML systems. ATLAS is maintained by [MITRE](https://www.mitre.org/) in collaboration with the AI security community.

**Key ATLAS Resources:**

- [ATLAS Techniques](https://atlas.mitre.org/techniques/)
- [ATLAS Tactics](https://atlas.mitre.org/tactics/)
- [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- [ATLAS GitHub](https://github.com/mitre-atlas/atlas-data)
- [Contributing to ATLAS](https://atlas.mitre.org/resources/contribute)

### Contributing to This Threat Model

This is a living document maintained by the OpenClaw community. See [CONTRIBUTING-THREAT-MODEL.md](./CONTRIBUTING-THREAT-MODEL.md) for guidelines on contributing:

- Reporting new threats
- Updating existing threats
- Proposing attack chains
- Suggesting mitigations

---

## 1. Introduction

### 1.1 Purpose

This threat model documents adversarial threats to the OpenClaw AI agent platform and ClawHub skill marketplace, using the MITRE ATLAS framework designed specifically for AI/ML systems.

### 1.2 Scope

| Component              | Included | Notes                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | Yes      | Core agent execution, tool calls, sessions                       |
| Gateway                | Yes      | Authentication, routing, channel integration                     |
| Channel Integrations   | Yes      | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | Yes      | Skill publishing, moderation, distribution                       |
| MCP Servers            | Yes      | External tool providers                                          |
| User Devices           | Partial  | Mobile apps, desktop clients                                     |

### 1.3 範圍外

此威脅模型中沒有任何內容被明確列為範圍外。

---

## 2. 系統架構

### 2.1 信任邊界

```
┌─────────────────────────────────────────────────────────────────┐
│                    不受信任區域                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  WhatsApp   │  │  Telegram   │  │   Discord   │  ...         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 信任邊界 1：通道存取                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      閘道                                  │   │
│  │  • 裝置配對（30 秒寬限期）                                │   │
│  │  • AllowFrom / AllowList 驗證                             │   │
│  │  • Token / 密碼 / Tailscale 驗證                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 信任邊界 2：工作階段隔離                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   代理工作階段                            │
│  │  • 工作階段金鑰 = agent:channel:peer                     │
│  │  • 每個代理的工具政策                                    │
│  │  • 對話記錄記錄                                          │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 信任邊界 3：工具執行                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  執行沙箱                                │   │
│  │  • Docker 沙箱或主機（exec-approvals）                  │   │
│  │  • 節點遠端執行                                          │   │
│  │  • SSRF 防護（DNS 釘選 + IP 阻擋）                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 信任邊界 4：外部內容                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              擷取的 URL / 電子郵件 / Webhook              │   │
│  │  • 外部內容包裝（XML 標籤）                              │   │
│  │  • 安全性通知注入                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 信任邊界 5：供應鏈                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      CLAWHUB                              │   │
│  │  • 技能發佈（semver，需提供 SKILL.md）                   │   │
│  │  • 以模式為基礎的審核旗標                                │   │
│  │  • VirusTotal 掃描（即將推出）                          │   │
│  │  • GitHub 帳號年齡驗證                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 資料流

| 流程 | 來源      | 目的地 | 資料                                | 保護機制          |
| -- | ------- | --- | --------------------------------- | ------------- |
| F1 | 通道      | 閘道  | 使用者訊息                             | TLS、AllowFrom |
| F2 | 閘道      | 代理  | 路由訊息                              | 工作階段隔離        |
| F3 | 代理      | 工具  | 工具呼叫                              | 政策強制執行        |
| F4 | 代理      | 外部  | web_fetch 請求 | SSRF 阻擋       |
| F5 | ClawHub | 代理  | 技能程式碼                             | 審核、掃描         |
| F6 | 代理      | 通道  | 回應                                | 輸出過濾          |

---

## 3. 依 ATLAS 戰術進行威脅分析

### 3.1 偵察（AML.TA0002）

#### T-RECON-001：代理端點探索

| 屬性                            | 值                                |
| ----------------------------- | -------------------------------- |
| **ATLAS ID**                  | AML.T0006 - 主動掃描 |
| 攻擊者掃描暴露的 OpenClaw 閘道端點        | **攻擊向量**                         |
| 網路掃描、Shodan 查詢、DNS 枚舉         | **受影響的元件**                       |
| 閘道、暴露的 API 端點                 | **目前的緩解措施**                      |
| Tailscale 驗證選項，預設綁定至 loopback | **殘餘風險**                         |
| 中等 - 公開閘道可被發現                 | **建議**                           |
| 文件化安全部署，於發現端點加入速率限制           | T-RECON-002：通道整合探測               |

#### 屬性

| 值                                | 值                                                    |
| -------------------------------- | ---------------------------------------------------- |
| AML.T0006 - 主動掃描 | **描述**                                               |
| 攻擊者探測訊息通道以識別由 AI 管理的帳號           | **攻擊向量**                                             |
| 傳送測試訊息，觀察回應模式                    | **受影響的元件**                                           |
| 所有通道整合                           | **目前的緩解措施**                                          |
| 無特定措施                            | **殘餘風險**                                             |
| 低 - 僅靠發現本身價值有限                   | **建議**                                               |
| 考慮隨機化回應時間                        | 3.2 初始存取（AML.TA0004） |

---

### T-ACCESS-001：配對碼攔截

#### 屬性

| 值                   | **ATLAS ID**                                              |
| ------------------- | --------------------------------------------------------- |
| **ATLAS ID**        | AML.T0040 - AI Model Inference API Access |
| 攻擊者在 30 秒寬限期間內攔截配對碼 | **攻擊向量**                                                  |
| 肩窺、網路封包嗅探、社交工程      | **受影響的元件**                                                |
| 裝置配對系統              | **目前的緩解措施**                                               |
| 30 秒過期，透過既有通道傳送代碼   | **殘餘風險**                                                  |
| 中等 - 寬限期間可被利用       | **建議**                                                    |
| 縮短寬限期間，加入確認步驟       | T-ACCESS-002：AllowFrom 偽造                                 |

#### 屬性

| 值                       | Value                                                                          |
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

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **Recommendations**     | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Recommendations**     | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | Value                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **Recommendations**     | Implement command normalization, expand blocklist          |

---

### 1. 3.4 持久化（AML.TA0006）

#### T-PERSIST-001: Malicious Skill Installation

| 3. 屬性           | Value                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 5. **ATLAS ID** | AML.T0010.001 - Supply Chain Compromise: AI Software |
| 7. **描述**       | 8. 攻擊者將惡意技能發布到 ClawHub                                                        |
| 9. **攻擊向量**     | 10. 建立帳號，發布包含隱藏惡意程式碼的技能                                                       |
| 11. **受影響的元件**  | 12. ClawHub、技能載入、代理執行                                                         |
| 13. **目前的緩解措施** | 14. GitHub 帳號年齡驗證、基於模式的內容審核標記                                                 |
| 15. **殘餘風險**    | 16. 嚴重 - 無沙箱機制、審查有限                                                           |
| 17. **建議**      | 18. VirusTotal 整合（進行中）、技能沙箱化、社群審查                                             |

#### 19. T-PERSIST-002：技能更新投毒

| 20. 屬性           | 21. 值                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| 22. **ATLAS ID** | 23. AML.T0010.001 - 供應鏈入侵：AI 軟體 |
| 24. **描述**       | 25. 攻擊者入侵熱門技能並推送惡意更新                                            |
| 26. **攻擊向量**     | 27. 帳號入侵、對技能擁有者的社交工程                                            |
| 28. **受影響的元件**   | 29. ClawHub 版本管理、自動更新流程                                         |
| 30. **目前的緩解措施**  | 31. 版本指紋識別                                                      |
| 32. **殘餘風險**     | 33. 高 - 自動更新可能拉取惡意版本                                            |
| 34. **建議**       | 35. 實作更新簽章、回滾機制、版本鎖定                                            |

#### 36. T-PERSIST-003：代理設定竄改

| 37. 屬性           | 38. 值                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| 39. **ATLAS ID** | 40. AML.T0010.002 - 供應鏈入侵：資料 |
| 41. **描述**       | 42. 攻擊者修改代理設定以持續存取                                           |
| 43. **攻擊向量**     | 44. 設定檔修改、設定注入                                               |
| 45. **受影響的元件**   | 46. 代理設定、工具政策                                                |
| 47. **目前的緩解措施**  | 48. 檔案權限                                                     |
| 49. **殘餘風險**     | 50. 中等 - 需要本地存取權限                                            |
| **Recommendations**                     | Config integrity verification, audit logging for config changes                     |

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

| Attribute                           | Value                                                     |
| ----------------------------------- | --------------------------------------------------------- |
| **ATLAS ID**                        | AML.T0040 - AI Model Inference API Access |
| **Description**                     | Attacker enumerates available tools through prompting     |
| **Attack Vector**                   | "What tools do you have?" style queries                   |
| **Affected Components**             | Agent tool registry                                       |
| **Current Mitigations**             | **殘餘風險**                                                  |
| 19. **殘餘風險** | Low - Tools generally documented                          |
| **Recommendations**                 | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker extracts sensitive data from session context     |
| **Attack Vector**       | "What did we discuss?" queries, context probing           |
| **Affected Components** | Session transcripts, context window                       |
| **Current Mitigations** | Session isolation per sender                              |
| **Residual Risk**       | Medium - Within-session data accessible                   |
| **Recommendations**     | Implement sensitive data redaction in context             |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Data Theft via web_fetch

| Attribute               | Value                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                 |
| **Description**         | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**       | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components** | web_fetch tool                                    |
| **Current Mitigations** | SSRF blocking for internal networks                                    |
| **Residual Risk**       | High - External URLs permitted                                         |
| **Recommendations**     | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute                          | Value                                                            |
| ---------------------------------- | ---------------------------------------------------------------- |
| **ATLAS ID**                       | AML.T0009 - Collection                           |
| **Description**                    | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**                  | Prompt injection causing agent to message attacker               |
| **Affected Components**            | Message tool, channel integrations                               |
| **Current Mitigations**            | 1. 外向訊息管控                                 |
| 2. **殘餘風險** | Medium - Gating may be bypassed                                  |
| 4. **建議**   | Require explicit confirmation for new recipients                 |

#### 6. T-EXFIL-003：憑證蒐集

| 7. 屬性           | 21. 值                              |
| -------------------------------------- | --------------------------------------------------------- |
| **ATLAS ID**                           | 10. AML.T0009 - 蒐集 |
| 11. **描述**      | 12. 惡意技能會從代理上下文中蒐集憑證               |
| 13. **攻擊向量**    | 14. 技能程式碼讀取環境變數、設定檔                |
| 15. **受影響的元件**  | 16. 技能執行環境                         |
| 35. **目前的緩解措施** | None specific to skills                                   |
| 19. **殘餘風險**    | 20. 嚴重 - 技能以代理權限執行                 |
| 21. **建議**      | 22. 技能沙箱化、憑證隔離                     |

---

### 23. 3.8 影響（AML.TA0011）

#### 24. T-IMPACT-001：未授權的命令執行

| 25. 屬性           | 26. 值                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| 27. **ATLAS ID** | 28. AML.T0031 - 侵蝕 AI 模型完整性 |
| 29. **描述**       | 30. 攻擊者在使用者系統上執行任意命令                        |
| 31. **攻擊向量**     | 32. 提示注入結合 exec 核准繞過                        |
| 33. **受影響的元件**   | 34. Bash 工具、命令執行                            |
| 35. **目前的緩解措施**  | 36. Exec 核准、Docker 沙箱選項                     |
| 37. **殘餘風險**     | 38. 嚴重 - 未使用沙箱即在主機上執行                       |
| 39. **建議**       | 40. 預設使用沙箱，改善核准使用者體驗                        |

#### 41. T-IMPACT-002：資源耗盡（DoS）

| 42. 屬性           | 43. 值                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| 44. **ATLAS ID** | 45. AML.T0031 - 侵蝕 AI 模型完整性 |
| 46. **描述**       | 47. 攻擊者耗盡 API 點數或運算資源                       |
| 48. **攻擊向量**     | 49. 自動化訊息洪流、昂貴的工具呼叫                         |
| 50. **受影響的元件**   | Gateway, agent sessions, API provider                              |
| **Current Mitigations**                 | None                                                               |
| **Residual Risk**                       | High - No rate limiting                                            |
| **Recommendations**                     | Implement per-sender rate limits, cost budgets                     |

#### T-IMPACT-003: Reputation Damage

| Attribute               | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity    |
| **Description**         | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**       | Prompt injection causing inappropriate responses        |
| **Affected Components** | Output generation, channel messaging                    |
| **Current Mitigations** | LLM provider content policies                           |
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
| Pattern Moderation                | FLAG_RULES in moderation.ts | Low - Easily bypassed                                |
| Moderation Status                 | `moderationStatus` field                                         | Medium - Manual review possible                      |

### 4.2 Moderation Flag Patterns

Current patterns in `moderation.ts`:

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

**Limitations:**

- Only checks slug, displayName, summary, frontmatter, metadata, file paths
- Does not analyze actual skill code content
- Simple regex easily bypassed with obfuscation
- No behavioral analysis

### 4.3 Planned Improvements

| Improvement            | Status                                                   | Impact                                                                |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| VirusTotal Integration | In Progress                                              | High - Code Insight behavioral analysis                               |
| Community Reporting    | Partial (`skillReports` table exists) | Medium                                                                |
| Audit Logging          | Partial (`auditLogs` table exists)    | Medium                                                                |
| Badge System           | Implemented                                              | Medium - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. Risk Matrix

### 5.1 Likelihood vs Impact

| Threat ID     | Likelihood | Impact   | Risk Level                      | Priority |
| ------------- | ---------- | -------- | ------------------------------- | -------- |
| T-EXEC-001    | High       | Critical | **Critical**                    | P0       |
| T-PERSIST-001 | High       | Critical | **Critical**                    | P0       |
| T-EXFIL-003   | Medium     | Critical | **Critical**                    | P0       |
| T-IMPACT-001  | Medium     | Critical | **High**                        | P1       |
| T-EXEC-002    | High       | High     | **High**                        | P1       |
| T-EXEC-004    | Medium     | High     | **High**                        | P1       |
| T-ACCESS-003  | Medium     | High     | 7. **高** | P1       |
| T-EXFIL-001   | Medium     | High     | **High**                        | P1       |
| T-IMPACT-002  | High       | Medium   | **High**                        | P1       |
| T-EVADE-001   | High       | Medium   | **Medium**                      | P2       |
| T-ACCESS-001  | Low        | High     | **Medium**                      | P2       |
| T-ACCESS-002  | Low        | High     | **Medium**                      | P2       |
| T-PERSIST-002 | Low        | High     | **Medium**                      | P2       |

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
| R-010 | Add update signing and version pinning                | T-PERSIST-002 |

---

## 7. Appendices

### 7.1 ATLAS Technique Mapping

| ATLAS ID                                      | Technique Name                                 | OpenClaw Threats                                                 |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | Active Scanning                                | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | Collection                                     | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | Supply Chain: AI Software      | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | Supply Chain: Data             | T-PERSIST-003                                                    |
| AML.T0031                     | Erode AI Model Integrity                       | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI Model Inference API Access                  | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | Craft Adversarial Data                         | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM Prompt Injection: Direct   | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM Prompt Injection: Indirect | T-EXEC-002                                                       |

### 7.2 Key Security Files

| Path                                                          | Purpose                                | Risk Level                       |
| ------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| `src/infra/exec-approvals.ts`                                 | Command approval logic                 | **Critical**                     |
| `src/gateway/auth.ts`                                         | Gateway authentication                 | **Critical**                     |
| `src/web/inbound/access-control.ts`                           | Channel access control                 | **Critical**                     |
| `src/infra/net/ssrf.ts`                                       | SSRF protection                        | **Critical**                     |
| `src/security/external-content.ts`                            | Prompt injection mitigation            | 1. **嚴重** |
| 2. `src/agents/sandbox/tool-policy.ts` | 3. 工具政策強制執行     | 4. **嚴重** |
| 5. `convex/lib/moderation.ts`          | 6. ClawHub 內容審核 | 7. **高**  |
| 8. `convex/lib/skillPublish.ts`        | 9. 技能發布流程       | 10. **高** |
| 11. `src/routing/resolve-route.ts`     | 12. 工作階段隔離      | 13. **中** |

### 14. 7.3 詞彙表

| 15. 術語                   | 16. 定義                                     |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| 17. **ATLAS**            | 18. MITRE 的 AI 系統對抗性威脅版圖                   |
| 19. **ClawHub**          | 20. OpenClaw 的技能市集                         |
| 21. **Gateway**          | 22. OpenClaw 的訊息路由與驗證層                     |
| 23. **MCP**              | 24. 模型情境協定（Model Context Protocol）－工具提供者介面 |
| 25. **Prompt Injection** | 26. 將惡意指令嵌入輸入中的攻擊                          |
| 27. **Skill**            | 28. OpenClaw 代理的可下載擴充                      |
| 29. **SSRF**             | 30. 伺服器端請求偽造                               |

---

31. _此威脅模型是一份持續更新的文件。_ 32. 將安全問題回報至 security@openclaw.ai_
