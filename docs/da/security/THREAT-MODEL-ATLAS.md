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

| Komponent              | Included | Noter                                                            |
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

| Flow | Source  | Destination | Data                                         | Protection           |
| ---- | ------- | ----------- | -------------------------------------------- | -------------------- |
| F1   | Kanal   | Gateway     | User messages                                | TLS, AllowFrom       |
| F2   | Gateway | Agent       | Videresendte beskeder                        | Session isolation    |
| F3   | Agent   | Værktøjer   | Værktøjsinvokationer                         | Politikhåndhævelse   |
| F4   | Agent   | Ekstern     | web_fetch-forespørgsler | SSRF-blokering       |
| F5   | ClawHub | Agent       | Færdighedskode                               | Moderation, scanning |
| F6   | Agent   | Kanal       | Svar                                         | Outputfiltrering     |

---

## 3. Trusselsanalyse efter ATLAS-taktik

### 3.1 Rekognoscering (AML.TA0002)

#### T-RECON-001: Opdagelse af agentendepunkter

| Attribute                 | Værdi                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0006 - Aktiv scanning                                         |
| **Beskrivelse**           | Angriberen scanner efter eksponerede OpenClaw-gateway-endepunkter                  |
| **Angrebsvektor**         | Netværksscanning, Shodan-forespørgsler, DNS-opsummering                            |
| **Berørte komponenter**   | Gateway, eksponerede API-endepunkter                                               |
| **Nuværende afbødninger** | Tailscale-godkendelsesmulighed, bind til loopback som standard                     |
| **Resterende risiko**     | Middel - Offentlige gateways kan opdages                                           |
| **Anbefalinger**          | Dokumentér sikker udrulning, tilføj hastighedsbegrænsning på opdagelsesendepunkter |

#### T-RECON-002: Afprøvning af kanalintegration

| Attribut                  | Værdi                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0006 - Aktiv scanning                                    |
| **Beskrivelse**           | Angriberen afprøver beskedkanaler for at identificere AI-administrerede konti |
| **Angrebsvektor**         | Afsendelse af testbeskeder, observation af svarmønstre                        |
| **Berørte komponenter**   | Alle kanal-integrationer                                                      |
| **Nuværende afbødninger** | Ingen specifikke                                                              |
| **Resterende risiko**     | Low - Limited value from discovery alone                                      |
| **Anbefalinger**          | Overvej randomisering af svartiming                                           |

---

### 3.2 Indledende adgang (AML.TA0004)

#### T-ACCESS-001: Aflytning af parringskode

| Attribut                  | Værdi                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0040 - Adgang til AI-modelinference-API      |
| **Beskrivelse**           | Angriber opfanger parringskode i løbet af 30 sekunders frist      |
| **Angrebsvektor**         | Skulderkigning, netværkssniffing, social engineering              |
| **Affected Components**   | Enhedsparringssystem                                              |
| **Nuværende afbødninger** | 30 sek. udløb, koder sendt via eksisterende kanal |
| **Resterende risiko**     | Medium - Grace period exploitable                                 |
| **Anbefalinger**          | Reducer fristen, tilføj bekræftelsestrin                          |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribut                  | Værdi                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0040 - Adgang til AI-modelinference-API                      |
| **Beskrivelse**           | Attacker spoofs allowed sender identity in channel                                |
| **Angrebsvektor**         | Afhænger af kanal – telefonnummerforfalskning, brugernavns-efterligning           |
| **Berørte komponenter**   | AllowFrom-validering pr. kanal                                    |
| **Nuværende afbødninger** | Kanal-specifik identitetsverifikation                                             |
| **Resterende risiko**     | Middel – Nogle kanaler er sårbare over for forfalskning                           |
| **Anbefalinger**          | Dokumentér kanal-specifikke risici, tilføj kryptografisk verifikation hvor muligt |

#### T-ACCESS-003: Token-tyveri

| Attribute                 | Værdi                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **ATLAS ID**              | AML.T0040 - Adgang til AI-modelinference-API                        |
| **Beskrivelse**           | Angriber stjæler autentifikationstokens fra konfigurationsfiler                     |
| **Angrebsvektor**         | Malware, uautoriseret enhedsadgang, eksponering af konfigurationsbackups            |
| **Berørte komponenter**   | ~/.openclaw/credentials/, konfigurationslager       |
| **Nuværende afbødninger** | Filtilladelser                                                                      |
| **Resterende risiko**     | High - Tokens stored in plaintext                                                   |
| **Anbefalinger**          | 2. Implementér tokenkryptering i hvile, tilføj tokenrotation |

---

### 3. 3.3 Eksekvering (AML.TA0005)

#### T-EXEC-001: Direct Prompt Injection

| 5. Attribut                   | Værdi                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 6. **ATLAS ID**               | 7. AML.T0051.000 - LLM Prompt Injection: Direkte |
| 8. **Beskrivelse**            | 9. Angriber sender specialudformede prompts for at manipulere agentens adfærd                    |
| 10. **Angrebsvektor**         | 11. Kanalmeddelelser indeholdende modstridende instruktioner                                     |
| 12. **Berørte komponenter**   | Agent LLM, all input surfaces                                                                                           |
| 14. **Nuværende afbødninger** | 15. Mønstergenkendelse, indpakning af eksternt indhold                                           |
| **Residual Risk**                                    | 17. Kritisk - Kun detektion, ingen blokering; sofistikerede angreb omgås                         |
| **Anbefalinger**                                     | 18. Implementér flerlagsforsvar, outputvalidering, brugerbekræftelse for følsomme handlinger     |

#### 19. T-EXEC-002: Indirekte Prompt Injection

| 20. Attribut                  | Værdi                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 21. **ATLAS ID**              | 22. AML.T0051.001 - LLM Prompt Injection: Indirekte |
| 23. **Beskrivelse**           | 24. Angriber indlejrer ondsindede instruktioner i hentet indhold                                    |
| 25. **Angrebsvektor**         | 26. Ondsindede URL'er, forgiftede e-mails, kompromitterede webhooks                                 |
| 27. **Berørte komponenter**   | 28. web_fetch, e-mailindtagelse, eksterne datakilder                           |
| 29. **Nuværende afbødninger** | 30. Indpakning af indhold med XML-tags og sikkerhedsnotits                                          |
| 31. **Resterende risiko**     | 32. Høj - LLM kan ignorere indpakningsinstruktioner                                                 |
| **Anbefalinger**                                     | 33. Implementér indholdssanitering, separate eksekveringskontekster                                 |

#### 34. T-EXEC-003: Tool Argument Injection

| 35. Attribut                  | Værdi                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 36. **ATLAS ID**              | 37. AML.T0051.000 - LLM Prompt Injection: Direkte |
| 38. **Beskrivelse**           | 39. Angriber manipulerer værktøjsargumenter via prompt injection                                  |
| 40. **Angrebsvektor**         | 41. Specialudformede prompts, der påvirker værdier for værktøjsparametre                          |
| 42. **Berørte komponenter**   | 43. Alle værktøjsinvokationer                                                                     |
| 44. **Nuværende afbødninger** | 45. Eksekveringsgodkendelser for farlige kommandoer                                               |
| 46. **Resterende risiko**     | 47. Høj - Afhænger af brugerens dømmekraft                                                        |
| **Anbefalinger**                                     | 48. Implementér argumentvalidering, parameteriserede værktøjskald                                 |

#### 49. T-EXEC-004: Exec Approval Bypass

| 50. Attribut                 | Værdi                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. **ATLAS ID**              | 2. AML.T0043 - Udarbejdelse af adversarielle data |
| 3. **Beskrivelse**           | Attacker crafts commands that bypass approval allowlist                                  |
| 5. **Angrebsvektor**         | 6. Kommandoobfuskering, udnyttelse af aliaser, stihåndtering      |
| **Affected Components**                             | 8. exec-approvals.ts, kommando-allowlist          |
| 9. **Nuværende afbødninger** | 10. Allowlist + spørg-tilstand                                    |
| **Residual Risk**                                   | 12. Høj - Ingen kommandosanitetskontrol                           |
| **Anbefalinger**                                    | 13. Implementér kommandonormalisering, udvid blokeringslisten     |

---

### 14. 3.4 Persistens (AML.TA0006)

#### 15. T-PERSIST-001: Installation af ondsindet skill

| 16. Attribut                  | Værdi                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **ATLAS ID**                                         | 18. AML.T0010.001 - Forsyningskædekompromittering: AI-software |
| 19. **Beskrivelse**           | 20. Angriber udgiver ondsindet skill på ClawHub                                                                |
| 21. **Angrebsvektor**         | 22. Opret konto, udgiv skill med skjult ondsindet kode                                                         |
| 23. **Berørte komponenter**   | 24. ClawHub, indlæsning af skills, agenteksekvering                                                            |
| 25. **Nuværende afbødninger** | 26. Verifikation af GitHub-kontoens alder, mønsterbaserede moderationsflag                                     |
| 27. **Resterende risiko**     | 28. Kritisk - Ingen sandboxing, begrænset gennemgang                                                           |
| **Anbefalinger**                                     | 29. VirusTotal-integration (under udvikling), skill-sandboxing, community-gennemgang        |

#### 30. T-PERSIST-002: Forgiftning af skill-opdatering

| 31. Attribut                  | Værdi                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 32. **ATLAS ID**              | 33. AML.T0010.001 - Forsyningskædekompromittering: AI-software |
| 34. **Beskrivelse**           | 35. Angriber kompromitterer populær skill og udsender ondsindet opdatering                                     |
| 36. **Angrebsvektor**         | 37. Kontokompromittering, social engineering af skill-ejer                                                     |
| 38. **Berørte komponenter**   | 39. ClawHub-versionering, automatiske opdateringsflows                                                         |
| 40. **Nuværende afbødninger** | 41. Versionsfingeraftryk                                                                                       |
| 42. **Resterende risiko**     | 43. Høj - Automatiske opdateringer kan hente ondsindede versioner                                              |
| **Anbefalinger**                                     | 44. Implementér opdateringssignering, rollback-kapacitet, versionsfastlåsning                                  |

#### 45. T-PERSIST-003: Manipulation af agentkonfiguration

| 46. Attribut        | Værdi                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 47. **ATLAS ID**    | 48. AML.T0010.002 - Forsyningskædekompromittering: Data |
| 49. **Beskrivelse** | 50. Angriber ændrer agentkonfiguration for at opretholde adgang                                         |
| **Attack Vector**                          | Config file modification, settings injection                                                                                   |
| **Affected Components**                    | Agent config, tool policies                                                                                                    |
| **Current Mitigations**                    | Filtilladelser                                                                                                                 |
| **Residual Risk**                          | Medium - Requires local access                                                                                                 |
| **Anbefalinger**                           | Config integrity verification, audit logging for config changes                                                                |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute               | Værdi                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data                                        |
| **Description**         | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**       | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components** | ClawHub moderation.ts                                                     |
| **Current Mitigations** | Pattern-based FLAG_RULES                                             |
| **Residual Risk**       | High - Simple regex easily bypassed                                                       |
| **Anbefalinger**        | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | Værdi                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **Anbefalinger**        | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute               | Værdi                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access           |
| **Description**         | Attacker enumerates available tools through prompting               |
| **Attack Vector**       | "What tools do you have?" style queries                             |
| **Affected Components** | Agent tool registry                                                 |
| **Current Mitigations** | None specific                                                       |
| **Residual Risk**       | 4. Lav - Værktøjer er generelt dokumenterede |
| **Anbefalinger**        | 5. Overvej kontroller for værktøjssynlighed  |

#### 6. T-DISC-002: Udtrækning af sessionsdata

| Attribute                                          | Værdi                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 8. **ATLAS ID**             | 9. AML.T0040 - API-adgang til AI-modelinferens |
| 10. **Beskrivelse**         | 11. Angriber udtrækker følsomme data fra sessionskonteksten    |
| 12. **Angrebsvektor**       | 13. "Hvad diskuterede vi?"-forespørgsler, kontekstsondering    |
| 14. **Berørte komponenter** | Session transcripts, context window                                                   |
| **Current Mitigations**                            | 17. Sessionsisolering pr. afsender             |
| 18. **Resterende risiko**   | 19. Middel - Data inden for sessionen er tilgængelige          |
| **Anbefalinger**                                   | 20. Implementér redigering af følsomme data i konteksten       |

---

### 21. 3.7 Indsamling & Eksfiltration (AML.TA0009, AML.TA0010)

#### 22. T-EXFIL-001: Datatyveri via web_fetch

| 23. Attribut                  | Værdi                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 24. **ATLAS ID**              | 25. AML.T0009 - Indsamling                                     |
| 26. **Beskrivelse**           | Attacker exfiltrates data by instructing agent to send to external URL                                |
| 28. **Angrebsvektor**         | 29. Prompt injection, der får agenten til at POSTe data til angriberens server |
| 30. **Berørte komponenter**   | 31. web_fetch-værktøj                                     |
| 32. **Nuværende afbødninger** | 33. SSRF-blokering for interne netværk                                         |
| 34. **Resterende risiko**     | 35. Høj - Eksterne URL'er er tilladt                                           |
| **Anbefalinger**                                     | 36. Implementér URL-allowlisting og bevidsthed om dataklassificering           |

#### 37. T-EXFIL-002: Uautoriseret afsendelse af beskeder

| 38. Attribut                  | Værdi                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 39. **ATLAS ID**              | 40. AML.T0009 - Indsamling                                   |
| 41. **Beskrivelse**           | 42. Angriber får agenten til at sende beskeder, der indeholder følsomme data |
| 43. **Angrebsvektor**         | 44. Prompt injection, der får agenten til at sende beskeder til angriberen   |
| 45. **Berørte komponenter**   | 46. Beskedværktøj, kanal-integrationer                                       |
| 47. **Nuværende afbødninger** | 48. Begrænsning af udgående beskeder                                         |
| 49. **Resterende risiko**     | 50. Middel - Begrænsninger kan omgås                                         |
| **Anbefalinger**                                     | Require explicit confirmation for new recipients                                                    |

#### T-EXFIL-003: Credential Harvesting

| Attribute               | Værdi                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                  |
| **Description**         | Malicious skill harvests credentials from agent context |
| **Attack Vector**       | Skill code reads environment variables, config files    |
| **Affected Components** | Skill execution environment                             |
| **Current Mitigations** | None specific to skills                                 |
| **Residual Risk**       | Critical - Skills run with agent privileges             |
| **Anbefalinger**        | Skill sandboxing, credential isolation                  |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001: Unauthorized Command Execution

| Attribute               | Værdi                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker executes arbitrary commands on user system  |
| **Attack Vector**       | Prompt injection combined with exec approval bypass  |
| **Affected Components** | Bash tool, command execution                         |
| **Current Mitigations** | Exec approvals, Docker sandbox option                |
| **Residual Risk**       | Critical - Host execution without sandbox            |
| **Anbefalinger**        | Default to sandbox, improve approval UX              |

#### T-IMPACT-002: Resource Exhaustion (DoS)

| Attribute               | Værdi                                                |
| ----------------------- | ---------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity |
| **Description**         | Attacker exhausts API credits or compute resources   |
| **Attack Vector**       | Automated message flooding, expensive tool calls     |
| **Affected Components** | Gateway, agent sessions, API provider                |
| **Current Mitigations** | None                                                 |
| **Residual Risk**       | High - No rate limiting                              |
| **Anbefalinger**        | Implement per-sender rate limits, cost budgets       |

#### T-IMPACT-003: Reputation Damage

| Attribute               | Værdi                                                   |
| ----------------------- | ------------------------------------------------------- |
| **ATLAS ID**            | AML.T0031 - Erode AI Model Integrity    |
| **Description**         | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**       | Prompt injection causing inappropriate responses        |
| **Affected Components** | Output generation, channel messaging                    |
| **Current Mitigations** | LLM provider content policies                           |
| **Residual Risk**       | Medium - Provider filters imperfect                     |
| **Anbefalinger**        | Output filtering layer, user controls                   |

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

| ID    | Recommendation                                  | Addresses                  |
| ----- | ----------------------------------------------- | -------------------------- |
| R-001 | Complete VirusTotal integration                 | T-PERSIST-001, T-EVADE-001 |
| R-002 | Implement skill sandboxing                      | T-PERSIST-001, T-EXFIL-003 |
| R-003 | Tilføj outputvalidering for følsomme handlinger | T-EXEC-001, T-EXEC-002     |

### 6.2 Kort sigt (P1)

| ID    | Anbefaling                                                      | Adresserer   |
| ----- | --------------------------------------------------------------- | ------------ |
| R-004 | Implementér hastighedsbegrænsning                               | T-IMPACT-002 |
| R-005 | Tilføj kryptering af tokens i hvile                             | T-ACCESS-003 |
| R-006 | Forbedr UX og validering for exec-godkendelse                   | T-EXEC-004   |
| R-007 | Implementér URL-allowlisting for web_fetch | T-EXFIL-001  |

### 6.3 Mellemlang sigt (P2)

| ID    | Anbefaling                                                 | Adresserer    |
| ----- | ---------------------------------------------------------- | ------------- |
| R-008 | Tilføj kryptografisk kanalverifikation, hvor det er muligt | T-ACCESS-002  |
| R-009 | Implementér verifikation af konfigurationsintegritet       | T-PERSIST-003 |
| R-010 | Tilføj signering af opdateringer og versionsfastlåsning    | T-PERSIST-002 |

---

## 7. Bilag

### 7.1 ATLAS-teknikkortlægning

| ATLAS-ID                                      | Tekniknavn                                     | OpenClaw-trusler                                                 |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | Aktiv scanning                                 | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | Indsamling                                     | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | Forsyningskæde: AI-software    | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | Supply Chain: Data             | T-PERSIST-003                                                    |
| AML.T0031                     | Erode AI Model Integrity                       | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI Model Inference API Access                  | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | Craft Adversarial Data                         | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM Prompt Injection: Direct   | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM Prompt Injection: Indirect | T-EXEC-002                                                       |

### 7.2 Key Security Files

| Sti                                 | Formål                      | Risk Level   |
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

| Term                 | Definition                                              |
| -------------------- | ------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems     |
| **ClawHub**          | OpenClaw's skill marketplace                            |
| **Gateway**          | OpenClaw's message routing and authentication layer     |
| **MCP**              | Model Context Protocol – værktøjsudbydergrænseflade     |
| **Prompt Injection** | Angreb, hvor ondsindede instruktioner indlejres i input |
| **Skill**            | Downloadbar udvidelse til OpenClaw-agenter              |
| **SSRF**             | Server-Side Request Forgery                             |

---

_This threat model is a living document. Rapportér sikkerhedsproblemer til security@openclaw.ai
