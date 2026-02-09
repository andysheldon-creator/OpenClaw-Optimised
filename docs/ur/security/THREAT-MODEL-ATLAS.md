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

| جزو                    | Included | Notes                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | ہاں      | Core agent execution, tool calls, sessions                       |
| Gateway                | ہاں      | Authentication, routing, channel integration                     |
| Channel Integrations   | ہاں      | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | ہاں      | Skill publishing, moderation, distribution                       |
| MCP Servers            | ہاں      | External tool providers                                          |
| User Devices           | Partial  | Mobile apps, desktop clients                                     |

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

| Flow | Source  | Destination | Data                                     | Protection       |
| ---- | ------- | ----------- | ---------------------------------------- | ---------------- |
| F1   | چینل    | Gateway     | صارف پیغامات                             | TLS، AllowFrom   |
| F2   | Gateway | Agent       | Routed messages                          | سیشن آئسولیشن    |
| F3   | ایجنٹ   | اوزار       | ٹول انووکیشنز                            | پالیسی نافذ کرنا |
| F4   | Agent   | بیرونی      | web_fetch درخواستیں | SSRF بلاکنگ      |
| F5   | ClawHub | Agent       | اسکل کوڈ                                 | موڈریشن، اسکیننگ |
| F6   | ایجنٹ   | چینل        | Responses                                | آؤٹ پٹ فلٹرنگ    |

---

## 3. ATLAS ٹیکٹک کے مطابق خطرے کا تجزیہ

### 3.1 ریکانائسنس (AML.TA0002)

#### T-RECON-001: ایجنٹ اینڈپوائنٹ کی دریافت

| وصف                       | Value                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0006 - فعال اسکیننگ                                   |
| **تفصیل**                 | حملہ آور بے نقاب OpenClaw گیٹ وے اینڈپوائنٹس کے لیے اسکین کرتا ہے          |
| **حملے کا طریقہ**         | نیٹ ورک اسکیننگ، shodan کوئریز، DNS اینیومریشن                             |
| **متاثرہ اجزاء**          | گیٹ وے، بے نقاب API اینڈپوائنٹس                                            |
| **موجودہ تخفیفی اقدامات** | Tailscale کی تصدیقی آپشن، بطورِ ڈیفالٹ لوپ بیک سے بائنڈ                    |
| **باقی ماندہ خطرہ**       | درمیانہ - عوامی گیٹ ویز قابلِ دریافت                                       |
| **سفارشات**               | محفوظ تعیناتی کی دستاویز بنائیں، ڈسکوری اینڈپوائنٹس پر ریٹ لمٹنگ شامل کریں |

#### T-RECON-002: چینل انٹیگریشن کی جانچ

| وصف                     | Value                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0006 - فعال اسکیننگ                                        |
| **تفصیل**               | حملہ آور AI کے زیرِ انتظام اکاؤنٹس کی شناخت کے لیے میسجنگ چینلز کی جانچ کرتا ہے |
| **حملے کا طریقہ**       | آزمائشی پیغامات بھیجنا، جوابی پیٹرنز کا مشاہدہ                                  |
| **Affected Components** | All channel integrations                                                        |
| **Current Mitigations** | None specific                                                                   |
| **Residual Risk**       | Low - Limited value from discovery alone                                        |
| **سفارشات**             | Consider response timing randomization                                          |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**       | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components** | Device pairing system                                     |
| **Current Mitigations** | 30s expiry, codes sent via existing channel               |
| **Residual Risk**       | Medium - Grace period exploitable                         |
| **سفارشات**             | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute               | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **سفارشات**             | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute               | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                |
| **Description**         | Attacker steals authentication tokens from config files                  |
| **Attack Vector**       | Malware, unauthorized device access, config backup exposure              |
| **Affected Components** | ~/.openclaw/credentials/, config storage |
| **Current Mitigations** | فائل اجازتیں                                                             |
| **Residual Risk**       | High - Tokens stored in plaintext                                        |
| **سفارشات**             | Implement token encryption at rest, add token rotation                   |

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
| **سفارشات**             | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **سفارشات**             | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **سفارشات**             | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | Value                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **سفارشات**             | Implement command normalization, expand blocklist          |

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
| **سفارشات**             | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **سفارشات**             | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute                 | Value                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**           | Attacker modifies agent configuration to persist access                                       |
| **حملے کا ویکٹر**         | کنفیگ فائل میں ترمیم، سیٹنگز انجیکشن                                                          |
| **متاثرہ اجزاء**          | ایجنٹ کنفیگ، ٹول پالیسیاں                                                                     |
| **موجودہ تخفیفی اقدامات** | فائل اجازتیں                                                                                  |
| **بقایا خطرہ**            | درمیانی - مقامی رسائی درکار                                                                   |
| **سفارشات**               | کنفیگ کی سالمیت کی توثیق، کنفیگ تبدیلیوں کے لیے آڈٹ لاگنگ                                     |

---

### 3.5 دفاعی بچاؤ (AML.TA0007)

#### T-EVADE-001: ماڈریشن پیٹرن بائی پاس

| خصوصیت                    | Value                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0043 - مخالفانہ ڈیٹا تیار کرنا                                       |
| **تفصیل**                 | حملہ آور ماڈریشن پیٹرنز سے بچنے کے لیے اسکل مواد تیار کرتا ہے                             |
| **حملے کا ویکٹر**         | یونیکوڈ ہوموگلفس، انکوڈنگ ٹرکس، ڈائنامک لوڈنگ                                             |
| **متاثرہ اجزاء**          | ClawHub moderation.ts                                                     |
| **موجودہ تخفیفی اقدامات** | پیٹرن پر مبنی FLAG_RULES                                             |
| **بقایا خطرہ**            | زیادہ - سادہ ریجیکس آسانی سے بائی پاس ہو جاتا ہے                                          |
| **سفارشات**               | رویّاتی تجزیہ شامل کریں (VirusTotal Code Insight)، AST پر مبنی ڈیٹیکشن |

#### T-EVADE-002: کانٹینٹ ریپر ایسکیپ

| خصوصیت                    | Value                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0043 - مخالفانہ ڈیٹا تیار کرنا                         |
| **تفصیل**                 | حملہ آور ایسا مواد تیار کرتا ہے جو XML ریپر سیاق و سباق سے باہر نکل جاتا ہے |
| **حملے کا ویکٹر**         | ٹیگ میں ہیرا پھیری، سیاق و سباق میں ابہام، ہدایات کی اووررائیڈ              |
| **متاثرہ اجزاء**          | بیرونی مواد کی ریپنگ                                                        |
| **موجودہ تخفیفی اقدامات** | XML ٹیگز + سیکیورٹی نوٹس                                                    |
| **Residual Risk**         | درمیانی - نئے ایسکیپس باقاعدگی سے دریافت ہوتے ہیں                           |
| **سفارشات**               | متعدد ریپر لیئرز، آؤٹ پٹ سائیڈ ویلیڈیشن                                     |

---

### 3.6 دریافت (AML.TA0008)

#### T-DISC-001: ٹول اینومریشن

| خصوصیت                  | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI ماڈل انفرنس API تک رسائی  |
| **تفصیل**               | حملہ آور پرامپٹنگ کے ذریعے دستیاب ٹولز کی فہرست بناتا ہے |
| **حملے کا ویکٹر**       | "آپ کے پاس کون سے ٹولز ہیں؟" طرز کے سوالات               |
| **متاثرہ اجزاء**        | ایجنٹ ٹول رجسٹری                                         |
| **Current Mitigations** | None specific                                            |
| **Residual Risk**       | Low - Tools generally documented                         |
| **سفارشات**             | Consider tool visibility controls                        |

#### T-DISC-002: Session Data Extraction

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker extracts sensitive data from session context     |
| **Attack Vector**       | "What did we discuss?" queries, context probing           |
| **Affected Components** | Session transcripts, context window                       |
| **Current Mitigations** | Session isolation per sender                              |
| **Residual Risk**       | Medium - Within-session data accessible                   |
| **سفارشات**             | Implement sensitive data redaction in context             |

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
| **سفارشات**             | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute               | Value                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                  |
| **Description**         | Attacker causes agent to send messages containing sensitive data        |
| **Attack Vector**       | Prompt injection causing agent to message attacker                      |
| **Affected Components** | Message tool, channel integrations                                      |
| **Current Mitigations** | Outbound messaging gating                                               |
| **Residual Risk**       | Medium - Gating may be bypassed                                         |
| **سفارشات**             | 1. نئے وصول کنندگان کے لیے واضح تصدیق درکار کریں |

#### 2. T-EXFIL-003: اسناد کی چوری

| 3. وصف                        | Value                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 4. **ATLAS ID**               | 5. AML.T0009 - جمع آوری                           |
| 6. **تفصیل**                  | 7. بدنیتی پر مبنی اسکل ایجنٹ کے سیاق و سباق سے اسناد حاصل کرتا ہے |
| 8. **حملے کا طریقہ**          | 9. اسکل کوڈ ماحولیاتی متغیرات اور کنفیگ فائلیں پڑھتا ہے           |
| 10. **متاثرہ اجزاء**          | 11. اسکل کا عملدرآمدی ماحول                                       |
| 12. **موجودہ تخفیفی اقدامات** | 13. اسکلز کے لیے کوئی مخصوص اقدامات نہیں                          |
| 14. **باقی ماندہ خطرہ**       | 15. انتہائی سنگین - اسکلز ایجنٹ کی مراعات کے ساتھ چلتی ہیں        |
| **سفارشات**                                          | 16. اسکل سینڈباکسنگ، اسناد کی علیحدگی                             |

---

### 17. 3.8 اثر (AML.TA0011)

#### 18. T-IMPACT-001: غیر مجاز کمانڈ کا اجرا

| 19. وصف                       | Value                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 20. **ATLAS ID**              | 21. AML.T0031 - اے آئی ماڈل کی سالمیت کو نقصان پہنچانا |
| 22. **تفصیل**                 | 23. حملہ آور صارف کے سسٹم پر من مانے کمانڈز چلاتا ہے                   |
| 24. **حملے کا طریقہ**         | 25. پرامپٹ انجیکشن کے ساتھ exec منظوری کی بائی پاسنگ                   |
| **Affected Components**                              | 27. Bash ٹول، کمانڈ کا اجرا                                            |
| 28. **موجودہ تخفیفی اقدامات** | 29. exec منظوری، Docker سینڈباکس کا اختیار                             |
| 30. **باقی ماندہ خطرہ**       | 31. انتہائی سنگین - سینڈباکس کے بغیر میزبان پر اجرا                    |
| **سفارشات**                                          | 32. بطور ڈیفالٹ سینڈباکس، منظوری کے UX میں بہتری                       |

#### 33. T-IMPACT-002: وسائل کی حد سے زیادہ کھپت (DoS)

| 34. وصف                       | Value                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 35. **ATLAS ID**              | 36. AML.T0031 - اے آئی ماڈل کی سالمیت کو نقصان پہنچانا |
| 37. **تفصیل**                 | 38. حملہ آور API کریڈٹس یا کمپیوٹ وسائل ختم کر دیتا ہے                 |
| 39. **حملے کا طریقہ**         | Automated message flooding, expensive tool calls                                              |
| 41. **متاثرہ اجزاء**          | 42. گیٹ وے، ایجنٹ سیشنز، API فراہم کنندہ                               |
| 43. **موجودہ تخفیفی اقدامات** | 44. کوئی نہیں                                                          |
| 45. **باقی ماندہ خطرہ**       | 46. زیادہ - کوئی ریٹ لمٹنگ نہیں                                        |
| **سفارشات**                                          | 47. فی بھیجنے والے ریٹ لمٹس، لاگت کے بجٹس نافذ کریں                    |

#### 48. T-IMPACT-003: ساکھ کو نقصان

| 49. وصف          | Value                                                   |
| --------------------------------------- | ------------------------------------------------------- |
| 50. **ATLAS ID** | AML.T0031 - Erode AI Model Integrity    |
| **Description**                         | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**                       | Prompt injection causing inappropriate responses        |
| **Affected Components**                 | Output generation, channel messaging                    |
| **Current Mitigations**                 | LLM provider content policies                           |
| **Residual Risk**                       | Medium - Provider filters imperfect                     |
| **سفارشات**                             | Output filtering layer, user controls                   |

---

## 1. 4. ClawHub Supply Chain Analysis

### 4.1 Current Security Controls

| Control                           | عمل درآمد                                                        | Effectiveness                                        |
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

| Improvement            | اسٹیٹس                                                 | Impact                                                                 |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| VirusTotal Integration | In Progress                                            | اعلیٰ - کوڈ انسائٹ رویّاتی تجزیہ                                       |
| کمیونٹی رپورٹنگ        | جزوی (`skillReports` ٹیبل موجود ہے) | Medium                                                                 |
| Audit Logging          | جزوی (`auditLogs` ٹیبل موجود ہے)    | درمیانہ                                                                |
| Badge System           | Implemented                                            | درمیانہ - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. خطرے کا میٹرکس

### 5.1 امکان بمقابلہ اثر

| خطرہ ID       | امکان   | اثر           | خطرے کی سطح       | ترجیح |
| ------------- | ------- | ------------- | ----------------- | ----- |
| T-EXEC-001    | اعلیٰ   | انتہائی سنگین | **انتہائی سنگین** | P0    |
| T-PERSIST-001 | اعلیٰ   | انتہائی سنگین | **انتہائی سنگین** | P0    |
| T-EXFIL-003   | درمیانہ | انتہائی سنگین | **انتہائی سنگین** | P0    |
| T-IMPACT-001  | درمیانہ | انتہائی سنگین | **اعلیٰ**         | P1    |
| T-EXEC-002    | اعلیٰ   | اعلیٰ         | **اعلیٰ**         | P1    |
| T-EXEC-004    | درمیانہ | اعلیٰ         | **اعلیٰ**         | P1    |
| T-ACCESS-003  | درمیانہ | اعلیٰ         | **High**          | P1    |
| T-EXFIL-001   | Medium  | High          | **High**          | P1    |
| T-IMPACT-002  | High    | Medium        | **High**          | P1    |
| T-EVADE-001   | High    | Medium        | **Medium**        | P2    |
| T-ACCESS-001  | Low     | High          | **Medium**        | P2    |
| T-ACCESS-002  | Low     | High          | **Medium**        | P2    |
| T-PERSIST-002 | Low     | High          | **Medium**        | P2    |

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

| ID    | Recommendation                                   | Addresses                  |
| ----- | ------------------------------------------------ | -------------------------- |
| R-001 | Complete VirusTotal integration                  | T-PERSIST-001, T-EVADE-001 |
| R-002 | Implement skill sandboxing                       | T-PERSIST-001, T-EXFIL-003 |
| R-003 | حساس کارروائیوں کے لیے آؤٹ پٹ کی توثیق شامل کریں | T-EXEC-001, T-EXEC-002     |

### 6.2 قلیل مدتی (P1)

| شناخت | سفارش                                                          | حل کرتا ہے   |
| ----- | -------------------------------------------------------------- | ------------ |
| R-004 | ریٹ لمٹنگ نافذ کریں                                            | T-IMPACT-002 |
| R-005 | ٹوکَن کو محفوظ حالت میں انکرپشن کے ساتھ محفوظ کریں             | T-ACCESS-003 |
| R-006 | ایگزیک منظوری کے UX اور توثیق کو بہتر بنائیں                   | T-EXEC-004   |
| R-007 | web_fetch کے لیے URL الاؤ لسٹنگ نافذ کریں | T-EXFIL-001  |

### 6.3 درمیانی مدتی (P2)

| شناخت | سفارش                                           | حل کرتا ہے    |
| ----- | ----------------------------------------------- | ------------- |
| R-008 | جہاں ممکن ہو کرپٹوگرافک چینل کی توثیق شامل کریں | T-ACCESS-002  |
| R-009 | کنفیگریشن کی سالمیت کی توثیق نافذ کریں          | T-PERSIST-003 |
| R-010 | اپڈیٹ سائننگ اور ورژن پننگ شامل کریں            | T-PERSIST-002 |

---

## 7. ضمائم

### 7.1 ATLAS تکنیک میپنگ

| ATLAS شناخت                                   | تکنیک کا نام                                   | OpenClaw خطرات                                                   |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | فعال اسکیننگ                                   | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | جمع آوری                                       | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | سپلائی چین: AI سافٹ ویئر       | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | سپلائی چین: ڈیٹا               | T-PERSIST-003                                                    |
| AML.T0031                     | AI ماڈل کی سالمیت کو کمزور کرنا                | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI ماڈل انفرنس API تک رسائی                    | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | مخالفانہ ڈیٹا تیار کرنا                        | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM پرامپٹ انجیکشن: براہِ راست | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM پرامپٹ انجیکشن: بالواسطہ   | T-EXEC-002                                                       |

### 7.2 کلیدی سیکیورٹی فائلیں

| پاتھ                                | Purpose                    | خطرے کی سطح     |
| ----------------------------------- | -------------------------- | --------------- |
| `src/infra/exec-approvals.ts`       | Command approval logic     | **انتہائی اہم** |
| `src/gateway/auth.ts`               | گیٹ وے توثیق               | **انتہائی اہم** |
| `src/web/inbound/access-control.ts` | چینل تک رسائی کا کنٹرول    | **انتہائی اہم** |
| `src/infra/net/ssrf.ts`             | SSRF سے تحفظ               | **انتہائی اہم** |
| `src/security/external-content.ts`  | پرامپٹ انجیکشن کی روک تھام | **انتہائی اہم** |
| `src/agents/sandbox/tool-policy.ts` | ٹول پالیسی کا نفاذ         | **انتہائی اہم** |
| `convex/lib/moderation.ts`          | ClawHub اعتدال کاری        | **اعلیٰ**       |
| `convex/lib/skillPublish.ts`        | اسکل شائع کرنے کا بہاؤ     | **اعلیٰ**       |
| `src/routing/resolve-route.ts`      | سیشن کی علیحدگی            | **درمیانہ**     |

### 7.3 اصطلاحات

| اصطلاح               | تعریف                                                     |
| -------------------- | --------------------------------------------------------- |
| **ATLAS**            | MITRE کا AI نظاموں کے لیے مخالفانہ خطرات کا منظرنامہ      |
| **ClawHub**          | OpenClaw کی اسکل مارکیٹ پلیس                              |
| **Gateway**          | OpenClaw کی پیغام رسانی اور توثیق کی تہہ                  |
| **MCP**              | Model Context Protocol - tool provider interface          |
| **Prompt Injection** | Attack where malicious instructions are embedded in input |
| **Skill**            | Downloadable extension for OpenClaw agents                |
| **SSRF**             | Server-Side Request Forgery                               |

---

_This threat model is a living document. Report security issues to security@openclaw.ai_
