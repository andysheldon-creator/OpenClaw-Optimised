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

## 8. 1. Introduction

### 1.1 Purpose

This threat model documents adversarial threats to the OpenClaw AI agent platform and ClawHub skill marketplace, using the MITRE ATLAS framework designed specifically for AI/ML systems.

### 1.2 Scope

| Thành phần             | Included | Notes                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | Có       | Core agent execution, tool calls, sessions                       |
| Gateway                | Có       | Authentication, routing, channel integration                     |
| Channel Integrations   | Có       | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | Có       | Skill publishing, moderation, distribution                       |
| MCP Servers            | Có       | External tool providers                                          |
| User Devices           | Partial  | Mobile apps, desktop clients                                     |

### 1.3 Out of Scope

Nothing is explicitly out of scope for this threat model.

---

## 7. 2. System Architecture

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

| Flow | Source  | Destination | Data                                   | Protection          |
| ---- | ------- | ----------- | -------------------------------------- | ------------------- |
| F1   | Kênh    | Gateway     | Tin nhắn người dùng                    | TLS, AllowFrom      |
| F2   | Gateway | Agent       | Tin nhắn được định tuyến               | Cách ly phiên       |
| F3   | Agent   | Tools       | Lời gọi công cụ                        | Thực thi chính sách |
| F4   | Agent   | Bên ngoài   | Yêu cầu web_fetch | Chặn SSRF           |
| F5   | ClawHub | Agent       | Mã kỹ năng                             | Kiểm duyệt, quét    |
| F6   | Agent   | Kênh        | Phản hồi                               | Lọc đầu ra          |

---

## 38. 3. Phân tích mối đe dọa theo chiến thuật ATLAS

### 3.1 Trinh sát (AML.TA0002)

#### T-RECON-001: Khám phá điểm cuối Agent

| Thuộc tính                        | Giá trị                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------- |
| **ATLAS ID**                      | AML.T0006 - Quét chủ động                                         |
| **Mô tả**                         | Kẻ tấn công quét các điểm cuối cổng OpenClaw bị lộ                                |
| **Vector tấn công**               | Quét mạng, truy vấn Shodan, liệt kê DNS                                           |
| **Thành phần bị ảnh hưởng**       | Cổng, các điểm cuối API bị lộ                                                     |
| **Biện pháp giảm thiểu hiện tại** | Tùy chọn xác thực Tailscale, mặc định chỉ bind vào loopback                       |
| **Rủi ro còn lại**                | Trung bình - Các cổng công khai có thể bị phát hiện                               |
| **Khuyến nghị**                   | Tài liệu hóa triển khai an toàn, thêm giới hạn tốc độ trên các điểm cuối khám phá |

#### T-RECON-002: Thăm dò tích hợp kênh

| Thuộc tính              | Giá trị                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0006 - Quét chủ động                                     |
| **Mô tả**               | Kẻ tấn công thăm dò các kênh nhắn tin để xác định các tài khoản do AI quản lý |
| **Vector tấn công**     | Gửi tin nhắn thử nghiệm, quan sát các mẫu phản hồi                            |
| **Affected Components** | All channel integrations                                                      |
| **Current Mitigations** | None specific                                                                 |
| **Residual Risk**       | Low - Limited value from discovery alone                                      |
| **Khuyến nghị**         | Consider response timing randomization                                        |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute               | Giá trị                                                   |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**       | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components** | Device pairing system                                     |
| **Current Mitigations** | 30s expiry, codes sent via existing channel               |
| **Residual Risk**       | Medium - Grace period exploitable                         |
| **Khuyến nghị**         | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute               | Giá trị                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **Khuyến nghị**         | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute               | Giá trị                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                |
| **Description**         | Attacker steals authentication tokens from config files                  |
| **Attack Vector**       | Malware, unauthorized device access, config backup exposure              |
| **Affected Components** | ~/.openclaw/credentials/, config storage |
| **Current Mitigations** | Quyền tệp                                                                |
| **Residual Risk**       | High - Tokens stored in plaintext                                        |
| **Khuyến nghị**         | Implement token encryption at rest, add token rotation                   |

---

### 3.3 Execution (AML.TA0005)

#### T-EXEC-001: Direct Prompt Injection

| Attribute               | Giá trị                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker sends crafted prompts to manipulate agent behavior                                  |
| **Attack Vector**       | Channel messages containing adversarial instructions                                         |
| **Affected Components** | Agent LLM, all input surfaces                                                                |
| **Current Mitigations** | Pattern detection, external content wrapping                                                 |
| **Residual Risk**       | Critical - Detection only, no blocking; sophisticated attacks bypass                         |
| **Khuyến nghị**         | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Giá trị                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **Khuyến nghị**         | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Giá trị                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Khuyến nghị**         | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute                                             | Giá trị                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. **ATLAS ID**                | 2. AML.T0043 - Tạo dữ liệu đối nghịch             |
| 3. **Mô tả**                   | 4. Kẻ tấn công tạo các lệnh vượt qua danh sách cho phép phê duyệt |
| 5. **Vector tấn công**         | 6. Làm rối lệnh, khai thác bí danh, thao túng đường dẫn           |
| 7. **Thành phần bị ảnh hưởng** | 8. exec-approvals.ts, danh sách cho phép lệnh     |
| **Current Mitigations**                               | Allowlist + ask mode                                                                     |
| 11. **Rủi ro còn lại**         | 12. Cao - Không có chuẩn hóa lệnh                                 |
| **Khuyến nghị**                                       | 13. Triển khai chuẩn hóa lệnh, mở rộng danh sách chặn             |

---

### 14. 3.4 Duy trì (AML.TA0006)

#### 15. T-PERSIST-001: Cài đặt kỹ năng độc hại

| 16. Thuộc tính                        | Giá trị                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **ATLAS ID**                                                 | AML.T0010.001 - Supply Chain Compromise: AI Software                    |
| 19. **Mô tả**                         | 20. Kẻ tấn công phát hành kỹ năng độc hại lên ClawHub                                            |
| 21. **Vector tấn công**               | 22. Tạo tài khoản, phát hành kỹ năng có mã độc ẩn                                                |
| **Affected Components**                                      | ClawHub, skill loading, agent execution                                                                                 |
| 25. **Biện pháp giảm thiểu hiện tại** | 26. Xác minh tuổi tài khoản GitHub, cờ kiểm duyệt dựa trên mẫu                                   |
| 27. **Rủi ro còn lại**                | 28. Nghiêm trọng - Không có sandboxing, kiểm duyệt hạn chế                                       |
| **Khuyến nghị**                                              | 29. Tích hợp VirusTotal (đang tiến hành), sandbox kỹ năng, đánh giá cộng đồng |

#### 30. T-PERSIST-002: Đầu độc cập nhật kỹ năng

| 31. Thuộc tính                        | Giá trị                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 32. **ATLAS ID**                      | 33. AML.T0010.001 - Xâm phạm chuỗi cung ứng: Phần mềm AI |
| 34. **Mô tả**                         | 35. Kẻ tấn công xâm nhập kỹ năng phổ biến và đẩy bản cập nhật độc hại                                    |
| 36. **Vector tấn công**               | 37. Xâm phạm tài khoản, kỹ nghệ xã hội đối với chủ sở hữu kỹ năng                                        |
| 38. **Thành phần bị ảnh hưởng**       | 39. Phiên bản hóa ClawHub, luồng tự động cập nhật                                                        |
| 40. **Biện pháp giảm thiểu hiện tại** | 41. Lấy dấu vân tay phiên bản                                                                            |
| 42. **Rủi ro còn lại**                | 43. Cao - Tự động cập nhật có thể tải về phiên bản độc hại                                               |
| **Khuyến nghị**                                              | 44. Triển khai ký cập nhật, khả năng hoàn nguyên, ghim phiên bản                                         |

#### 45. T-PERSIST-003: Can thiệp cấu hình tác nhân

| 46. Thuộc tính   | Giá trị                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 47. **ATLAS ID** | 48. AML.T0010.002 - Xâm phạm chuỗi cung ứng: Dữ liệu |
| 49. **Mô tả**    | 50. Kẻ tấn công sửa đổi cấu hình tác nhân để duy trì quyền truy cập                                  |
| **Attack Vector**                       | Config file modification, settings injection                                                                                |
| **Affected Components**                 | Agent config, tool policies                                                                                                 |
| **Current Mitigations**                 | Quyền tệp                                                                                                                   |
| **Residual Risk**                       | Medium - Requires local access                                                                                              |
| **Khuyến nghị**                         | Config integrity verification, audit logging for config changes                                                             |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute               | Giá trị                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data                                        |
| **Description**         | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**       | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components** | ClawHub moderation.ts                                                     |
| **Current Mitigations** | Pattern-based FLAG_RULES                                             |
| **Residual Risk**       | High - Simple regex easily bypassed                                                       |
| **Khuyến nghị**         | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | Giá trị                                                   |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **Khuyến nghị**         | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute               | Giá trị                                                   |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker enumerates available tools through prompting     |
| **Attack Vector**       | "What tools do you have?" style queries                   |
| **Affected Components** | Agent tool registry                                       |
| **Current Mitigations** | None specific                                             |
| **Residual Risk**       | Low - Tools generally documented                          |
| **Khuyến nghị**         | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute               | Giá trị                                                   |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker extracts sensitive data from session context     |
| **Attack Vector**       | "What did we discuss?" queries, context probing           |
| **Affected Components** | Session transcripts, context window                       |
| **Current Mitigations** | Session isolation per sender                              |
| **Residual Risk**       | Medium - Within-session data accessible                   |
| **Khuyến nghị**         | Implement sensitive data redaction in context             |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Data Theft via web_fetch

| Attribute               | Giá trị                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                 |
| **Description**         | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**       | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components** | web_fetch tool                                    |
| **Current Mitigations** | SSRF blocking for internal networks                                    |
| **Residual Risk**       | High - External URLs permitted                                         |
| **Khuyến nghị**         | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute               | Giá trị                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                           |
| **Description**         | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**       | Prompt injection causing agent to message attacker               |
| **Affected Components** | Message tool, channel integrations                               |
| **Current Mitigations** | Outbound messaging gating                                        |
| **Residual Risk**       | Medium - Gating may be bypassed                                  |
| **Khuyến nghị**         | Require explicit confirmation for new recipients                 |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | Giá trị                                                 |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **Khuyến nghị**         | Skill sandboxing, credential isolation                  |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001: Unauthorized Command Execution

| Attribute               | Giá trị                                              |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker executes arbitrary commands on user system  |
| **Attack Vector**       | Prompt injection combined with exec approval bypass  |
| **Affected Components** | Bash tool, command execution                         |
| **Current Mitigations** | Exec approvals, Docker sandbox option                |
| **Residual Risk**       | Critical - Host execution without sandbox            |
| **Khuyến nghị**         | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | Giá trị                                              |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **Khuyến nghị**         | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute                         | Giá trị                                                               |
| --------------------------------- | --------------------------------------------------------------------- |
| **ATLAS ID**                      | AML.T0031 - Làm suy giảm tính toàn vẹn của mô hình AI |
| **Description**                   | Attacker causes agent to send harmful/offensive content               |
| **Vector tấn công**               | Prompt injection gây ra phản hồi không phù hợp                        |
| **Thành phần bị ảnh hưởng**       | Tạo đầu ra, nhắn tin qua kênh                                         |
| **Biện pháp giảm thiểu hiện tại** | Chính sách nội dung của nhà cung cấp LLM                              |
| **Rủi ro còn lại**                | Trung bình - Bộ lọc của nhà cung cấp chưa hoàn hảo                    |
| **Khuyến nghị**                   | Lớp lọc đầu ra, kiểm soát người dùng                                  |

---

## 9. 4. Phân tích chuỗi cung ứng ClawHub

### 4.1 Current Security Controls

| Kiểm soát                        | Triển khai                                                          | Hiệu quả                                                        |
| -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tuổi tài khoản GitHub            | `requireGitHubAccountAge()`                                         | Trung bình - Nâng cao rào cản cho kẻ tấn công mới               |
| Chuẩn hóa đường dẫn              | `sanitizePath()`                                                    | Cao - Ngăn chặn path traversal                                  |
| Xác thực loại tệp                | `isTextFile()`                                                      | Trung bình - Chỉ cho phép tệp văn bản, nhưng vẫn có thể độc hại |
| Giới hạn kích thước              | Tổng gói 50MB                                                       | Cao - Ngăn chặn cạn kiệt tài nguyên                             |
| Yêu cầu SKILL.md | Readme bắt buộc                                                     | Giá trị bảo mật thấp - Chỉ mang tính thông tin                  |
| Điều tiết theo mẫu               | FLAG_RULES trong moderation.ts | Thấp - Dễ bị vượt qua                                           |
| Trạng thái điều tiết             | `moderationStatus` field                                            | Trung bình - Có thể xem xét thủ công                            |

### 4.2 Các mẫu cờ điều tiết

Các mẫu hiện tại trong `moderation.ts`:

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

**Hạn chế:**

- Chỉ kiểm tra slug, displayName, summary, frontmatter, metadata, đường dẫn tệp
- Không phân tích nội dung mã kỹ năng thực tế
- Regex đơn giản dễ bị vượt qua bằng cách làm rối
- Không có phân tích hành vi

### 4.3 Các cải tiến dự kiến

| Cải tiến            | Trạng thái                                               | Tác động                                                              |
| ------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Tích hợp VirusTotal | Đang triển khai                                          | High - Code Insight behavioral analysis                               |
| Community Reporting | Partial (`skillReports` table exists) | Medium                                                                |
| Audit Logging       | Partial (`auditLogs` table exists)    | Medium                                                                |
| Badge System        | Implemented                                              | Medium - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 40. 5. Risk Matrix

### 5.1 Likelihood vs Impact

| Threat ID     | Likelihood | Impact   | Risk Level   | Priority |
| ------------- | ---------- | -------- | ------------ | -------- |
| T-EXEC-001    | High       | Critical | **Critical** | P0       |
| T-PERSIST-001 | High       | Critical | **Critical** | P0       |
| T-EXFIL-003   | Medium     | Critical | **Critical** | P0       |
| T-IMPACT-001  | Medium     | Critical | **High**     | P1       |
| T-EXEC-002    | High       | High     | **High**     | P1       |
| T-EXEC-004    | Medium     | High     | **High**     | P1       |
| T-ACCESS-003  | Medium     | High     | **High**     | P1       |
| T-EXFIL-001   | Medium     | High     | **High**     | P1       |
| T-IMPACT-002  | High       | Medium   | **High**     | P1       |
| T-EVADE-001   | High       | Medium   | **Medium**   | P2       |
| T-ACCESS-001  | Low        | High     | **Medium**   | P2       |
| T-ACCESS-002  | Low        | High     | **Medium**   | P2       |
| T-PERSIST-002 | Low        | High     | **Medium**   | P2       |

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

| ATLAS ID                                      | Technique Name                               | OpenClaw Threats                                                 |
| --------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | Active Scanning                              | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | Collection                                   | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | Supply Chain: AI Software    | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | Supply Chain: Data           | T-PERSIST-003                                                    |
| AML.T0031                     | Làm xói mòn tính toàn vẹn của mô hình AI     | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | Truy cập API suy luận mô hình AI             | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | Tạo dữ liệu đối nghịch                       | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | Tiêm lời nhắc LLM: Trực tiếp | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | Tiêm lời nhắc LLM: Gián tiếp | T-EXEC-002                                                       |

### 7.2 Các tệp bảo mật then chốt

| dung lượng lưu trữ của bạn, không phải mô hình. | Mục đích                    | Mức độ rủi ro    |
| --------------------------------------------------------------- | --------------------------- | ---------------- |
| `src/infra/exec-approvals.ts`                                   | Logic phê duyệt lệnh        | **Nghiêm trọng** |
| `src/gateway/auth.ts`                                           | Xác thực cổng               | **Nghiêm trọng** |
| `src/web/inbound/access-control.ts`                             | Kiểm soát truy cập kênh     | **Nghiêm trọng** |
| `src/infra/net/ssrf.ts`                                         | Bảo vệ SSRF                 | **Nghiêm trọng** |
| `src/security/external-content.ts`                              | Giảm thiểu tiêm lời nhắc    | **Nghiêm trọng** |
| `src/agents/sandbox/tool-policy.ts`                             | Thực thi chính sách công cụ | **Critical**     |
| `convex/lib/moderation.ts`                                      | Kiểm duyệt ClawHub          | **Cao**          |
| `convex/lib/skillPublish.ts`                                    | Quy trình phát hành kỹ năng | **Cao**          |
| `src/routing/resolve-route.ts`                                  | Cách ly phiên               | **Trung bình**   |

### 7.3 Thuật ngữ

| Thuật ngữ            | Định nghĩa                                                   |
| -------------------- | ------------------------------------------------------------ |
| **ATLAS**            | Bản đồ mối đe dọa đối nghịch cho hệ thống AI của MITRE       |
| **ClawHub**          | Chợ kỹ năng của OpenClaw                                     |
| **Gateway**          | Lớp định tuyến thông điệp và xác thực của OpenClaw           |
| **MCP**              | Giao thức Ngữ cảnh Mô hình - giao diện nhà cung cấp công cụ  |
| **Prompt Injection** | Tấn công trong đó các chỉ dẫn độc hại được nhúng vào đầu vào |
| **Skill**            | Downloadable extension for OpenClaw agents                   |
| **SSRF**             | Giả mạo yêu cầu phía máy chủ                                 |

---

_Mô hình mối đe dọa này là một tài liệu luôn được cập nhật._ Báo cáo các vấn đề bảo mật tới security@openclaw.ai_
