# Contributing to the OpenClaw Threat Model

Thanks for helping make OpenClaw more secure. This threat model is a living document and we welcome contributions from anyone - you don't need to be a security expert.

## Ways to Contribute

### Add a Threat

Spotted an attack vector or risk we haven't covered? Open an issue on [openclaw/trust](https://github.com/openclaw/trust/issues) and describe it in your own words. You don't need to know any frameworks or fill in every field - just describe the scenario.

**Helpful to include (but not required):**

- The attack scenario and how it could be exploited
- Which parts of OpenClaw are affected (CLI, gateway, channels, ClawHub, MCP servers, etc.)
- How severe you think it is (low / medium / high / critical)
- Any links to related research, CVEs, or real-world examples

We'll handle the ATLAS mapping, threat IDs, and risk assessment during review. If you want to include those details, great - but it's not expected.

> **This is for adding to the threat model, not reporting live vulnerabilities.** If you've found an exploitable vulnerability, see our [Trust page](https://trust.openclaw.ai) for responsible disclosure instructions.

### Suggest a Mitigation

Have an idea for how to address an existing threat? Open an issue or PR referencing the threat. Useful mitigations are specific and actionable - for example, "per-sender rate limiting of 10 messages/minute at the gateway" is better than "implement rate limiting."

### Propose an Attack Chain

Attack chains show how multiple threats combine into a realistic attack scenario. If you see a dangerous combination, describe the steps and how an attacker would chain them together. A short narrative of how the attack unfolds in practice is more valuable than a formal template.

### Fix or Improve Existing Content

Typos, clarifications, outdated info, better examples - PRs welcome, no issue needed.

## Hvad vi bruger

### MITRE ATLAS

Denne trusselsmodel er bygget på [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), et framework designet specifikt til AI/ML-trusler som prompt injection, misbrug af værktøjer og udnyttelse af agenter. Du behøver ikke at kende ATLAS for at bidrage – vi kortlægger indsendelser til frameworket under gennemgangen.

### Trussels-id’er

Hver trussel får et id som `T-EXEC-003`. Kategorierne er:

| Kode    | Kategori                                    |
| ------- | ------------------------------------------- |
| RECON   | Reconnaissance - information gathering      |
| ACCESS  | Initial access - gaining entry              |
| EXEC    | Udførelse – kørsel af ondsindede handlinger |
| PERSIST | Vedholdenhed – opretholdelse af adgang      |
| EVADE   | Undgåelse af forsvar – undgå opdagelse      |
| DISC    | Opdagelse – lære om miljøet                 |
| EXFIL   | Eksfiltration – stjæle data                 |
| IMPACT  | Påvirkning – skade eller forstyrrelse       |

Id’er tildeles af vedligeholdere under gennemgangen. Du behøver ikke at vælge én.

### Risikonniveauer

| Niveau       | Betydning                                                                   |
| ------------ | --------------------------------------------------------------------------- |
| **Critical** | Fuld systemkompromittering eller høj sandsynlighed + kritisk påvirkning     |
| **Høj**      | Betydelig skade sandsynlig, eller middel sandsynlighed + kritisk påvirkning |
| **Middel**   | Moderate risk, or low likelihood + high impact                              |
| **Low**      | Usandsynlig og begrænset påvirkning                                         |

Hvis du er usikker på risikoniveauet, så beskriv blot påvirkningen, og vi vurderer den.

## Gennemgangsproces

1. **Triage** – Vi gennemgår nye indsendelser inden for 48 timer
2. **Vurdering** – Vi verificerer gennemførlighed, tildeler ATLAS-kortlægning og trussels-id samt validerer risikoniveau
3. **Dokumentation** – Vi sikrer, at alt er formateret korrekt og fuldstændigt
4. **Fletning** – Tilføjet til trusselsmodellen og visualiseringen

## Ressourcer

- [ATLAS Website](https://atlas.mitre.org/)
- [ATLAS Techniques](https://atlas.mitre.org/techniques/)
- [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- [OpenClaw Threat Model](./THREAT-MODEL-ATLAS.md)

## Kontakt

- **Sikkerhedssårbarheder:** Se vores [Trust-side](https://trust.openclaw.ai) for rapporteringsinstruktioner
- **Spørgsmål om trusselsmodellen:** Opret et issue på [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
