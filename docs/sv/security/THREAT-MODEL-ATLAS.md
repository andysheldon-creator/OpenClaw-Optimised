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

| Komponent              | Included | Anteckningar                                                     |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime | Ja       | Core agent execution, tool calls, sessions                       |
| Gateway                | Ja       | Authentication, routing, channel integration                     |
| Channel Integrations   | Ja       | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace    | Ja       | Skill publishing, moderation, distribution                       |
| MCP Servers            | Ja       | External tool providers                                          |
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

| Flow | Source  | Destination | Data                                    | Protection           |
| ---- | ------- | ----------- | --------------------------------------- | -------------------- |
| F1   | Channel | Gateway     | User messages                           | TLS, AllowFrom       |
| F2   | Gateway | Agent       | Routed messages                         | Session isolation    |
| F3   | Agent   | Verktyg     | Tool invocations                        | Policy enforcement   |
| F4   | Agent   | External    | web_fetch requests | SSRF blocking        |
| F5   | ClawHub | Agent       | Skill code                              | Moderation, scanning |
| F6   | Agent   | Channel     | Svar                                    | Output filtering     |

---

## 3. Threat Analysis by ATLAS Tactic

### 3.1 Reconnaissance (AML.TA0002)

#### T-RECON-001: Agent Endpoint Discovery

| Attribute               | Värde                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0006 - Active Scanning                          |
| **Description**         | Attacker scans for exposed OpenClaw gateway endpoints                |
| **Attack Vector**       | Network scanning, shodan queries, DNS enumeration                    |
| **Affected Components** | Gateway, exposed API endpoints                                       |
| **Current Mitigations** | Tailscale auth option, bind to loopback by default                   |
| **Residual Risk**       | Medium - Public gateways discoverable                                |
| **Rekommendationer**    | Document secure deployment, add rate limiting on discovery endpoints |

#### T-RECON-002: Channel Integration Probing

| Attribute               | Värde                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0006 - Active Scanning                        |
| **Description**         | Attacker probes messaging channels to identify AI-managed accounts |
| **Attack Vector**       | Sending test messages, observing response patterns                 |
| **Affected Components** | All channel integrations                                           |
| **Current Mitigations** | None specific                                                      |
| **Residual Risk**       | Low - Limited value from discovery alone                           |
| **Rekommendationer**    | Consider response timing randomization                             |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute               | Värde                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**       | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components** | Device pairing system                                     |
| **Current Mitigations** | 30s expiry, codes sent via existing channel               |
| **Residual Risk**       | Medium - Grace period exploitable                         |
| **Rekommendationer**    | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute               | Värde                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **Rekommendationer**    | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute               | Värde                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                |
| **Description**         | Attacker steals authentication tokens from config files                  |
| **Attack Vector**       | Malware, unauthorized device access, config backup exposure              |
| **Affected Components** | ~/.openclaw/credentials/, config storage |
| **Current Mitigations** | Filbehörigheter                                                          |
| **Residual Risk**       | High - Tokens stored in plaintext                                        |
| **Rekommendationer**    | Implement token encryption at rest, add token rotation                   |

---

### 3.3 Execution (AML.TA0005)

#### T-EXEC-001: Direct Prompt Injection

| Attribute               | Värde                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker sends crafted prompts to manipulate agent behavior                                  |
| **Attack Vector**       | Channel messages containing adversarial instructions                                         |
| **Affected Components** | Agent LLM, all input surfaces                                                                |
| **Current Mitigations** | Pattern detection, external content wrapping                                                 |
| **Residual Risk**       | Critical - Detection only, no blocking; sophisticated attacks bypass                         |
| **Rekommendationer**    | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Värde                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **Rekommendationer**    | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Värde                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Rekommendationer**    | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | Värde                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **Rekommendationer**    | Implement command normalization, expand blocklist          |

---

### 3.4 Persistence (AML.TA0006)

#### T-PERSIST-001: Malicious Skill Installation

| Attribute               | Värde                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker publishes malicious skill to ClawHub                                                        |
| **Attack Vector**       | Create account, publish skill with hidden malicious code                                             |
| **Affected Components** | ClawHub, skill loading, agent execution                                                              |
| **Current Mitigations** | GitHub account age verification, pattern-based moderation flags                                      |
| **Residual Risk**       | Critical - No sandboxing, limited review                                                             |
| **Rekommendationer**    | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | Värde                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **Rekommendationer**    | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute                 | Värde                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**           | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**         | Config file modification, settings injection                                                  |
| **Påverkade komponenter** | Agentkonfiguration, verktygspolicyer                                                          |
| **Nuvarande motåtgärder** | Filbehörigheter                                                                               |
| **Kvarstående risk**      | Medium - Requires local access                                                                |
| **Rekommendationer**      | Verifiering av konfigurationsintegritet, revisionsloggning för konfigurationsändringar        |

---

### 3.5 Försvarsförbigående (AML.TA0007)

#### T-EVADE-001: Kringgående av modereringsmönster

| Attribut                  | Värde                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS-ID**              | AML.T0043 - Craft Adversarial Data                                             |
| **Beskrivning**           | Angriparen utformar färdighetsinnehåll för att undvika modereringsmönster                      |
| **Attackvektor**          | Unicode homoglyphs, encoding tricks, dynamic loading                                           |
| **Påverkade komponenter** | ClawHub moderation.ts                                                          |
| **Nuvarande motåtgärder** | Mönsterbaserade FLAG_RULES                                                |
| **Kvarstående risk**      | Hög – Enkla regex kan lätt kringgås                                                            |
| **Rekommendationer**      | Lägg till beteendeanalys (VirusTotal Code Insight), AST-baserad detektering |

#### T-EVADE-002: Undanflykt från innehållsomslag

| Attribut                  | Värde                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| **ATLAS-ID**              | AML.T0043 - Skapa antagonistiska data               |
| **Description**           | Angriparen utformar innehåll som undkommer XML-omslagskontexten     |
| **Attackvektor**          | Taggmanipulation, kontextförvirring, åsidosättning av instruktioner |
| **Påverkade komponenter** | Extern innehållsomslagning                                          |
| **Nuvarande motåtgärder** | XML-taggar + säkerhetsmeddelande                                    |
| **Kvarstående risk**      | Medel – Nya undanflykter upptäcks regelbundet                       |
| **Rekommendationer**      | Flera omslagslager, validering på utgångssidan                      |

---

### 3.6 Upptäckt (AML.TA0008)

#### T-DISC-001: Verktygsinventering

| Attribut                  | Värde                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| **ATLAS-ID**              | AML.T0040 - Åtkomst till AI-modellens inferens-API |
| **Beskrivning**           | Angriparen inventerar tillgängliga verktyg genom prompting         |
| **Attackvektor**          | "Vilka verktyg har du?"-liknande frågor                            |
| **Påverkade komponenter** | Agentens verktygsregister                                          |
| **Current Mitigations**   | None specific                                                      |
| **Residual Risk**         | 4. Låg – Verktyg är generellt dokumenterade |
| **Rekommendationer**      | Consider tool visibility controls                                  |

#### T-DISC-002: Session Data Extraction

| Attribute                                            | Värde                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 8. **ATLAS-ID**               | 9. AML.T0040 – API-åtkomst för AI-modellinferens |
| 10. **Beskrivning**           | 11. Angripare extraherar känslig data från sessionskontext       |
| **Attack Vector**                                    | 13. Frågor som ”Vad diskuterade vi?”, kontextsondering           |
| 14. **Påverkade komponenter** | 15. Sessionsutskrifter, kontextfönster                           |
| 16. **Nuvarande motåtgärder** | Session isolation per sender                                                            |
| 18. **Kvarstående risk**      | Medium - Within-session data accessible                                                 |
| **Rekommendationer**                                 | Implement sensitive data redaction in context                                           |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### 22. T-EXFIL-001: Datastöld via web_fetch

| 23. Attribut                  | Värde                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 24. **ATLAS-ID**              | 25. AML.T0009 – Insamling                                                    |
| 26. **Beskrivning**           | 27. Angripare exfiltrerar data genom att instruera agenten att skicka till extern URL        |
| 28. **Angreppsvektor**        | 29. Prompt injection som får agenten att POST:a data till angriparens server |
| 30. **Påverkade komponenter** | 31. web_fetch-verktyget                                                 |
| 32. **Nuvarande motåtgärder** | 33. SSRF-blockering för interna nätverk                                                      |
| 34. **Kvarstående risk**      | 35. Hög – Externa URL:er är tillåtna                                         |
| **Rekommendationer**                                 | 36. Implementera URL-allowlisting, medvetenhet om dataklassificering                         |

#### 37. T-EXFIL-002: Obehörig meddelandesändning

| 38. Attribut                  | Värde                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 39. **ATLAS-ID**              | 40. AML.T0009 – Insamling                                    |
| 41. **Beskrivning**           | 42. Angripare får agenten att skicka meddelanden som innehåller känslig data |
| 43. **Angreppsvektor**        | 44. Prompt injection som får agenten att skicka meddelanden till angriparen  |
| 45. **Påverkade komponenter** | 46. Meddelandeverktyg, kanalintegrationer                                    |
| 47. **Nuvarande motåtgärder** | 48. Styrning av utgående meddelanden                                         |
| 49. **Kvarstående risk**      | 50. Medel – Styrningen kan kringgås                                          |
| **Rekommendationer**                                 | Require explicit confirmation for new recipients                                                    |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | Värde                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **Rekommendationer**    | Skill sandboxing, credential isolation                  |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001: Unauthorized Command Execution

| Attribute               | Värde                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker executes arbitrary commands on user system  |
| **Attack Vector**       | Prompt injection combined with exec approval bypass  |
| **Affected Components** | Bash tool, command execution                         |
| **Current Mitigations** | Exec approvals, Docker sandbox option                |
| **Residual Risk**       | Critical - Host execution without sandbox            |
| **Rekommendationer**    | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | Värde                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **Rekommendationer**    | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute               | Värde                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity    |
| **Description**         | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**       | Prompt injection causing inappropriate responses        |
| **Affected Components** | Output generation, channel messaging                    |
| **Current Mitigations** | LLM provider content policies                           |
| **Residual Risk**       | Medium - Provider filters imperfect                     |
| **Rekommendationer**    | Output filtering layer, user controls                   |

---

## 4. ClawHub Supply Chain Analysis

### 4.1 Current Security Controls

| Control                           | Implementering                                                   | Effectiveness                                        |
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

| Threat ID     | Likelihood | Impact   | Risk Level   | Priority |
| ------------- | ---------- | -------- | ------------ | -------- |
| T-EXEC-001    | High       | Critical | **Critical** | P0       |
| T-PERSIST-001 | High       | Critical | **Critical** | P0       |
| T-EXFIL-003   | Medium     | Critical | **Critical** | P0       |
| T-IMPACT-001  | Medium     | Critical | **High**     | P1       |
| T-EXEC-002    | High       | High     | **High**     | P1       |
| T-EXEC-004    | Medium     | High     | **High**     | P1       |
| T-ACCESS-003  | Medium     | High     | **Hög**      | P1       |
| T-EXFIL-001   | Medel      | Hög      | **Hög**      | P1       |
| T-IMPACT-002  | Hög        | Medel    | **Hög**      | P1       |
| T-EVADE-001   | Hög        | Medel    | **Medel**    | P2       |
| T-ACCESS-001  | Låg        | Hög      | **Medel**    | P2       |
| T-ACCESS-002  | Låg        | Hög      | **Medel**    | P2       |
| T-PERSIST-002 | Låg        | Hög      | **Medel**    | P2       |

### 5.2 Kritiska attackkedjor

**Attackkedja 1: Färdighetsbaserad datastöld**

```
T-PERSIST-001 → T-EVADE-001 → T-EXFIL-003
(Publicera skadlig färdighet) → (Undvik moderering) → (Skörda autentiseringsuppgifter)
```

**Attackkedja 2: Prompt-injektion till RCE**

```
T-EXEC-001 → T-EXEC-004 → T-IMPACT-001
(Injectera prompt) → (Kringgå körningsgodkännande) → (Kör kommandon)
```

**Attackkedja 3: Indirekt injektion via hämtat innehåll**

```
T-EXEC-002 → T-EXFIL-001 → Extern exfiltrering
(Förgifta URL-innehåll) → (Agenten hämtar och följer instruktioner) → (Data skickas till angripare)
```

---

## 6. Sammanfattning av rekommendationer

### 6.1 Omedelbart (P0)

| ID    | Rekommendation                                    | Adresserar                 |
| ----- | ------------------------------------------------- | -------------------------- |
| R-001 | Slutför VirusTotal-integration                    | T-PERSIST-001, T-EVADE-001 |
| R-002 | Implementera sandboxning av färdigheter           | T-PERSIST-001, T-EXFIL-003 |
| R-003 | Lägg till utdata­validering för känsliga åtgärder | T-EXEC-001, T-EXEC-002     |

### 6.2 Kortsiktigt (P1)

| ID    | Rekommendation                                                   | Adresser     |
| ----- | ---------------------------------------------------------------- | ------------ |
| R-004 | Implement rate limiting                                          | T-IMPACT-002 |
| R-005 | Lägg till tokenkryptering i vila                                 | T-ACCESS-003 |
| R-006 | Förbättra UX för exec-godkännande och validering                 | T-EXEC-004   |
| R-007 | Implementera URL-tillåtslista för web_fetch | T-EXFIL-001  |

### 6.3 Medellång sikt (P2)

| ID    | Rekommendation                                              | Adresser      |
| ----- | ----------------------------------------------------------- | ------------- |
| R-008 | Lägg till kryptografisk kanalverifiering där det är möjligt | T-ACCESS-002  |
| R-009 | Implementera verifiering av konfigurationsintegritet        | T-PERSIST-003 |
| R-010 | Lägg till signering av uppdateringar och versionslåsning    | T-PERSIST-002 |

---

## 7. Bilagor

### 7.1 ATLAS-teknikkartläggning

| ATLAS-ID                                      | Tekniknamn                                    | OpenClaw-hot                                                     |
| --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | Aktiv skanning                                | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | Insamling                                     | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | Leveranskedja: AI-programvara | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | Leveranskedja: Data           | T-PERSIST-003                                                    |
| AML.T0031                     | Underminera AI-modellens integritet           | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | Åtkomst till AI-modellens inferens-API        | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | Skapa adversariella data                      | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM-promptinjektion: Direkt   | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM-promptinjektion: Indirekt | T-EXEC-002                                                       |

### 7.2 Viktiga säkerhetsfiler

| Sökväg                              | Syfte                          | Risknivå    |
| ----------------------------------- | ------------------------------ | ----------- |
| `src/infra/exec-approvals.ts`       | Logik för kommando-godkännande | **Kritisk** |
| `src/gateway/auth.ts`               | Gateway-autentisering          | **Kritisk** |
| `src/web/inbound/access-control.ts` | Åtkomstkontroll för kanaler    | **Kritisk** |
| `src/infra/net/ssrf.ts`             | SSRF-skydd                     | **Kritisk** |
| `src/security/external-content.ts`  | Åtgärder mot promptinjektion   | **Kritisk** |
| `src/agents/sandbox/tool-policy.ts` | Efterlevnad av verktygspolicy  | **Kritisk** |
| `convex/lib/moderation.ts`          | ClawHub-moderering             | **High**    |
| `convex/lib/skillPublish.ts`        | Skill publishing flow          | **Hög**     |
| `src/routing/resolve-route.ts`      | Sessionsisolering              | **Medel**   |

### 7.3 Ordlista

| Term                 | Definition                                                |
| -------------------- | --------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems       |
| **ClawHub**          | OpenClaws marknadsplats för färdigheter                   |
| **Gateway**          | OpenClaws meddelanderoutning och autentiseringslager      |
| **MCP**              | Model Context Protocol - tool provider interface          |
| **Prompt Injection** | Attack where malicious instructions are embedded in input |
| **Skill**            | Downloadable extension for OpenClaw agents                |
| **SSRF**             | Server-Side Request Forgery                               |

---

_This threat model is a living document. Report security issues to security@openclaw.ai_
