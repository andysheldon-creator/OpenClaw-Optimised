# Beitragen zum OpenClaw Threat Model

Danke, dass Sie helfen, OpenClaw sicherer zu machen. Dieses Threat Model ist ein lebendiges Dokument, und wir begrüßen Beiträge von allen – Sie müssen kein Sicherheitsexperte sein.

## Möglichkeiten zur Mitarbeit

### Eine Bedrohung hinzufügen

Eine Angriffsfläche oder ein Risiko entdeckt, das wir noch nicht abgedeckt haben? Eröffnen Sie ein Issue auf [openclaw/trust](https://github.com/openclaw/trust/issues) und beschreiben Sie es in Ihren eigenen Worten. Sie müssen keine Frameworks kennen oder jedes Feld ausfüllen – beschreiben Sie einfach das Szenario.

**Hilfreich anzugeben (aber nicht erforderlich):**

- Das Angriffsszenario und wie es ausgenutzt werden könnte
- Welche Teile von OpenClaw betroffen sind (CLI, Gateway, Channels, ClawHub, MCP-Server usw.)
- Wie schwerwiegend Sie es einschätzen (niedrig / mittel / hoch / kritisch)
- Links zu verwandter Forschung, CVEs oder Praxisbeispielen

Wir übernehmen während der Prüfung das ATLAS-Mapping, die Threat-IDs und die Risikobewertung. Wenn Sie diese Details hinzufügen möchten, großartig – es wird jedoch nicht erwartet.

> **Dies dient der Ergänzung des Threat Models, nicht der Meldung aktiver Schwachstellen.** Wenn Sie eine ausnutzbare Schwachstelle gefunden haben, lesen Sie unsere [Trust-Seite](https://trust.openclaw.ai) für Anweisungen zur verantwortungsvollen Offenlegung.

### Eine Gegenmaßnahme vorschlagen

Haben Sie eine Idee, wie eine bestehende Bedrohung adressiert werden kann? Eröffnen Sie ein Issue oder einen PR mit Bezug auf die Bedrohung. Nützliche Gegenmaßnahmen sind spezifisch und umsetzbar – zum Beispiel ist „pro Absender eine Ratenbegrenzung von 10 Nachrichten/Minute am Gateway“ besser als „Ratenbegrenzung implementieren“.

### Eine Angriffskette vorschlagen

Angriffsketten zeigen, wie mehrere Bedrohungen zu einem realistischen Angriffsszenario kombiniert werden. Wenn Sie eine gefährliche Kombination sehen, beschreiben Sie die Schritte und wie ein Angreifer sie miteinander verknüpfen würde. Eine kurze Erzählung darüber, wie sich der Angriff in der Praxis entfaltet, ist wertvoller als eine formale Vorlage.

### Bestehende Inhalte korrigieren oder verbessern

Rechtschreibfehler, Klarstellungen, veraltete Informationen, bessere Beispiele – PRs sind willkommen, kein Issue erforderlich.

## What We Use

### MITRE ATLAS

Dieses Bedrohungsmodell basiert auf [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), einem Framework, das speziell für KI/ML-Bedrohungen wie Prompt Injection, Tool-Missbrauch und Agentenausnutzung entwickelt wurde. You don't need to know ATLAS to contribute - we map submissions to the framework during review.

### Bedrohungs-IDs

Jede Bedrohung erhält eine ID wie `T-EXEC-003`. Die Kategorien sind:

| Code    | Kategorie                                               |
| ------- | ------------------------------------------------------- |
| RECON   | Aufklärung – Informationsbeschaffung                    |
| ACCESS  | Erstzugriff – Erlangen des Zugangs                      |
| EXEC    | Ausführung – Durchführung bösartiger Aktionen           |
| PERSIST | Persistenz – Aufrechterhaltung des Zugriffs             |
| EVADE   | Umgehung von Abwehrmaßnahmen – Vermeidung der Erkennung |
| DISC    | Entdeckung – Erlernen der Umgebung                      |
| EXFIL   | Exfiltration – Datendiebstahl                           |
| IMPACT  | Auswirkungen – Schaden oder Störung                     |

IDs werden während der Überprüfung von den Maintainers vergeben. Du musst keine auswählen.

### Risikostufen

| Stufe        | Bedeutung                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------- |
| **Kritisch** | Vollständige Systemkompromittierung oder hohe Wahrscheinlichkeit + kritische Auswirkungen    |
| **Hoch**     | Erheblicher Schaden wahrscheinlich oder mittlere Wahrscheinlichkeit + kritische Auswirkungen |
| **Mittel**   | Moderates Risiko oder geringe Wahrscheinlichkeit + hohe Auswirkungen                         |
| **Niedrig**  | Unwahrscheinlich und begrenzte Auswirkungen                                                  |

Wenn du dir bei der Risikostufe unsicher bist, beschreibe einfach die Auswirkungen, und wir bewerten sie.

## Überprüfungsprozess

1. **Triage** – Wir prüfen neue Einreichungen innerhalb von 48 Stunden
2. **Bewertung** – Wir verifizieren die Umsetzbarkeit, weisen die ATLAS-Zuordnung und die Bedrohungs-ID zu und validieren die Risikostufe
3. **Dokumentation** – Wir stellen sicher, dass alles korrekt formatiert und vollständig ist
4. **Merge** – Wird dem Bedrohungsmodell und der Visualisierung hinzugefügt

## Ressourcen

- [ATLAS Website](https://atlas.mitre.org/)
- [ATLAS Techniques](https://atlas.mitre.org/techniques/)
- [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- [OpenClaw Threat Model](./THREAT-MODEL-ATLAS.md)

## Kontakt

- **Sicherheitslücken:** Siehe unsere [Trust-Seite](https://trust.openclaw.ai) für Anweisungen zur Meldung
- **Fragen zum Bedrohungsmodell:** Eröffne ein Issue auf [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
