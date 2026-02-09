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

| Component              | Included | टिप्पणियाँ                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | हाँ      | Core agent execution, tool calls, sessions                       |
| Gateway                | हाँ      | Authentication, routing, channel integration                     |
| Channel Integrations   | हाँ      | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | हाँ      | Skill publishing, moderation, distribution                       |
| MCP Servers            | हाँ      | External tool providers                                          |
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

| Flow | Source  | Destination | Data                                  | Protection        |
| ---- | ------- | ----------- | ------------------------------------- | ----------------- |
| F1   | चैनल    | Gateway     | उपयोगकर्ता संदेश                      | TLS, AllowFrom    |
| F2   | Gateway | एजेंट       | रूट किए गए संदेश                      | सत्र पृथक्करण     |
| F3   | एजेंट   | Tools       | टूल इनवोकेशन                          | नीति प्रवर्तन     |
| F4   | एजेंट   | बाहरी       | web_fetch अनुरोध | SSRF अवरोधन       |
| F5   | ClawHub | एजेंट       | स्किल कोड                             | मॉडरेशन, स्कैनिंग |
| F6   | एजेंट   | चैनल        | Responses                             | आउटपुट फ़िल्टरिंग |

---

## 42. 6. ATLAS टैक्टिक द्वारा खतरा विश्लेषण

### 3.1 टोही (AML.TA0002)

#### T-RECON-001: एजेंट एंडपॉइंट खोज

| विशेषता              | मान                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------ |
| **ATLAS ID**         | AML.T0006 - सक्रिय स्कैनिंग                                          |
| **विवरण**            | हमलावर उजागर OpenClaw गेटवे एंडपॉइंट्स के लिए स्कैन करता है                          |
| **आक्रमण वेक्टर**    | नेटवर्क स्कैनिंग, shodan क्वेरीज़, DNS एन्यूमरेशन                                    |
| **प्रभावित घटक**     | गेटवे, उजागर API एंडपॉइंट्स                                                          |
| **वर्तमान शमन उपाय** | Tailscale प्रमाणीकरण विकल्प, डिफ़ॉल्ट रूप से लूपबैक से बाइंड                         |
| **अवशिष्ट जोखिम**    | मध्यम - सार्वजनिक गेटवे खोजे जा सकते हैं                                             |
| **सिफ़ारिशें**       | सुरक्षित परिनियोजन का दस्तावेज़ीकरण करें, डिस्कवरी एंडपॉइंट्स पर रेट लिमिटिंग जोड़ें |

#### T-RECON-002: चैनल इंटीग्रेशन प्रोबिंग

| विशेषता                 | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0006 - सक्रिय स्कैनिंग                              |
| **विवरण**               | हमलावर AI-प्रबंधित खातों की पहचान के लिए मैसेजिंग चैनलों की जाँच करता है |
| **आक्रमण वेक्टर**       | Sending test messages, observing response patterns                       |
| **Affected Components** | All channel integrations                                                 |
| **Current Mitigations** | None specific                                                            |
| **Residual Risk**       | Low - Limited value from discovery alone                                 |
| **Recommendations**     | Consider response timing randomization                                   |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute               | मान                                                       |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**       | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components** | Device pairing system                                     |
| **Current Mitigations** | 30s expiry, codes sent via existing channel               |
| **Residual Risk**       | Medium - Grace period exploitable                         |
| **Recommendations**     | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute               | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **Recommendations**     | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute            | Value                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| **ATLAS ID**         | AML.T0040 - AI Model Inference API Access                  |
| **Description**      | Attacker steals authentication tokens from config files                    |
| **Attack Vector**    | Malware, unauthorized device access, config backup exposure                |
| **प्रभावित घटक**     | ~/.openclaw/credentials/, कॉन्फ़िग स्टोरेज |
| **वर्तमान शमन उपाय** | फ़ाइल अनुमतियाँ                                                            |
| **अवशिष्ट जोखिम**    | उच्च - टोकन सादे पाठ में संग्रहीत हैं                                      |
| **अनुशंसाएँ**        | टोकन को विश्राम अवस्था में एन्क्रिप्ट करें, टोकन रोटेशन जोड़ें             |

---

### 3.3 निष्पादन (AML.TA0005)

#### T-EXEC-001: प्रत्यक्ष प्रॉम्प्ट इंजेक्शन

| विशेषता              | Value                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **ATLAS ID**         | AML.T0051.000 - LLM प्रॉम्प्ट इंजेक्शन: प्रत्यक्ष |
| **विवरण**            | हमलावर एजेंट के व्यवहार में हेरफेर करने के लिए तैयार किए गए प्रॉम्प्ट भेजता है                    |
| **आक्रमण वेक्टर**    | विरोधी निर्देशों वाले चैनल संदेश                                                                  |
| **प्रभावित घटक**     | एजेंट LLM, सभी इनपुट सतहें                                                                        |
| **वर्तमान शमन उपाय** | पैटर्न पहचान, बाहरी सामग्री रैपिंग                                                                |
| **अवशिष्ट जोखिम**    | गंभीर - केवल पहचान, कोई अवरोध नहीं; परिष्कृत हमले बायपास कर सकते हैं                              |
| **अनुशंसाएँ**        | बहु-स्तरीय रक्षा लागू करें, आउटपुट सत्यापन, संवेदनशील कार्रवाइयों के लिए उपयोगकर्ता पुष्टि        |

#### T-EXEC-002: Indirect Prompt Injection

| विशेषता              | मान                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**         | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **विवरण**            | हमलावर प्राप्त की गई सामग्री में दुर्भावनापूर्ण निर्देश एम्बेड करता है                         |
| **आक्रमण वेक्टर**    | दुर्भावनापूर्ण URL, ज़हरीले ईमेल, समझौता किए गए वेबहुक                                         |
| **प्रभावित घटक**     | web_fetch, email ingestion, external data sources                         |
| **वर्तमान शमन उपाय** | XML टैग और सुरक्षा सूचना के साथ सामग्री रैपिंग                                                 |
| **अवशिष्ट जोखिम**    | उच्च - LLM रैपर निर्देशों को अनदेखा कर सकता है                                                 |
| **अनुशंसाएँ**        | सामग्री सैनिटाइज़ेशन लागू करें, अलग निष्पादन संदर्भ                                            |

#### T-EXEC-003: टूल आर्गुमेंट इंजेक्शन

| Attribute               | मान                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **विवरण**               | Attacker manipulates tool arguments through prompt injection                                 |
| **आक्रमण वेक्टर**       | ऐसे तैयार किए गए प्रॉम्प्ट जो टूल पैरामीटर मानों को प्रभावित करते हैं                        |
| **प्रभावित घटक**        | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Recommendations**     | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | मान                                                        |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **Recommendations**     | Implement command normalization, expand blocklist          |

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

| Attribute                                      | Value                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**                                   | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**                                | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**                              | Account compromise, social engineering of skill owner                                                |
| **Affected Components**                        | ClawHub versioning, auto-update flows                                                                |
| 1. **वर्तमान शमन उपाय** | 2. संस्करण फिंगरप्रिंटिंग                                                     |
| **Residual Risk**                              | 4. उच्च - ऑटो-अपडेट्स दुर्भावनापूर्ण संस्करण खींच सकते हैं                    |
| 5. **सिफारिशें**        | 6. अपडेट साइनिंग, रोलबैक क्षमता, संस्करण पिनिंग लागू करें                     |

#### 7. T-PERSIST-003: एजेंट कॉन्फ़िगरेशन से छेड़छाड़

| 8. विशेषता            | Value                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **ATLAS ID**                                 | 10. AML.T0010.002 - सप्लाई चेन समझौता: डेटा |
| **Description**                              | 12. हमलावर पहुँच बनाए रखने के लिए एजेंट कॉन्फ़िगरेशन में बदलाव करता है                      |
| 13. **हमला वेक्टर**   | 14. कॉन्फ़िग फ़ाइल संशोधन, सेटिंग्स इंजेक्शन                                                |
| 15. **प्रभावित घटक**  | 16. एजेंट कॉन्फ़िग, टूल नीतियाँ                                                             |
| **Current Mitigations**                      | File permissions                                                                                                   |
| 19. **अवशिष्ट जोखिम** | 20. मध्यम - स्थानीय पहुँच की आवश्यकता                                                       |
| 21. **सिफारिशें**     | 22. कॉन्फ़िग अखंडता सत्यापन, कॉन्फ़िग परिवर्तनों के लिए ऑडिट लॉगिंग                         |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| 25. विशेषता              | मान                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **ATLAS ID**                                    | AML.T0043 - Craft Adversarial Data                                                                     |
| **Description**                                 | 29. हमलावर मॉडरेशन पैटर्न से बचने के लिए कौशल सामग्री तैयार करता है                             |
| 30. **हमला वेक्टर**      | 31. यूनिकोड होमोग्लिफ़्स, एन्कोडिंग ट्रिक्स, डायनेमिक लोडिंग                                    |
| 32. **प्रभावित घटक**     | 33. ClawHub moderation.ts                                                       |
| 34. **वर्तमान शमन उपाय** | Pattern-based FLAG_RULES                                                                          |
| 36. **अवशिष्ट जोखिम**    | 37. उच्च - सरल regex आसानी से बायपास हो जाता है                                                 |
| 38. **सिफारिशें**        | 39. व्यवहारिक विश्लेषण जोड़ें (VirusTotal Code Insight), AST-आधारित डिटेक्शन |

#### 40. T-EVADE-002: कंटेंट रैपर एस्केप

| 41. विशेषता              | Value                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 42. **ATLAS ID**         | 43. AML.T0043 - प्रतिकूल डेटा तैयार करना                     |
| 44. **विवरण**            | 45. हमलावर ऐसी सामग्री तैयार करता है जो XML रैपर संदर्भ से बाहर निकल जाती है |
| 46. **हमला वेक्टर**      | 47. टैग हेरफेर, संदर्भ भ्रम, निर्देश ओवरराइड                                 |
| 48. **प्रभावित घटक**     | 49. बाहरी सामग्री रैपिंग                                                     |
| 50. **वर्तमान शमन उपाय** | XML tags + security notice                                                                          |
| **Residual Risk**                               | Medium - Novel escapes discovered regularly                                                         |
| **Recommendations**                             | Multiple wrapper layers, output-side validation                                                     |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker enumerates available tools through prompting     |
| **Attack Vector**       | "What tools do you have?" style queries                   |
| **Affected Components** | Agent tool registry                                       |
| **Current Mitigations** | None specific                                             |
| **Residual Risk**       | Low - Tools generally documented                          |
| **Recommendations**     | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute               | मान                                                       |
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

| Attribute               | मान                                                                    |
| ----------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                 |
| **Description**         | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**       | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components** | web_fetch tool                                    |
| **Current Mitigations** | SSRF blocking for internal networks                                    |
| **Residual Risk**       | High - External URLs permitted                                         |
| **Recommendations**     | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute               | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                           |
| **Description**         | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**       | Prompt injection causing agent to message attacker               |
| **Affected Components** | Message tool, channel integrations                               |
| **Current Mitigations** | Outbound messaging gating                                        |
| **Residual Risk**       | Medium - Gating may be bypassed                                  |
| **Recommendations**     | Require explicit confirmation for new recipients                 |

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

| Attribute               | मान                                                             |
| ----------------------- | --------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity            |
| **Description**         | Attacker executes arbitrary commands on user system             |
| **Attack Vector**       | Prompt injection combined with exec approval bypass             |
| **Affected Components** | Bash tool, command execution                                    |
| **Current Mitigations** | Exec approvals, Docker sandbox option                           |
| **अवशिष्ट जोखिम**       | गंभीर - सैंडबॉक्स के बिना होस्ट निष्पादन                        |
| **सिफारिशें**           | डिफ़ॉल्ट रूप से सैंडबॉक्स सक्षम करें, अनुमोदन UX में सुधार करें |

#### T-IMPACT-002: संसाधन क्षय (DoS)

| विशेषता              | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| **ATLAS ID**         | AML.T0031 - AI मॉडल की अखंडता को क्षीण करना |
| **विवरण**            | हमलावर API क्रेडिट या कंप्यूट संसाधनों को समाप्त कर देता है |
| **हमला वेक्टर**      | स्वचालित संदेश बाढ़, महंगे टूल कॉल                          |
| **प्रभावित घटक**     | गेटवे, एजेंट सत्र, API प्रदाता                              |
| **वर्तमान शमन उपाय** | कोई नहीं                                                    |
| **अवशिष्ट जोखिम**    | उच्च - कोई रेट लिमिटिंग नहीं                                |
| **सिफारिशें**        | प्रति-प्रेषक रेट लिमिट, लागत बजट लागू करें                  |

#### T-IMPACT-003: प्रतिष्ठा को नुकसान

| विशेषता              | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| **ATLAS ID**         | AML.T0031 - AI मॉडल की अखंडता को क्षीण करना |
| **विवरण**            | हमलावर एजेंट से हानिकारक/आपत्तिजनक सामग्री भेजवाता है       |
| **Attack Vector**    | अनुचित प्रतिक्रियाओं का कारण बनने वाला प्रॉम्प्ट इंजेक्शन   |
| **प्रभावित घटक**     | आउटपुट जनरेशन, चैनल मैसेजिंग                                |
| **वर्तमान शमन उपाय** | LLM प्रदाता की सामग्री नीतियाँ                              |
| **अवशिष्ट जोखिम**    | मध्यम - प्रदाता फ़िल्टर अपूर्ण हैं                          |
| **सिफारिशें**        | आउटपुट फ़िल्टरिंग लेयर, उपयोगकर्ता नियंत्रण                 |

---

## 4. ClawHub सप्लाई चेन विश्लेषण

### 4.1 वर्तमान सुरक्षा नियंत्रण

| नियंत्रण                        | इम्प्लीमेंटेशन                                                    | Effectiveness                                                         |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| GitHub खाता आयु                 | `requireGitHubAccountAge()`                                       | मध्यम - नए हमलावरों के लिए बाधा बढ़ाता है                             |
| पाथ सैनिटाइज़ेशन                | `sanitizePath()`                                                  | उच्च - पाथ ट्रैवर्सल को रोकता है                                      |
| फ़ाइल प्रकार सत्यापन            | `isTextFile()`                                                    | मध्यम - केवल टेक्स्ट फ़ाइलें, लेकिन फिर भी दुर्भावनापूर्ण हो सकती हैं |
| आकार सीमाएँ                     | 50MB कुल बंडल                                                     | उच्च - संसाधन समाप्ति को रोकता है                                     |
| आवश्यक SKILL.md | अनिवार्य readme                                                   | कम सुरक्षा मूल्य - केवल सूचनात्मक                                     |
| पैटर्न मॉडरेशन                  | moderation.ts में FLAG_RULES | कम - आसानी से बायपास किया जा सकता है                                  |
| मॉडरेशन स्थिति                  | `moderationStatus` फ़ील्ड                                         | मध्यम - मैनुअल समीक्षा संभव                                           |

### 4.2 मॉडरेशन फ़्लैग पैटर्न

`moderation.ts` में वर्तमान पैटर्न:

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

**सीमाएँ:**

- केवल slug, displayName, summary, frontmatter, metadata, फ़ाइल पथों की जाँच करता है
- वास्तविक skill कोड सामग्री का विश्लेषण नहीं करता
- सरल regex को obfuscation के साथ आसानी से बायपास किया जा सकता है
- कोई व्यवहारिक विश्लेषण नहीं

### 4.3 नियोजित सुधार

| सुधार             | Status                                                    | प्रभाव                                                               |
| ----------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| VirusTotal एकीकरण | प्रगति में                                                | उच्च - कोड इनसाइट व्यवहारिक विश्लेषण                                 |
| समुदाय रिपोर्टिंग | आंशिक (`skillReports` तालिका मौजूद है) | मध्यम                                                                |
| ऑडिट लॉगिंग       | आंशिक (`auditLogs` तालिका मौजूद है)    | मध्यम                                                                |
| बैज सिस्टम        | कार्यान्वित                                               | मध्यम - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 46. यदि आपका टेनेंट Lark (अंतरराष्ट्रीय) पर है, तो डोमेन को `lark` (या पूर्ण डोमेन स्ट्रिंग) पर सेट करें। जोखिम मैट्रिक्स

### 5.1 संभावना बनाम प्रभाव

| थ्रेट ID      | संभावना | प्रभाव   | जोखिम स्तर   | Priority |
| ------------- | ------- | -------- | ------------ | -------- |
| T-EXEC-001    | उच्च    | गंभीर    | **गंभीर**    | P0       |
| T-PERSIST-001 | उच्च    | गंभीर    | **गंभीर**    | P0       |
| T-EXFIL-003   | Medium  | Critical | **Critical** | P0       |
| T-IMPACT-001  | Medium  | Critical | **High**     | P1       |
| T-EXEC-002    | High    | High     | **High**     | P1       |
| T-EXEC-004    | Medium  | High     | **High**     | P1       |
| T-ACCESS-003  | Medium  | High     | **High**     | P1       |
| T-EXFIL-001   | Medium  | High     | **High**     | P1       |
| T-IMPACT-002  | High    | Medium   | **High**     | P1       |
| T-EVADE-001   | High    | Medium   | **Medium**   | P2       |
| T-ACCESS-001  | Low     | High     | **Medium**   | P2       |
| T-ACCESS-002  | Low     | High     | **Medium**   | P2       |
| T-PERSIST-002 | Low     | High     | **Medium**   | P2       |

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

## 47. आप इसे `channels.feishu.domain` पर या प्रति खाते (`channels.feishu.accounts.<id>`
48. `.domain`) पर सेट कर सकते हैं। Recommendations Summary

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
| R-009 | कॉन्फ़िग अखंडता सत्यापन लागू करें                     | T-PERSIST-003 |
| R-010 | अपडेट साइनिंग और संस्करण पिनिंग जोड़ें                | T-PERSIST-002 |

---

## 50. गेटवे शुरू करें परिशिष्ट

### 7.1 ATLAS तकनीक मैपिंग

| ATLAS आईडी                                    | तकनीक का नाम                                       | OpenClaw ख़तरे                                                   |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | सक्रिय स्कैनिंग                                    | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | संग्रह                                             | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | आपूर्ति श्रृंखला: AI सॉफ़्टवेयर    | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | आपूर्ति श्रृंखला: डेटा             | T-PERSIST-003                                                    |
| AML.T0031                     | AI मॉडल अखंडता का क्षरण                            | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI मॉडल इन्फ़रेंस API एक्सेस                       | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | प्रतिकूल डेटा तैयार करना                           | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM प्रॉम्प्ट इंजेक्शन: प्रत्यक्ष  | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM प्रॉम्प्ट इंजेक्शन: अप्रत्यक्ष | T-EXEC-002                                                       |

### 7.2 प्रमुख सुरक्षा फ़ाइलें

| Path                                | उद्देश्य                    | जोखिम स्तर   |
| ----------------------------------- | --------------------------- | ------------ |
| `src/infra/exec-approvals.ts`       | कमांड अनुमोदन तर्क          | **गंभीर**    |
| `src/gateway/auth.ts`               | गेटवे प्रमाणीकरण            | **गंभीर**    |
| `src/web/inbound/access-control.ts` | चैनल एक्सेस नियंत्रण        | **गंभीर**    |
| `src/infra/net/ssrf.ts`             | SSRF सुरक्षा                | **Critical** |
| `src/security/external-content.ts`  | Prompt injection mitigation | **Critical** |
| `src/agents/sandbox/tool-policy.ts` | Tool policy enforcement     | **Critical** |
| `convex/lib/moderation.ts`          | ClawHub moderation          | **High**     |
| `convex/lib/skillPublish.ts`        | Skill publishing flow       | **High**     |
| `src/routing/resolve-route.ts`      | Session isolation           | **Medium**   |

### 7.3 Glossary

| Term                 | Definition                                                |
| -------------------- | --------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems       |
| **ClawHub**          | OpenClaw's skill marketplace                              |
| **Gateway**          | OpenClaw's message routing and authentication layer       |
| **MCP**              | Model Context Protocol - tool provider interface          |
| **Prompt Injection** | Attack where malicious instructions are embedded in input |
| **Skill**            | Downloadable extension for OpenClaw agents                |
| **SSRF**             | Server-Side Request Forgery                               |

---

_This threat model is a living document. Report security issues to security@openclaw.ai_
