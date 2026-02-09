# Bijdragen aan het OpenClaw Threat Model

Bedankt voor het helpen om OpenClaw veiliger te maken. Dit dreigingsmodel is een levend document en we verwelkomen bijdragen van iedereen – je hoeft geen beveiligingsexpert te zijn.

## Manieren om bij te dragen

### Voeg een dreiging toe

Een aanvalsvector of risico gezien dat we nog niet hebben behandeld? Open een issue op [openclaw/trust](https://github.com/openclaw/trust/issues) en beschrijf het in je eigen woorden. Je hoeft geen frameworks te kennen of elk veld in te vullen – beschrijf gewoon het scenario.

**Handig om op te nemen (maar niet vereist):**

- Het aanvalsscenario en hoe het kan worden uitgebuit
- Welke onderdelen van OpenClaw worden beïnvloed (CLI, gateway, kanalen, ClawHub, MCP-servers, enz.)
- Hoe ernstig je het vindt (laag / middel / hoog / kritiek)
- Eventuele links naar gerelateerd onderzoek, CVE’s of praktijkvoorbeelden

Wij verzorgen tijdens de review de ATLAS-mapping, dreigings-ID’s en risicobeoordeling. Als je die details wilt opnemen, prima – maar het wordt niet verwacht.

> **Dit is bedoeld voor toevoegingen aan het dreigingsmodel, niet voor het melden van actieve kwetsbaarheden.** Als je een exploiteerbare kwetsbaarheid hebt gevonden, zie onze [Trust-pagina](https://trust.openclaw.ai) voor instructies voor verantwoord melden.

### Stel een mitigatie voor

Heb je een idee om een bestaande dreiging aan te pakken? Open een issue of PR waarin naar de dreiging wordt verwezen. Nuttige mitigaties zijn specifiek en uitvoerbaar – bijvoorbeeld: “per-afzender rate limiting van 10 berichten/minuut bij de gateway” is beter dan “rate limiting implementeren.”

### Stel een aanvalsketen voor

Aanvalsketens laten zien hoe meerdere dreigingen samenkomen in een realistisch aanvalsscenario. Als je een gevaarlijke combinatie ziet, beschrijf de stappen en hoe een aanvaller ze aan elkaar zou koppelen. Een korte verhaallijn van hoe de aanval zich in de praktijk ontvouwt is waardevoller dan een formeel sjabloon.

### Repareer of verbeter bestaande inhoud

Typfouten, verduidelijkingen, verouderde info, betere voorbeelden – PR’s zijn welkom, geen issue nodig.

## Wat we gebruiken

### MITRE ATLAS

This threat model is built on [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), a framework designed specifically for AI/ML threats like prompt injection, tool misuse, and agent exploitation. Je hoeft ATLAS niet te kennen om bij te dragen – wij koppelen inzendingen tijdens de review aan het raamwerk.

### Dreigings-ID's

Elke dreiging krijgt een ID zoals `T-EXEC-003`. De categorieën zijn:

| Code    | Categorie                                          |
| ------- | -------------------------------------------------- |
| RECON   | Verkenning – informatie verzamelen                 |
| ACCESS  | Initiële toegang – toegang verkrijgen              |
| EXEC    | Uitvoering – het uitvoeren van kwaadaardige acties |
| PERSIST | Persistentie – toegang behouden                    |
| EVADE   | Defense evasion - avoiding detection               |
| DISC    | Ontdekking – leren over de omgeving                |
| EXFIL   | Exfiltratie – gegevens stelen                      |
| IMPACT  | Impact – schade of verstoring                      |

ID's worden tijdens de review toegewezen door maintainers. Je hoeft er geen te kiezen.

### Risiconiveaus

| Niveau        | Betekenis                                                                              |
| ------------- | -------------------------------------------------------------------------------------- |
| **Kritiek**   | Volledige systeemcompromittering, of hoge waarschijnlijkheid + kritieke impact         |
| **Hoog**      | Aanzienlijke schade waarschijnlijk, of gemiddelde waarschijnlijkheid + kritieke impact |
| **Gemiddeld** | Matig risico, of lage waarschijnlijkheid + hoge impact                                 |
| **Laag**      | Onwaarschijnlijk en beperkte impact                                                    |

Als je twijfelt over het risiconiveau, beschrijf dan gewoon de impact en wij beoordelen het.

## Reviewproces

1. **Triage** – We beoordelen nieuwe inzendingen binnen 48 uur
2. **Beoordeling** – We verifiëren de haalbaarheid, wijzen ATLAS-mapping en dreigings-ID toe en valideren het risiconiveau
3. **Documentatie** – We zorgen ervoor dat alles correct is opgemaakt en volledig is
4. **Samenvoegen** – Toegevoegd aan het dreigingsmodel en de visualisatie

## Bronnen

- [ATLAS-website](https://atlas.mitre.org/)
- [ATLAS-technieken](https://atlas.mitre.org/techniques/)
- [ATLAS-casestudy's](https://atlas.mitre.org/studies/)
- [OpenClaw Dreigingsmodel](./THREAT-MODEL-ATLAS.md)

## Contact

- **Beveiligingskwetsbaarheden:** Zie onze [Trust-pagina](https://trust.openclaw.ai) voor rapportage-instructies
- **Vragen over het dreigingsmodel:** Open een issue op [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
