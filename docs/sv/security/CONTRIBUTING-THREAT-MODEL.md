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

## 1. Vad vi använder

### 2. MITRE ATLAS

3. Denna hotmodell är byggd på [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), ett ramverk som är särskilt utformat för AI/ML-hot som promptinjektion, verktygsmissbruk och agentutnyttjande. 4. Du behöver inte känna till ATLAS för att bidra – vi mappar inskickade bidrag till ramverket under granskningen.

### Threat IDs

6. Varje hot får ett ID som `T-EXEC-003`. 7. Kategorierna är:

| Kod                               | Kategori                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| 8. RECON   | 9. Rekognosering – informationsinsamling         |
| 10. ACCESS | 11. Initial åtkomst – att få inträde             |
| 12. EXEC   | 13. Exekvering – att köra skadliga handlingar    |
| PERSIST                           | Persistence - maintaining access                                        |
| 16. EVADE  | 17. Försvarsförbikoppling – att undvika upptäckt |
| DISC                              | 19. Upptäckt – att lära sig om miljön            |
| 20. EXFIL  | 21. Exfiltrering – att stjäla data               |
| 22. IMPACT | 23. Påverkan – skada eller störning              |

24. ID:n tilldelas av underhållare under granskningen. 25. Du behöver inte välja ett.

### 26. Risknivåer

| 27. Nivå        | 28. Betydelse                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 29. **Kritisk** | 30. Fullständig systemkompromettering, eller hög sannolikhet + kritisk påverkan |
| 31. **Hög**     | 32. Betydande skada sannolik, eller medelhög sannolikhet + kritisk påverkan     |
| 33. **Medel**   | 34. Måttlig risk, eller låg sannolikhet + hög påverkan                          |
| 35. **Låg**     | 36. Osannolik och begränsad påverkan                                            |

37. Om du är osäker på risknivån, beskriv bara påverkan så bedömer vi den.

## 38. Granskningsprocess

1. 39. **Triage** – Vi granskar nya inskickade bidrag inom 48 timmar
2. 40. **Bedömning** – Vi verifierar genomförbarhet, tilldelar ATLAS-mappning och hot-ID, validerar risknivå
3. 41. **Dokumentation** – Vi säkerställer att allt är korrekt formaterat och komplett
4. 42. **Sammanfogning** – Lägger till i hotmodellen och visualiseringen

## 43) Resurser

- 44. [ATLAS webbplats](https://atlas.mitre.org/)
- 45. [ATLAS-tekniker](https://atlas.mitre.org/techniques/)
- 46. [ATLAS-fallstudier](https://atlas.mitre.org/studies/)
- 47. [OpenClaw hotmodell](./THREAT-MODEL-ATLAS.md)

## 48. Kontakt

- 49. **Säkerhetssårbarheter:** Se vår [Trust-sida](https://trust.openclaw.ai) för rapporteringsinstruktioner
- 50. **Frågor om hotmodellen:** Öppna ett ärende på [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
