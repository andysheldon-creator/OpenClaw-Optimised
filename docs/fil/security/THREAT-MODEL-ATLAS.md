# 4. OpenClaw Threat Model v1.0

## 5. MITRE ATLAS Framework

6. **Bersyon:** 1.0-draft
   **Huling Na-update:** 2026-02-04
   **Metodolohiya:** MITRE ATLAS + Mga Data Flow Diagram
   **Framework:** [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems)

### 7. Pagbibigay-kredito sa Framework

8. Ang threat model na ito ay binuo sa [MITRE ATLAS](https://atlas.mitre.org/), ang pamantayang framework ng industriya para sa pagdodokumento ng mga adversarial na banta sa mga AI/ML system. 9. Ang ATLAS ay pinapanatili ng [MITRE](https://www.mitre.org/) sa pakikipagtulungan sa komunidad ng AI security.

10. **Mga Pangunahing ATLAS Resource:**

- 11. [ATLAS Techniques](https://atlas.mitre.org/techniques/)
- 12. [ATLAS Tactics](https://atlas.mitre.org/tactics/)
- 13. [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- 14. [ATLAS GitHub](https://github.com/mitre-atlas/atlas-data)
- 15. [Pag-aambag sa ATLAS](https://atlas.mitre.org/resources/contribute)

### 16. Pag-aambag sa Threat Model na Ito

17. Isa itong buhay na dokumento na pinananatili ng komunidad ng OpenClaw. 18. Tingnan ang [CONTRIBUTING-THREAT-MODEL.md](./CONTRIBUTING-THREAT-MODEL.md) para sa mga alituntunin sa pag-aambag:

- 19. Pag-uulat ng mga bagong banta
- 20. Pag-update ng mga umiiral na banta
- 21. Pagmumungkahi ng mga attack chain
- 22. Pagmumungkahi ng mga mitigation

---

## 38. 1. 23. Panimula

### 24. 1.1 Layunin

25. Ang threat model na ito ay nagdodokumento ng mga adversarial na banta sa OpenClaw AI agent platform at ClawHub skill marketplace, gamit ang MITRE ATLAS framework na partikular na idinisenyo para sa mga AI/ML system.

### 26. 1.2 Saklaw

| Component                                             | 27. Kasama  | Notes                                                                                        |
| ----------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| 28. OpenClaw Agent Runtime     | Oo                                 | 29. Pangunahing pagpapatakbo ng agent, mga tool call, mga session     |
| Gateway                                               | Oo                                 | 30. Authentication, routing, integrasyon ng channel                   |
| 31. Mga Integrasyon ng Channel | Oo                                 | 32. WhatsApp, Telegram, Discord, Signal, Slack, atbp. |
| 33. ClawHub Marketplace        | Oo                                 | 34. Paglalathala ng skill, moderasyon, pamamahagi                     |
| 35. Mga MCP Server             | Oo                                 | 36. Mga panlabas na provider ng tool                                  |
| 37. Mga Device ng User         | 38. Bahagya | 39. Mga mobile app, desktop client                                    |

### 40. 1.3 Hindi Saklaw

41. Walang anumang hayagang hindi saklaw para sa threat model na ito.

---

## 2. 42. Arkitektura ng Sistema

### 43. 2.1 Mga Hangganan ng Tiwala

```
44. ┌─────────────────────────────────────────────────────────────────┐
│                    HINDI PINAGKAKATIWALAANG ZONA                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  WhatsApp   │  │  Telegram   │  │   Discord   │  ...         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│          HANGGANAN NG TIWALA 1: Access sa Channel               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      GATEWAY                              │   │
│  │  • Pagpapares ng Device (30s na palugit)                  │   │
│  │  • Pagpapatunay ng AllowFrom / AllowList                  │   │
│  │  • Token/Password/Tailscale auth                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          HANGGANAN NG TIWALA 2: Pag-iisa ng Session             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   MGA SESSION NG AGENT                   │   │
│  │  • Session key = agent:channel:peer                       │   │
│  │  • Mga patakaran ng tool bawat agent                      │   │
│  │  • Pag-log ng transcript                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          HANGGANAN NG TIWALA 3: Pagpapatupad ng Tool            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  EXECUTION SANDBOX                        │   │
│  │  • Docker sandbox O Host (exec-approvals)                 │   │
│  │  • Remote execution ng Node                               │   │
│  │  • Proteksyon sa SSRF (DNS pinning + IP blocking)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          HANGGANAN NG TIWALA 4: Panlabas na Nilalaman           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │        MGA KINUHANG URL / EMAIL / WEBHOOK                 │   │
│  │  • Pagbabalot ng panlabas na nilalaman (XML tags)        │   │
│  │  • Pag-iniksyon ng abiso sa seguridad                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          HANGGANAN NG TIWALA 5: Supply Chain                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      CLAWHUB                              │   │
│  │  • Paglalathala ng skill (semver, kinakailangan ang SKILL.md) │
│  │  • Mga flag ng moderasyon batay sa pattern                │
│  │  • VirusTotal scanning (malapit nang dumating)           │
│  │  • Pag-verify ng edad ng GitHub account                  │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 45. 2.2 Mga Daloy ng Data

| 46. Daloy | 47. Pinagmulan | 48. Patutunguhan | 49. Data         | 50. Proteksyon |
| -------------------------------- | ------------------------------------- | --------------------------------------- | --------------------------------------- | ------------------------------------- |
| F1                               | Channel                               | Gateway                                 | User messages                           | TLS, AllowFrom                        |
| F2                               | Gateway                               | Agent                                   | Routed messages                         | Session isolation                     |
| F3                               | Agent                                 | Mga Tool                                | Tool invocations                        | Policy enforcement                    |
| F4                               | Agent                                 | External                                | web_fetch requests | SSRF blocking                         |
| F5                               | ClawHub                               | Agent                                   | Skill code                              | Moderation, scanning                  |
| F6                               | Agent                                 | Channel                                 | Responses                               | Output filtering                      |

---

## 17. 3. Threat Analysis by ATLAS Tactic

### 3.1 Reconnaissance (AML.TA0002)

#### T-RECON-001: Agent Endpoint Discovery

| Attribute               | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0006 - Active Scanning                          |
| **Description**         | Attacker scans for exposed OpenClaw gateway endpoints                |
| **Attack Vector**       | Network scanning, shodan queries, DNS enumeration                    |
| **Affected Components** | Gateway, exposed API endpoints                                       |
| **Current Mitigations** | Tailscale auth option, bind to loopback by default                   |
| **Residual Risk**       | Medium - Public gateways discoverable                                |
| **Mga rekomendasyon**   | Document secure deployment, add rate limiting on discovery endpoints |

#### T-RECON-002: Channel Integration Probing

| Attribute                 | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| **ATLAS ID**              | AML.T0006 - Active Scanning                        |
| **Description**           | Attacker probes messaging channels to identify AI-managed accounts |
| **Attack Vector**         | Sending test messages, observing response patterns                 |
| **Mga Apektadong Bahagi** | Lahat ng integrasyon ng channel                                    |
| **Current Mitigations**   | Walang partikular                                                  |
| **Residual Risk**         | Mababa - Limitadong halaga mula sa pagtuklas lamang                |
| **Mga rekomendasyon**     | Isaalang-alang ang pag-randomize ng timing ng tugon                |

---

### 3.2 Paunang Pag-access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute                       | Value                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0040 - AI Model Inference API Access                       |
| **Description**                 | Ini-intercept ng umaatake ang pairing code sa loob ng 30s na grace period       |
| **Attack Vector**               | Shoulder surfing, network sniffing, social engineering                          |
| **Mga Apektadong Bahagi**       | Sistema ng pagpa-pair ng device                                                 |
| **Mga Kasalukuyang Mitigasyon** | 30s na pag-expire, mga code na ipinapadala sa pamamagitan ng umiiral na channel |
| **Natitirang Panganib**         | Katamtaman - Napagsasamantalahan ang grace period                               |
| **Mga rekomendasyon**           | Bawasan ang grace period, magdagdag ng hakbang sa kumpirmasyon                  |

#### T-ACCESS-002: AllowFrom Spoofing

| Atributo                        | Value                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0040 - AI Model Inference API Access                                                  |
| **Paglalarawan**                | Nini-spoof ng umaatake ang pinapayagang pagkakakilanlan ng nagpadala sa channel                            |
| **Attack Vector**               | Depende sa channel - pag-spoof ng numero ng telepono, panggagaya ng username                               |
| **Mga Apektadong Bahagi**       | Pag-validate ng AllowFrom kada channel                                                                     |
| **Mga Kasalukuyang Mitigasyon** | Pag-verify ng pagkakakilanlan na partikular sa channel                                                     |
| **Natitirang Panganib**         | Katamtaman - May ilang channel na madaling ma-spoof                                                        |
| **Mga rekomendasyon**           | I-dokumento ang mga panganib na partikular sa channel, magdagdag ng cryptographic verification kung maaari |

#### T-ACCESS-003: Pagkawala ng Token

| Atributo                        | Value                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0040 - AI Model Inference API Access                           |
| **Paglalarawan**                | Ninanakaw ng umaatake ang mga authentication token mula sa mga config file          |
| **Attack Vector**               | Malware, hindi awtorisadong pag-access sa device, pagkakalantad ng backup ng config |
| **Mga Apektadong Bahagi**       | ~/.openclaw/credentials/, imbakan ng config         |
| **Mga Kasalukuyang Mitigasyon** | Mga permiso ng file                                                                 |
| **Natitirang Panganib**         | High - Tokens stored in plaintext                                                   |
| **Mga rekomendasyon**           | Implement token encryption at rest, add token rotation                              |

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
| **Mga rekomendasyon**   | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **Mga rekomendasyon**   | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Mga rekomendasyon**   | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | Value                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **Mga rekomendasyon**   | Implement command normalization, expand blocklist          |

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
| **Mga rekomendasyon**   | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **Mga rekomendasyon**   | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute               | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**         | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**       | Config file modification, settings injection                                                  |
| **Affected Components** | Agent config, tool policies                                                                   |
| **Current Mitigations** | Mga permiso ng file                                                                           |
| **Residual Risk**       | Medium - Requires local access                                                                |
| **Mga rekomendasyon**   | Config integrity verification, audit logging for config changes                               |

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
| **Mga rekomendasyon**   | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **Mga rekomendasyon**   | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute                       | Value                                                     |
| ------------------------------- | --------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0040 - AI Model Inference API Access |
| **Description**                 | Attacker enumerates available tools through prompting     |
| **Attack Vector**               | "What tools do you have?" style queries                   |
| **Affected Components**         | Agent tool registry                                       |
| **Kasalukuyang mga Mitigasyon** | Walang partikular                                         |
| **Natitirang Panganib**         | Mababa - Karaniwang nadodokumento ang mga tool            |
| **Mga rekomendasyon**           | Consider tool visibility controls                         |

#### T-DISC-002: Pagkuha ng Datos ng Session

| Atributo                        | Value                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0040 - Access sa API ng AI Model Inference         |
| **Paglalarawan**                | Kinukuha ng umaatake ang sensitibong datos mula sa konteksto ng session |
| **Vector ng Pag-atake**         | "Ano ang napag-usapan natin?" mga query, pag-probe ng konteksto         |
| **Mga Apektadong Bahagi**       | Mga transcript ng session, context window                               |
| **Kasalukuyang mga Mitigasyon** | Session isolation per sender                                            |
| **Natitirang Panganib**         | Katamtaman - Maa-access ang datos sa loob ng session                    |
| **Mga rekomendasyon**           | Magpatupad ng pag-redact ng sensitibong datos sa konteksto              |

---

### 3.7 Pagkolekta at Pag-exfiltrate (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Pagnanakaw ng Datos sa pamamagitan ng web_fetch

| Atributo                        | Value                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0009 - Pagkolekta                                 |
| **Paglalarawan**                | Attacker exfiltrates data by instructing agent to send to external URL |
| **Vector ng Pag-atake**         | Prompt injection causing agent to POST data to attacker server         |
| **Mga Apektadong Bahagi**       | web_fetch tool                                    |
| **Kasalukuyang mga Mitigasyon** | SSRF blocking para sa mga internal na network                          |
| **Natitirang Panganib**         | Mataas - Pinapayagan ang mga panlabas na URL                           |
| **Mga rekomendasyon**           | Magpatupad ng URL allowlisting, kamalayan sa pag-uuri ng datos         |

#### T-EXFIL-002: Hindi Awtorisadong Pagpapadala ng Mensahe

| Attribute                       | Value                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0009 - Pagkolekta                                                 |
| **Paglalarawan**                | Pinapadala ng umaatake ang agent ng mga mensaheng naglalaman ng sensitibong datos      |
| **Vector ng Pag-atake**         | Prompt injection na nagiging sanhi upang ang agent ay magpadala ng mensahe sa umaatake |
| **Mga Apektadong Bahagi**       | Message tool, mga integrasyon ng channel                                               |
| **Kasalukuyang mga Mitigasyon** | Pag-gate ng outbound messaging                                                         |
| **Natitirang Panganib**         | Katamtaman - Maaaring malampasan ang pag-gate                                          |
| **Mga rekomendasyon**           | Require explicit confirmation for new recipients                                       |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **Mga rekomendasyon**   | Skill sandboxing, credential isolation                  |

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
| **Mga rekomendasyon**   | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **Mga rekomendasyon**   | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute                       | Value                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| **ATLAS ID**                    | AML.T0031 - Erode AI Model Integrity                         |
| **Paglalarawan**                | Inaatake ang ahente upang magpadala ng mapanganib o nakakasakit na nilalaman |
| **Attack Vector**               | Prompt injection na nagdudulot ng hindi angkop na mga tugon                  |
| **Mga Apektadong Bahagi**       | Output generation, channel messaging                                         |
| **Mga Kasalukuyang Mitigasyon** | LLM provider content policies                                                |
| **Natitirang Panganib**         | Medium - Provider filters imperfect                                          |
| **Mga rekomendasyon**           | Layer ng pag-filter ng output, mga kontrol ng gumagamit                      |

---

## 42. 4. ClawHub Supply Chain Analysis

### 4.1 Mga Kasalukuyang Kontrol sa Seguridad

| Control                                 | Implementasyon                                                   | Epektibidad                                                                |
| --------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Edad ng GitHub Account                  | `requireGitHubAccountAge()`                                      | Medium - Raises bar for new attackers                                      |
| Path Sanitization                       | `sanitizePath()`                                                 | Mataas - Pinipigilan ang path traversal                                    |
| Pagpapatunay ng Uri ng File             | `isTextFile()`                                                   | Katamtaman - Mga text file lamang, ngunit maaari pa ring maging mapanganib |
| Size Limits                             | 50MB kabuuang bundle                                             | High - Prevents resource exhaustion                                        |
| Kinakailangang SKILL.md | Sapilitang readme                                                | Mababang halaga sa seguridad - Impormatibo lamang                          |
| Pattern Moderation                      | FLAG_RULES sa moderation.ts | Mababa - Madaling i-bypass                                                 |
| Katayuan ng Moderation                  | `moderationStatus` field                                         | Katamtaman - Posible ang manu-manong pagsusuri                             |

### 4.2 Mga Pattern ng Moderation Flag

Mga kasalukuyang pattern sa `moderation.ts`:

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

**Mga Limitasyon:**

- Tanging slug, displayName, summary, frontmatter, metadata, at mga path ng file lamang ang sinusuri
- Hindi sinusuri ang aktwal na nilalaman ng skill code
- Simpleng regex na madaling ma-bypass gamit ang obfuscation
- Walang behavioral analysis

### 4.3 Mga Planong Pagpapabuti

| Pagpapabuti               | Status                                                   | Epekto                                                                |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Integrasyon ng VirusTotal | Kasalukuyang Isinasagawa                                 | High - Code Insight behavioral analysis                               |
| Community Reporting       | Partial (`skillReports` table exists) | Medium                                                                |
| Audit Logging             | Partial (`auditLogs` table exists)    | Medium                                                                |
| Badge System              | Implemented                                              | Medium - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. Risk Matrix

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

| Ang limitasyon ay ang iyong         | Layunin                     | Risk Level   |
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

| Term                 | Definition                                                           |
| -------------------- | -------------------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems                  |
| **ClawHub**          | OpenClaw's skill marketplace                                         |
| **Gateway**          | OpenClaw's message routing and authentication layer                  |
| **MCP**              | Model Context Protocol - interface ng tool provider                  |
| **Prompt Injection** | Atake kung saan ang malisyosong mga tagubilin ay inilalagay sa input |
| **Skill**            | Nada-download na extension para sa mga OpenClaw agent                |
| **SSRF**             | Server-Side Request Forgery                                          |

---

_Ang threat model na ito ay isang buhay na dokumento. I-report ang mga isyu sa seguridad sa security@openclaw.ai_
