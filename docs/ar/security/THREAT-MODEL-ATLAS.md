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

| المكون                 | Included | الملاحظات                                                        |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | نعم      | Core agent execution, tool calls, sessions                       |
| Gateway                | نعم      | Authentication, routing, channel integration                     |
| Channel Integrations   | نعم      | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | نعم      | Skill publishing, moderation, distribution                       |
| MCP Servers            | نعم      | External tool providers                                          |
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

| Flow | Source  | Destination | Data                                    | Protection        |
| ---- | ------- | ----------- | --------------------------------------- | ----------------- |
| F1   | قناة    | Gateway     | رسائل المستخدم                          | TLS، AllowFrom    |
| F2   | Gateway | وكيل        | رسائل مُوجَّهة                          | Session isolation |
| F3   | وكيل    | الأدوات     | استدعاءات الأدوات                       | فرض السياسات      |
| F4   | وكيل    | خارجي       | web_fetch requests | حظر SSRF          |
| F5   | ClawHub | وكيل        | شفرة المهارة                            | الإشراف، الفحص    |
| F6   | وكيل    | قناة        | الاستجابات                              | تصفية المخرجات    |

---

## 3. تحليل التهديدات وفق تكتيك ATLAS

### 3.1 الاستطلاع (AML.TA0002)

#### T-RECON-001: اكتشاف نقاط نهاية الوكيل

| السمة                 | القيمة                                                        |
| --------------------- | ------------------------------------------------------------- |
| **معرّف ATLAS**       | AML.T0006 - المسح النشط                       |
| **الوصف**             | يقوم المهاجم بمسح نقاط نهاية بوابة OpenClaw المكشوفة          |
| **ناقل الهجوم**       | مسح الشبكة، استعلامات shodan، تعداد DNS                       |
| **المكونات المتأثرة** | البوابة، نقاط نهاية واجهة برمجة التطبيقات المكشوفة            |
| **التخفيفات الحالية** | خيار مصادقة Tailscale، الربط على loopback افتراضيًا           |
| **المخاطر المتبقية**  | متوسط - البوابات العامة قابلة للاكتشاف                        |
| **توصيات**            | توثيق النشر الآمن، إضافة تحديد المعدل على نقاط نهاية الاكتشاف |

#### T-RECON-002: استكشاف تكامل القنوات

| السمة                                            | القيمة                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| **معرّف ATLAS**                                  | AML.T0006 - المسح النشط                                         |
| **الوصف**                                        | يقوم المهاجم باستكشاف قنوات المراسلة لتحديد الحسابات المُدارة بالذكاء الاصطناعي |
| **ناقل الهجوم**                                  | إرسال رسائل اختبار، وملاحظة أنماط الاستجابة                                     |
| 1. **المكوّنات المتأثرة** | 2. جميع تكاملات القنوات                                  |
| **Current Mitigations**                          | 4. لا يوجد ما هو محدد                                    |
| 5. **المخاطر المتبقية**   | Low - Limited value from discovery alone                                        |
| **توصيات**                                       | 7. النظر في عشوائية توقيت الاستجابة                      |

---

### 8. 3.2 الوصول الأولي (AML.TA0004)

#### 9. T-ACCESS-001: اعتراض رمز الإقران

| 10. السمة                       | القيمة                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 11. **معرّف ATLAS**             | 12. AML.T0040 - الوصول إلى واجهة برمجة تطبيقات استدلال نموذج الذكاء الاصطناعي |
| 13. **الوصف**                   | 14. يعترض المهاجم رمز الإقران خلال فترة السماح البالغة 30 ثانية                               |
| 15. **ناقل الهجوم**             | 16. التلصص البصري، التنصت على الشبكة، الهندسة الاجتماعية                                      |
| 17. **المكوّنات المتأثرة**      | 18. نظام إقران الأجهزة                                                                        |
| 19. **إجراءات التخفيف الحالية** | 20. انتهاء الصلاحية خلال 30 ثانية، إرسال الرموز عبر قناة موجودة                               |
| 21. **المخاطر المتبقية**        | 22. متوسطة - فترة السماح قابلة للاستغلال                                                      |
| **توصيات**                                             | 23. تقليل فترة السماح، إضافة خطوة تأكيد                                                       |

#### 24. T-ACCESS-002: انتحال AllowFrom

| 25. السمة                       | القيمة                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 26. **معرّف ATLAS**             | 27. AML.T0040 - الوصول إلى واجهة برمجة تطبيقات استدلال نموذج الذكاء الاصطناعي |
| 28. **الوصف**                   | 29. يقوم المهاجم بانتحال هوية المُرسِل المسموح به في القناة                                   |
| 30. **ناقل الهجوم**             | 31. يعتمد على القناة - انتحال رقم الهاتف، انتحال اسم المستخدم                                 |
| 32. **المكوّنات المتأثرة**      | 33. التحقق من AllowFrom لكل قناة                                                              |
| 34. **إجراءات التخفيف الحالية** | 35. التحقق من الهوية الخاص بكل قناة                                                           |
| 36. **المخاطر المتبقية**        | 37. متوسطة - بعض القنوات عرضة للانتحال                                                        |
| **توصيات**                                             | 38. توثيق المخاطر الخاصة بكل قناة، إضافة تحقق تشفيري حيثما أمكن                               |

#### 39. T-ACCESS-003: سرقة الرموز المميِّزة

| 40. السمة                       | القيمة                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 41. **معرّف ATLAS**             | 42. AML.T0040 - الوصول إلى واجهة برمجة تطبيقات استدلال نموذج الذكاء الاصطناعي |
| 43. **الوصف**                   | 44. يسرق المهاجم رموز المصادقة من ملفات الإعداد                                               |
| 45. **ناقل الهجوم**             | 46. برمجيات خبيثة، وصول غير مصرح به إلى الجهاز، تعرّض نسخ إعدادات احتياطية                    |
| 47. **المكوّنات المتأثرة**      | 48. ~/.openclaw/credentials/، تخزين الإعدادات                 |
| 49. **إجراءات التخفيف الحالية** | أذونات الملفات                                                                                                       |
| 50. **المخاطر المتبقية**        | 1. مرتفع - يتم تخزين الرموز المميزة بنص صريح                                                  |
| **توصيات**                                             | 2. تنفيذ تشفير الرموز المميزة أثناء التخزين، وإضافة تدوير للرموز المميزة                      |

---

### 3. 3.3 التنفيذ (AML.TA0005)

#### 4. T-EXEC-001: حقن الموجّه المباشر

| 5. السمة                      | القيمة                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 6. **معرّف ATLAS**            | 7. AML.T0051.000 - حقن موجّه نموذج اللغة الكبير: مباشر |
| 8. **الوصف**                  | 9. يرسل المهاجم موجّهات مُعدّة خصيصًا للتلاعب بسلوك الوكيل                                             |
| 10. **متجه الهجوم**           | 11. رسائل القناة التي تحتوي على تعليمات عدائية                                                         |
| 12. **المكوّنات المتأثرة**    | 13. وكيل نموذج اللغة الكبير، جميع أسطح الإدخال                                                         |
| 14. **وسائل التخفيف الحالية** | Pattern detection, external content wrapping                                                                                  |
| 16. **المخاطر المتبقية**      | 17. حرجة - كشف فقط دون حظر؛ الهجمات المتقدمة تتجاوز ذلك                                                |
| **توصيات**                                           | Implement multi-layer defense, output validation, user confirmation for sensitive actions                                     |

#### 19. T-EXEC-002: حقن الموجّه غير المباشر

| Attribute                                            | القيمة                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 21. **معرّف ATLAS**           | 22. AML.T0051.001 - حقن موجّه نموذج اللغة الكبير: غير مباشر |
| 23. **الوصف**                 | 24. يضمّن المهاجم تعليمات خبيثة في المحتوى الذي يتم جلبه                                                    |
| 25. **متجه الهجوم**           | 26. عناوين URL خبيثة، رسائل بريد إلكتروني مسمومة، Webhooks مخترقة                                           |
| 27. **المكوّنات المتأثرة**    | 28. web_fetch، استيعاب البريد الإلكتروني، مصادر البيانات الخارجية                      |
| 29. **وسائل التخفيف الحالية** | 30. تغليف المحتوى بعلامات XML وإشعار أمني                                                                   |
| 31. **المخاطر المتبقية**      | 32. مرتفع - قد يتجاهل نموذج اللغة الكبير تعليمات التغليف                                                    |
| **توصيات**                                           | 33. تنفيذ تنقية المحتوى، فصل سياقات التنفيذ                                                                 |

#### T-EXEC-003: Tool Argument Injection

| 35. السمة                     | القيمة                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 36. **معرّف ATLAS**           | 37. AML.T0051.000 - حقن موجّه نموذج اللغة الكبير: مباشر |
| 38. **الوصف**                 | 39. يتلاعب المهاجم بوسائط الأداة عبر حقن الموجّه                                                        |
| 40. **متجه الهجوم**           | 41. موجّهات مُعدّة تؤثر على قيم معاملات الأداة                                                          |
| 42. **المكوّنات المتأثرة**    | 43. جميع استدعاءات الأدوات                                                                              |
| 44. **وسائل التخفيف الحالية** | 45. موافقات التنفيذ للأوامر الخطِرة                                                                     |
| 46. **المخاطر المتبقية**      | 47. مرتفع - يعتمد على حُكم المستخدم                                                                     |
| **توصيات**                                           | 48. تنفيذ التحقق من الوسائط، واستدعاءات أدوات مُعلّمة بالمعاملات                                        |

#### 49. T-EXEC-004: تجاوز موافقة التنفيذ

| 50. السمة | القيمة                                                     |
| -------------------------------- | ---------------------------------------------------------- |
| **ATLAS ID**                     | AML.T0043 - Craft Adversarial Data         |
| **Description**                  | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**                | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components**          | exec-approvals.ts, command allowlist       |
| **Current Mitigations**          | Allowlist + ask mode                                       |
| **Residual Risk**                | High - No command sanitization                             |
| **توصيات**                       | Implement command normalization, expand blocklist          |

---

### 3.4 Persistence (AML.TA0006)

#### T-PERSIST-001: Malicious Skill Installation

| Attribute               | القيمة                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker publishes malicious skill to ClawHub                                                        |
| **Attack Vector**       | Create account, publish skill with hidden malicious code                                             |
| **Affected Components** | ClawHub, skill loading, agent execution                                                              |
| **Current Mitigations** | GitHub account age verification, pattern-based moderation flags                                      |
| **Residual Risk**       | Critical - No sandboxing, limited review                                                             |
| **توصيات**              | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | القيمة                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **توصيات**              | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute               | القيمة                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**         | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**       | Config file modification, settings injection                                                  |
| **Affected Components** | Agent config, tool policies                                                                   |
| **Current Mitigations** | أذونات الملفات                                                                                |
| **Residual Risk**       | Medium - Requires local access                                                                |
| **توصيات**              | Config integrity verification, audit logging for config changes                               |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute               | القيمة                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data                                        |
| **Description**         | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**       | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components** | ClawHub moderation.ts                                                     |
| **Current Mitigations** | Pattern-based FLAG_RULES                                             |
| **Residual Risk**       | High - Simple regex easily bypassed                                                       |
| **توصيات**              | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | القيمة                                                    |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **توصيات**              | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute               | القيمة                                                    |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker enumerates available tools through prompting     |
| **Attack Vector**       | "What tools do you have?" style queries                   |
| **Affected Components** | Agent tool registry                                       |
| **Current Mitigations** | None specific                                             |
| **Residual Risk**       | Low - Tools generally documented                          |
| **توصيات**              | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute               | القيمة                                                    |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker extracts sensitive data from session context     |
| **Attack Vector**       | "What did we discuss?" queries, context probing           |
| **Affected Components** | Session transcripts, context window                       |
| **Current Mitigations** | Session isolation per sender                              |
| **Residual Risk**       | Medium - Within-session data accessible                   |
| **توصيات**              | Implement sensitive data redaction in context             |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Data Theft via web_fetch

| Attribute               | القيمة                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                 |
| **Description**         | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**       | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components** | web_fetch tool                                    |
| **Current Mitigations** | SSRF blocking for internal networks                                    |
| **Residual Risk**       | High - External URLs permitted                                         |
| **توصيات**              | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute               | القيمة                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                           |
| **Description**         | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**       | Prompt injection causing agent to message attacker               |
| **Affected Components** | Message tool, channel integrations                               |
| **Current Mitigations** | Outbound messaging gating                                        |
| **Residual Risk**       | Medium - Gating may be bypassed                                  |
| **توصيات**              | Require explicit confirmation for new recipients                 |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | القيمة                                                  |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **توصيات**              | Skill sandboxing, credential isolation                  |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001: Unauthorized Command Execution

| Attribute               | القيمة                                               |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker executes arbitrary commands on user system  |
| **Attack Vector**       | Prompt injection combined with exec approval bypass  |
| **Affected Components** | Bash tool, command execution                         |
| **Current Mitigations** | Exec approvals, Docker sandbox option                |
| **Residual Risk**       | Critical - Host execution without sandbox            |
| **توصيات**              | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | القيمة                                               |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **توصيات**              | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute                                             | القيمة                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **ATLAS ID**                                          | 1. AML.T0031 - تآكل سلامة نموذج الذكاء الاصطناعي |
| 2. **الوصف**                   | 3. يتسبب المهاجم في جعل الوكيل يرسل محتوى ضارًا/مسيئًا           |
| 4. **ناقل الهجوم**             | 5. حقن المطالبات الذي يؤدي إلى استجابات غير لائقة                |
| 6. **المكونات المتأثرة**       | 7. توليد المخرجات، مراسلة القنوات                                |
| 8. **إجراءات التخفيف الحالية** | 9. سياسات محتوى مزود نماذج اللغة الكبيرة                         |
| 10. **المخاطر المتبقية**       | 11. متوسطة - فلاتر المزود غير مثالية                             |
| **توصيات**                                            | 12. طبقة تصفية المخرجات، عناصر تحكم المستخدم                     |

---

## 4. 13. تحليل سلسلة توريد ClawHub

### 14. 4.1 ضوابط الأمان الحالية

| 15. الضبط                              | التنفيذ                                                                                     | 16. الفعالية                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 17. عمر حساب GitHub                    | 18. `requireGitHubAccountAge()`                                      | 19. متوسطة - ترفع العتبة أمام المهاجمين الجدد   |
| 20. تعقيم المسار                       | 21. `sanitizePath()`                                                 | High - Prevents path traversal                                         |
| 23. التحقق من نوع الملف                | 24. `isTextFile()`                                                   | 25. متوسطة - ملفات نصية فقط، لكنها قد تظل خبيثة |
| 26. حدود الحجم                         | 27. إجمالي الحزمة 50MB                                               | 28. عالية - تمنع استنزاف الموارد                |
| 29. ملف SKILL.md مطلوب | 30. ملف README إلزامي                                                | 31. قيمة أمنية منخفضة - معلوماتية فقط           |
| 32. إشراف الأنماط                      | 33. FLAG_RULES في moderation.ts | 34. منخفضة - يسهل تجاوزها                       |
| 35. حالة الإشراف                       | 36. الحقل `moderationStatus`                                         | 37. متوسطة - المراجعة اليدوية ممكنة             |

### 38. 4.2 أنماط أعلام الإشراف

39. الأنماط الحالية في `moderation.ts`:

```javascript
40. // Known-bad identifiers
/(keepcold131\/ClawdAuthenticatorTool|ClawdAuthenticatorTool)/i

// Suspicious keywords
/(malware|stealer|phish|phishing|keylogger)/i
/(api[-_ ]?key|token|password|private key|secret)/i
/(wallet|seed phrase|mnemonic|crypto)/i
/(discord\.gg|webhook|hooks\.slack)/i
/(curl[^\n]+\|\s*(sh|bash))/i
/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd)/i
```

41. **القيود:**

- 42. يتحقق فقط من slug وdisplayName والملخص وfrontmatter والبيانات الوصفية ومسارات الملفات
- 43. لا يحلل محتوى كود المهارة الفعلي
- 44. تعبيرات regex بسيطة يسهل تجاوزها عبر الإخفاء
- 45. لا يوجد تحليل سلوكي

### 46. 4.3 التحسينات المخطط لها

| 47. التحسين          | الحالة                                                | 48. الأثر                                     |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 49. تكامل VirusTotal | 50. قيد التنفيذ                | مرتفع - تحليل سلوكي لرؤية الشيفرة                                    |
| الإبلاغ المجتمعي                            | جزئي (`skillReports` table exists) | متوسط                                                                |
| تسجيل عمليات التدقيق                        | جزئي (`auditLogs` table exists)    | متوسط                                                                |
| نظام الشارات                                | مُنفّذ                                                | متوسط - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. مصفوفة المخاطر

### 5.1 الاحتمالية مقابل التأثير

| معرّف التهديد | الاحتمالية | التأثير | مستوى المخاطر | الأولوية |
| ------------- | ---------- | ------- | ------------- | -------- |
| T-EXEC-001    | مرتفع      | حرج     | **حرج**       | P0       |
| T-PERSIST-001 | مرتفع      | حرج     | **حرج**       | P0       |
| T-EXFIL-003   | متوسط      | حرج     | **Critical**  | P0       |
| T-IMPACT-001  | متوسط      | حرج     | **مرتفع**     | P1       |
| T-EXEC-002    | High       | مرتفع   | **High**      | P1       |
| T-EXEC-004    | متوسط      | مرتفع   | **مرتفع**     | P1       |
| T-ACCESS-003  | متوسط      | مرتفع   | **High**      | P1       |
| T-EXFIL-001   | Medium     | High    | **High**      | P1       |
| T-IMPACT-002  | High       | Medium  | **High**      | P1       |
| T-EVADE-001   | High       | Medium  | **Medium**    | P2       |
| T-ACCESS-001  | Low        | High    | **Medium**    | P2       |
| T-ACCESS-002  | Low        | High    | **Medium**    | P2       |
| T-PERSIST-002 | Low        | High    | **Medium**    | P2       |

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

| المسار                              | الغرض                       | Risk Level   |
| ----------------------------------- | --------------------------- | ------------ |
| `src/infra/exec-approvals.ts`       | Command approval logic      | **Critical** |
| `src/gateway/auth.ts`               | Gateway authentication      | **Critical** |
| `src/web/inbound/access-control.ts` | Channel access control      | **Critical** |
| `src/infra/net/ssrf.ts`             | SSRF protection             | **Critical** |
| `src/security/external-content.ts`  | Prompt injection mitigation | **Critical** |
| `src/agents/sandbox/tool-policy.ts` | Tool policy enforcement     | **Critical** |
| `convex/lib/moderation.ts`          | ClawHub moderation          | **High**     |
| `convex/lib/skillPublish.ts`        | Skill publishing flow       | **High**     |
| `src/routing/resolve-route.ts`      | Session isolation           | **Medium**   |

### 7.3 Glossary

| Term              | Definition                                          |
| ----------------- | --------------------------------------------------- |
| **ATLAS**         | MITRE's Adversarial Threat Landscape for AI Systems |
| **ClawHub**       | OpenClaw's skill marketplace                        |
| **Gateway**       | OpenClaw's message routing and authentication layer |
| **MCP**           | بروتوكول سياق النموذج - واجهة موفّر الأدوات         |
| **حقن التوجيهات** | هجوم يتم فيه تضمين تعليمات خبيثة داخل الإدخال       |
| **Skill**         | امتداد قابل للتنزيل لوكلاء OpenClaw                 |
| **SSRF**          | تزوير الطلبات من جانب الخادم                        |

---

_هذا نموذج تهديد حي ومتجدد. أبلِغ عن مشكلات الأمان إلى security@openclaw.ai_
