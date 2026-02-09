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

## 1. Czego używamy

### 2. MITRE ATLAS

This threat model is built on [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), a framework designed specifically for AI/ML threats like prompt injection, tool misuse, and agent exploitation. 4. Nie musisz znać ATLAS, aby wnieść wkład — mapujemy zgłoszenia do frameworku podczas przeglądu.

### 5. Identyfikatory zagrożeń

6. Każde zagrożenie otrzymuje identyfikator, taki jak `T-EXEC-003`. 7. Kategorie to:

| Kod                                | Kategoria                                                              |
| ---------------------------------- | ---------------------------------------------------------------------- |
| 8. RECON    | 9. Rozpoznanie — zbieranie informacji           |
| 10. ACCESS  | 11. Dostęp początkowy — uzyskanie wejścia       |
| 12. EXEC    | 13. Wykonanie — uruchamianie złośliwych działań |
| 14. PERSIST | 15. Trwałość — utrzymywanie dostępu             |
| 16. EVADE   | 17. Unikanie obrony — unikanie wykrycia         |
| 18. DISC    | 19. Odkrywanie — poznawanie środowiska          |
| 20. EXFIL   | 21. Eksfiltracja — kradzież danych              |
| 22. IMPACT  | 23. Wpływ — szkody lub zakłócenia               |

24. Identyfikatory są przypisywane przez opiekunów podczas przeglądu. 25. Nie musisz wybierać jednego.

### 26. Poziomy ryzyka

| 27. Poziom        | 28. Znaczenie                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 29. **Krytyczny** | 30. Pełne przejęcie systemu lub wysokie prawdopodobieństwo + krytyczny wpływ      |
| 31. **Wysoki**    | 32. Znaczne szkody prawdopodobne lub średnie prawdopodobieństwo + krytyczny wpływ |
| 33. **Średni**    | 34. Umiarkowane ryzyko lub niskie prawdopodobieństwo + wysoki wpływ               |
| 35. **Niski**     | 36. Mało prawdopodobne i o ograniczonym wpływie                                   |

37. Jeśli nie masz pewności co do poziomu ryzyka, po prostu opisz wpływ, a my go ocenimy.

## 38. Proces przeglądu

1. 39. **Triaging** — Przeglądamy nowe zgłoszenia w ciągu 48 godzin
2. 40. **Ocena** — Weryfikujemy wykonalność, przypisujemy mapowanie ATLAS i identyfikator zagrożenia, weryfikujemy poziom ryzyka
3. 41. **Dokumentacja** — Zapewniamy, że wszystko jest sformatowane i kompletne
4. 42. **Scalenie** — Dodanie do modelu zagrożeń i wizualizacji

## 43) Zasoby

- 44. [Strona ATLAS](https://atlas.mitre.org/)
- 45. [Techniki ATLAS](https://atlas.mitre.org/techniques/)
- 46. [Studia przypadków ATLAS](https://atlas.mitre.org/studies/)
- 47. [Model zagrożeń OpenClaw](./THREAT-MODEL-ATLAS.md)

## 48. Kontakt

- 49. **Luki bezpieczeństwa:** Zobacz naszą [stronę Zaufanie](https://trust.openclaw.ai), aby uzyskać instrukcje zgłaszania
- 50. **Pytania dotyczące modelu zagrożeń:** Otwórz zgłoszenie w [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
