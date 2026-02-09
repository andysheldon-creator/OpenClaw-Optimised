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

| Composant                               | Included | Remarques                                                        |
| --------------------------------------- | -------- | ---------------------------------------------------------------- |
| OpenClaw Agent Runtime                  | Oui      | Core agent execution, tool calls, sessions                       |
| Gateway (passerelle) | Oui      | Authentication, routing, channel integration                     |
| Channel Integrations                    | Oui      | WhatsApp, Telegram, Discord, Signal, Slack, etc. |
| ClawHub Marketplace                     | Oui      | Skill publishing, moderation, distribution                       |
| MCP Servers                             | Oui      | External tool providers                                          |
| User Devices                            | Partial  | Mobile apps, desktop clients                                     |

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

| Flow | Source                                  | Destination                             | Data                                    | Protection                 |
| ---- | --------------------------------------- | --------------------------------------- | --------------------------------------- | -------------------------- |
| F1   | Canal                                   | Gateway (passerelle) | Messages utilisateur                    | TLS, AllowFrom             |
| F2   | Gateway (passerelle) | Agent                                   | Messages routés                         | Isolation de session       |
| F3   | Agent                                   | Outils                                  | Tool invocations                        | Application des politiques |
| F4   | Agent                                   | Externe                                 | Requêtes web_fetch | SSRF blocking              |
| F5   | ClawHub                                 | Agent                                   | Code de compétence                      | Modération, analyse        |
| F6   | Agent                                   | Canal                                   | Réponses                                | Filtrage de sortie         |

---

## 3. Analyse des menaces par tactique ATLAS

### 3.1 Reconnaissance (AML.TA0002)

#### T-RECON-001 : Découverte des points de terminaison de l’agent

| Attribut                 | Valeur                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **ID ATLAS**             | AML.T0006 - Analyse active                                                                      |
| **Description**          | L’attaquant analyse les points de terminaison exposés de la passerelle OpenClaw                                 |
| **Vecteur d’attaque**    | Analyse réseau, requêtes Shodan, énumération DNS                                                                |
| **Composants affectés**  | Passerelle, points de terminaison d’API exposés                                                                 |
| **Current Mitigations**  | Option d’authentification Tailscale, liaison à l’interface loopback par défaut                                  |
| **Residual Risk**        | Moyen - Passerelles publiques découvrables                                                                      |
| \*\*Recommandations \*\* | Documenter un déploiement sécurisé, ajouter une limitation de débit sur les points de terminaison de découverte |

#### T-RECON-002 : Sondage de l’intégration des canaux

| Attribut                 | Valeur                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **ID ATLAS**             | AML.T0006 - Analyse active                                            |
| **Description**          | L’attaquant sonde les canaux de messagerie pour identifier les comptes gérés par l’IA |
| **Vecteur d’attaque**    | Envoi de messages de test, observation des schémas de réponse                         |
| **Affected Components**  | All channel integrations                                                              |
| **Current Mitigations**  | None specific                                                                         |
| **Residual Risk**        | Low - Limited value from discovery alone                                              |
| \*\*Recommandations \*\* | Consider response timing randomization                                                |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute                | Valeur                                                    |
| ------------------------ | --------------------------------------------------------- |
| **ATLAS ID**             | AML.T0040 - AI Model Inference API Access |
| **Description**          | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**        | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components**  | Device pairing system                                     |
| **Current Mitigations**  | 30s expiry, codes sent via existing channel               |
| **Residual Risk**        | Medium - Grace period exploitable                         |
| \*\*Recommandations \*\* | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute                | Valeur                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| **ATLAS ID**             | AML.T0040 - AI Model Inference API Access                      |
| **Description**          | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**        | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components**  | AllowFrom validation per channel                                               |
| **Current Mitigations**  | Channel-specific identity verification                                         |
| **Residual Risk**        | Medium - Some channels vulnerable to spoofing                                  |
| \*\*Recommandations \*\* | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute                | Valeur                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **ATLAS ID**             | AML.T0040 - AI Model Inference API Access                                                    |
| **Description**          | Attacker steals authentication tokens from config files                                                      |
| **Attack Vector**        | Malware, unauthorized device access, config backup exposure                                                  |
| **Affected Components**  | ~/.openclaw/credentials/, config storage                                     |
| **Current Mitigations**  | Permissions de fichiers                                                                                      |
| **Residual Risk**        | 1. Élevé - Jetons stockés en clair                                                    |
| \*\*Recommandations \*\* | 2. Mettre en œuvre le chiffrement des jetons au repos, ajouter la rotation des jetons |

---

### 3. 3.3 Exécution (AML.TA0005)

#### 4. T-EXEC-001 : Injection directe de prompt

| 5. Attribut                             | Valeur                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6. **ID ATLAS**                         | 7. AML.T0051.000 - Injection de prompt LLM : Directe                           |
| **Description**                                                | 9. L’attaquant envoie des prompts conçus pour manipuler le comportement de l’agent                                             |
| 10. **Vecteur d’attaque**               | 11. Messages de canal contenant des instructions adverses                                                                      |
| 12. **Composants affectés**             | 13. Agent LLM, toutes les surfaces d’entrée                                                                                    |
| 14. **Mesures d’atténuation actuelles** | 15. Détection de motifs, encapsulation de contenu externe                                                                      |
| 16. **Risque résiduel**                 | 17. Critique - Détection uniquement, aucun blocage ; des attaques sophistiquées contournent                                    |
| \*\*Recommandations \*\*                                       | 18. Mettre en œuvre une défense multicouche, la validation des sorties, la confirmation utilisateur pour les actions sensibles |

#### 19. T-EXEC-002 : Injection indirecte de prompt

| Attribute                                                      | Valeur                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 21. **ID ATLAS**                        | 22. AML.T0051.001 - Injection de prompt LLM : Indirecte |
| 23. **Description**                     | 24. L’attaquant intègre des instructions malveillantes dans du contenu récupéré                         |
| 25. **Vecteur d’attaque**               | 26. URL malveillantes, e-mails empoisonnés, webhooks compromis                                          |
| 27. **Composants affectés**             | 28. web_fetch, ingestion d’e-mails, sources de données externes                    |
| 29. **Mesures d’atténuation actuelles** | 30. Encapsulation du contenu avec des balises XML et un avis de sécurité                                |
| 31. **Risque résiduel**                 | 32. Élevé - Le LLM peut ignorer les instructions d’encapsulation                                        |
| \*\*Recommandations \*\*                                       | 33. Mettre en œuvre la sanitisation du contenu, des contextes d’exécution séparés                       |

#### 34. T-EXEC-003 : Injection d’arguments d’outil

| 35. Attribut                            | Valeur                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 36. **ID ATLAS**                        | 37. AML.T0051.000 - Injection de prompt LLM : Directe |
| 38. **Description**                     | 39. L’attaquant manipule les arguments des outils via l’injection de prompt                           |
| 40. **Vecteur d’attaque**               | 41. Prompts conçus pour influencer les valeurs des paramètres des outils                              |
| 42. **Composants affectés**             | 43. Toutes les invocations d’outils                                                                   |
| 44. **Mesures d’atténuation actuelles** | 45. Approbations d’exécution pour les commandes dangereuses                                           |
| 46. **Risque résiduel**                 | 47. Élevé - Dépend du jugement de l’utilisateur                                                       |
| \*\*Recommandations \*\*                                       | 48. Mettre en œuvre la validation des arguments, des appels d’outils paramétrés                       |

#### 49. T-EXEC-004 : Contournement de l’approbation d’exécution

| 50. Attribut | Valeur                                                     |
| ----------------------------------- | ---------------------------------------------------------- |
| **ATLAS ID**                        | AML.T0043 - Craft Adversarial Data         |
| **Description**                     | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**                   | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components**             | exec-approvals.ts, command allowlist       |
| **Current Mitigations**             | Allowlist + ask mode                                       |
| **Residual Risk**                   | High - No command sanitization                             |
| \*\*Recommandations \*\*            | Implement command normalization, expand blocklist          |

---

### 3.4 Persistence (AML.TA0006)

#### T-PERSIST-001: Malicious Skill Installation

| Attribute                | Valeur                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**          | Attacker publishes malicious skill to ClawHub                                                        |
| **Attack Vector**        | Create account, publish skill with hidden malicious code                                             |
| **Affected Components**  | ClawHub, skill loading, agent execution                                                              |
| **Current Mitigations**  | GitHub account age verification, pattern-based moderation flags                                      |
| **Residual Risk**        | Critical - No sandboxing, limited review                                                             |
| \*\*Recommandations \*\* | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute                | Valeur                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**          | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**        | Account compromise, social engineering of skill owner                                                |
| **Affected Components**  | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations**  | Version fingerprinting                                                                               |
| **Residual Risk**        | High - Auto-updates may pull malicious versions                                                      |
| \*\*Recommandations \*\* | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute                | Valeur                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**          | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**        | Config file modification, settings injection                                                  |
| **Affected Components**  | Agent config, tool policies                                                                   |
| **Current Mitigations**  | Permissions de fichiers                                                                       |
| **Residual Risk**        | Medium - Requires local access                                                                |
| \*\*Recommandations \*\* | Config integrity verification, audit logging for config changes                               |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute                | Valeur                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0043 - Craft Adversarial Data                                        |
| **Description**          | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**        | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components**  | ClawHub moderation.ts                                                     |
| **Current Mitigations**  | Pattern-based FLAG_RULES                                             |
| **Residual Risk**        | High - Simple regex easily bypassed                                                       |
| \*\*Recommandations \*\* | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute                | Valeur                                                    |
| ------------------------ | --------------------------------------------------------- |
| **ATLAS ID**             | AML.T0043 - Craft Adversarial Data        |
| **Description**          | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**        | Tag manipulation, context confusion, instruction override |
| **Affected Components**  | External content wrapping                                 |
| **Current Mitigations**  | XML tags + security notice                                |
| **Residual Risk**        | Medium - Novel escapes discovered regularly               |
| \*\*Recommandations \*\* | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute                | Valeur                                                    |
| ------------------------ | --------------------------------------------------------- |
| **ATLAS ID**             | AML.T0040 - AI Model Inference API Access |
| **Description**          | Attacker enumerates available tools through prompting     |
| **Attack Vector**        | "What tools do you have?" style queries                   |
| **Affected Components**  | Agent tool registry                                       |
| **Current Mitigations**  | None specific                                             |
| **Residual Risk**        | Low - Tools generally documented                          |
| \*\*Recommandations \*\* | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute                | Valeur                                                    |
| ------------------------ | --------------------------------------------------------- |
| **ATLAS ID**             | AML.T0040 - AI Model Inference API Access |
| **Description**          | Attacker extracts sensitive data from session context     |
| **Attack Vector**        | "What did we discuss?" queries, context probing           |
| **Affected Components**  | Session transcripts, context window                       |
| **Current Mitigations**  | Session isolation per sender                              |
| **Residual Risk**        | Medium - Within-session data accessible                   |
| \*\*Recommandations \*\* | Implement sensitive data redaction in context             |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Data Theft via web_fetch

| Attribute                | Valeur                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0009 - Collection                                 |
| **Description**          | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**        | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components**  | web_fetch tool                                    |
| **Current Mitigations**  | SSRF blocking for internal networks                                    |
| **Residual Risk**        | High - External URLs permitted                                         |
| \*\*Recommandations \*\* | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute                | Valeur                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| **ATLAS ID**             | AML.T0009 - Collection                           |
| **Description**          | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**        | Prompt injection causing agent to message attacker               |
| **Affected Components**  | Message tool, channel integrations                               |
| **Current Mitigations**  | Outbound messaging gating                                        |
| **Residual Risk**        | Medium - Gating may be bypassed                                  |
| \*\*Recommandations \*\* | Require explicit confirmation for new recipients                 |

#### T-EXFIL-003: Credential Harvesting

| Attribut                 | Valeur                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **ID ATLAS**             | AML.T0009 - Collecte                                                      |
| **Description**          | La compétence malveillante collecte des identifiants depuis le contexte de l’agent        |
| **Vecteur d’attaque**    | Le code de la compétence lit les variables d’environnement, les fichiers de configuration |
| **Affected Components**  | Environnement d’exécution des compétences                                                 |
| **Current Mitigations**  | Aucune sp�écifique aux compétences                                                        |
| **Risque résiduel**      | Critique - Les compétences s’exécutent avec les privilèges de l’agent                     |
| \*\*Recommandations \*\* | Isolation des compétences (sandboxing), isolement des identifiants     |

---

### 3.8 Impact (AML.TA0011)

#### T-IMPACT-001&#xA;: Exécution de commandes non autorisée

| Attribut                            | Valeur                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| **ID ATLAS**                        | AML.T0031 - Erode AI Model Integrity                          |
| **Description**                     | L’attaquant exécute des commandes arbitraires sur le système de l’utilisateur |
| **Vecteur d’attaque**               | Injection de prompt combinée à un contournement de l’approbation d’exécution  |
| **Composants affectés**             | Outil Bash, exécution de commandes                                            |
| **Mesures d’atténuation actuelles** | Approbations d’exécution, option de sandbox Docker                            |
| **Residual Risk**                   | Critique - Exécution sur l’hôte sans sandbox                                  |
| \*\*Recommandations \*\*            | Utiliser le sandbox par défaut, améliorer l’UX d’approbation                  |

#### T-IMPACT-002&#xA;: Épuisement des ressources (DoS)

| Attribut                            | Valeur                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| **ATLAS ID**                        | AML.T0031 - Érosion de l’intégrité du modèle d’IA         |
| **Description**                     | L’attaquant épuise les crédits API ou les ressources de calcul            |
| **Vecteur d’attaque**               | Inondation automatisée de messages, appels d’outils coûteux               |
| **Composants affectés**             | Passerelle, sessions d’agent, fournisseur d’API                           |
| **Mesures d’atténuation actuelles** | Aucune                                                                    |
| **Risque résiduel**                 | Élevé - Aucun contrôle de débit                                           |
| \*\*Recommandations \*\*            | Mettre en œuvre des limites de débit par expéditeur, des budgets de coûts |

#### T-IMPACT-003&#xA;: Atteinte à la réputation

| Attribut                 | Valeur                                                  |
| ------------------------ | ------------------------------------------------------- |
| **ID ATLAS**             | AML.T0031 - Erode AI Model Integrity    |
| **Description**          | Attacker causes agent to send harmful/offensive content |
| **Attack Vector**        | Prompt injection causing inappropriate responses        |
| **Affected Components**  | Output generation, channel messaging                    |
| **Current Mitigations**  | LLM provider content policies                           |
| **Residual Risk**        | Medium - Provider filters imperfect                     |
| \*\*Recommandations \*\* | Output filtering layer, user controls                   |

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

| Improvement                   | Statut                                                   | Impact                                                               |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| VirusTotal Integration        | En cours                                                 | Élevé - Analyse comportementale Code Insight                         |
| Signalement par la communauté | Partiel (`skillReports` table exists) | Moyen                                                                |
| Journalisation des audits     | Partiel (`auditLogs` table exists)    | Moyen                                                                |
| Système de badges             | Implémenté                                               | Moyen - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. Matrice des risques

### 5.1 Probabilité vs Impact

| ID de menace  | Probabilité | Impact   | Niveau de risque | Priorité |
| ------------- | ----------- | -------- | ---------------- | -------- |
| T-EXEC-001    | Élevé       | Critical | **Critique**     | P0       |
| T-PERSIST-001 | Élevé       | Critique | **Critique**     | P0       |
| T-EXFIL-003   | Moyen       | Critique | **Critical**     | P0       |
| T-IMPACT-001  | Moyen       | Critique | **Élevé**        | P1       |
| T-EXEC-002    | Élevé       | Élevé    | **Élevé**        | P1       |
| T-EXEC-004    | Medium      | Élevé    | **Élevé**        | P1       |
| T-ACCESS-003  | Medium      | High     | **High**         | P1       |
| T-EXFIL-001   | Medium      | High     | **High**         | P1       |
| T-IMPACT-002  | High        | Medium   | **High**         | P1       |
| T-EVADE-001   | High        | Medium   | **Medium**       | P2       |
| T-ACCESS-001  | Low         | High     | **Medium**       | P2       |
| T-ACCESS-002  | Low         | High     | **Medium**       | P2       |
| T-PERSIST-002 | Low         | High     | **Medium**       | P2       |

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

| Chemin d'accès                      | Objectif                    | Risk Level   |
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

| Term                 | Definition                                                             |
| -------------------- | ---------------------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems                    |
| **ClawHub**          | OpenClaw's skill marketplace                                           |
| **Gateway**          | Couche de routage des messages et d’authentification d’OpenClaw        |
| **MCP**              | Model Context Protocol - interface de fournisseur d’outils             |
| **Prompt Injection** | Attaque où des instructions malveillantes sont intégrées dans l’entrée |
| **Skill**            | Extension téléchargeable pour les agents OpenClaw                      |
| **SSRF**             | Falsification de requêtes côté serveur                                 |

---

_Ce modèle de menace est un document évolutif._ Signalez les problèmes de sécurité à security@openclaw.ai
