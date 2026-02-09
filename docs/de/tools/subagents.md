---
summary: "Sub-Agents: Starten isolierter Agentenläufe, die Ergebnisse an den anfordernden Chat zurückmelden"
read_when:
  - Sie möchten Hintergrund-/Parallelarbeit über den Agenten ausführen
  - Sie ändern sessions_spawn oder die Sub-Agent-Werkzeugrichtlinie
title: "Sub-Agents"
---

# Sub-Agents

Unteragenten ermöglichen es Ihnen, Hintergrundaufgaben auszuführen, ohne die Hauptkonversation zu blockieren. Wenn Sie einen Unteragenten starten, läuft er in einer eigenen isolierten Sitzung, erledigt seine Arbeit und meldet das Ergebnis nach Abschluss im Chat.

**Anwendungsfälle:**

- Ein Thema recherchieren, während der Hauptagent weiterhin Fragen beantwortet
- Mehrere lange Aufgaben parallel ausführen (Web-Scraping, Code-Analyse, Dateiverarbeitung)
- Aufgaben an spezialisierte Agenten in einem Multi-Agenten-Setup delegieren

## Schnellstart

Der einfachste Weg, Unteragenten zu verwenden, ist, Ihren Agenten ganz natürlich zu bitten:

> "Starte einen Unteragenten, um die neuesten Node.js-Release-Notes zu recherchieren"

Der Agent ruft im Hintergrund das Tool `sessions_spawn` auf. Wenn der Unteragent fertig ist, gibt er seine Ergebnisse wieder in Ihren Chat zurück.

Sie können Optionen auch explizit angeben:

> "Starte einen Unteragenten, um die Server-Logs von heute zu analysieren.
> Verwende gpt-5.2 und setze ein 5-Minuten-Timeout." Der Hauptagent ruft `sessions_spawn` mit einer Aufgabenbeschreibung auf.

## Funktionsweise

<Steps>
  <Step title="Main agent spawns">
    Der Aufruf ist **nicht blockierend** — der Hauptagent erhält sofort `{ status: "accepted", runId, childSessionKey }` zurück. 
    Eine neue isolierte Sitzung wird erstellt (`agent:
    :subagent:
    `) in der dedizierten Warteschlangen-Spur `subagent`.
  
  </Step>
  <Step title="Sub-agent runs in the background">Wenn der Unteragent fertig ist, meldet er seine Ergebnisse wieder an den anfragenden Chat.<agentId>Der Hauptagent veröffentlicht eine Zusammenfassung in natürlicher Sprache.<uuid>Die Unteragenten-Sitzung wird nach 60 Minuten automatisch archiviert (konfigurierbar).</Step>
  <Step title="Result is announced">
    Transkripte bleiben erhalten. Jeder Unteragent hat seinen **eigenen** Kontext und eigenen Token-Verbrauch.
  </Step>
  <Step title="Session is archived">
    Legen Sie ein günstigeres Modell für Unteragenten fest, um Kosten zu sparen — siehe unten [Setting a Default Model](#setting-a-default-model). Unteragenten funktionieren sofort ohne Konfiguration.
  </Step>
</Steps>

<Tip>
Modell: normale Modellauswahl des Zielagenten (sofern `subagents.model` nicht gesetzt ist) Thinking: keine Überschreibung für Unteragenten (sofern `subagents.thinking` nicht gesetzt ist)
</Tip>

## Konfiguration

Max. gleichzeitig: 8 Standardwerte:

- Automatische Archivierung: nach 60 Minuten
- Festlegen eines Standardmodells
- Verwenden Sie ein günstigeres Modell für Unteragenten, um Token-Kosten zu sparen:
- {
  agents: {
  defaults: {
  subagents: {
  model: "minimax/MiniMax-M2.1",
  },
  },
  },
  }

### Festlegen eines Standard-Thinkinglevels

Use a cheaper model for sub-agents to save on token costs:

```json5
{
  agents: {
    defaults: {
      subagents: {
        model: "minimax/MiniMax-M2.1",
      },
    },
  },
}
```

### Setting a Default Thinking Level

```json5
{
  agents: {
    defaults: {
      subagents: {
        thinking: "low",
      },
    },
  },
}
```

### Pro-Agent-Überschreibungen

In einer Multi-Agenten-Konfiguration können Sie Sub-Agent-Standards pro Agent festlegen:

```json5
{
  agents: {
    list: [
      {
        id: "researcher",
        subagents: {
          model: "anthropic/claude-sonnet-4",
        },
      },
      {
        id: "assistant",
        subagents: {
          model: "minimax/MiniMax-M2.1",
        },
      },
    ],
  },
}
```

### Konwährung

Steuern Sie, wie viele Sub-Agenten gleichzeitig ausgeführt werden können:

```json5
{
  agents: {
    defaults: {
      subagents: {
        maxConcurrent: 4, // default: 8
      },
    },
  },
}
```

Sub-Agenten verwenden eine dedizierte Warteschlangenspur (`subagent`), die von der Haupt-Agenten-Warteschlange getrennt ist, sodass Sub-Agent-Läufe eingehende Antworten nicht blockieren.

### Automatisches Archivieren

Sub-Agent-Sitzungen werden nach einem konfigurierbaren Zeitraum automatisch archiviert:

```json5
{
  agents: {
    defaults: {
      subagents: {
        archiveAfterMinutes: 120, // default: 60
      },
    },
  },
}
```

<Note>Das Archivieren benennt das Transkript in `*.deleted.<timestamp>` um (gleicher Ordner) — Transkripte werden erhalten, nicht gelöscht. Automatische Archivierungs-Timer sind Best-Effort; ausstehende Timer gehen verloren, wenn das Gateway neu startet.
</Note>

## Das `sessions_spawn`-Tool

Dies ist das Tool, das der Agent aufruft, um Sub-Agenten zu erstellen.

### Parameter

| Parameter           | Typ                | Default                                    | Description                                                                                          |
| ------------------- | ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `task`              | string             | _(erforderlich)_        | Was der Sub-Agent tun soll                                                                           |
| `label`             | string             | —                                          | Kurze Bezeichnung zur Identifikation                                                                 |
| `agentId`           | string             | _(Agent des Aufrufers)_ | Unter einer anderen Agenten-ID starten (muss erlaubt sein)                        |
| `modell`            | string             | _(optional)_            | Überschreiben des Modells für diesen Sub-Agenten                                                     |
| `thinking`          | string             | _(optional)_            | Überschreiben der Denkstufe (`off`, `low`, `medium`, `high` usw.) |
| `runTimeoutSeconds` | Zahl               | `0` (keine Begrenzung)  | Den Sub-Agenten nach N Sekunden abbrechen                                                            |
| `aufräumen`         | "delete" \| "keep" | "keep"                                     | "delete" archiviert unmittelbar nach der Ankündigung                                                 |

### Modellauflösungsreihenfolge

Das Sub-Agenten-Modell wird in dieser Reihenfolge aufgelöst (erste Übereinstimmung gewinnt):

1. Expliziter `model`-Parameter im `sessions_spawn`-Aufruf
2. Pro-Agent-Konfiguration: `agents.list[].subagents.model`
3. Globaler Standard: `agents.defaults.subagents.model`
4. Normale Modellauflösung des Zielagenten für diese neue Sitzung

Die Denkstufe wird in dieser Reihenfolge aufgelöst:

1. Expliziter `thinking`-Parameter im `sessions_spawn`-Aufruf
2. Pro-Agent-Konfiguration: `agents.list[].subagents.thinking`
3. Globaler Standard: `agents.defaults.subagents.thinking`
4. Andernfalls wird keine sub-agent-spezifische Denk-Überschreibung angewendet

<Note>Ungültige Modellwerte werden stillschweigend übersprungen — der Sub-Agent wird mit dem nächsten gültigen Standard ausgeführt, mit einer Warnung im Tool-Ergebnis.</Note>

### Agentenübergreifendes Spawnen

Standardmäßig können Sub-Agenten nur unter ihrer eigenen Agenten-ID gestartet werden. 1. Um es einem Agenten zu ermöglichen, Sub-Agenten unter anderen Agenten-IDs zu starten:

```json5
2. {
  agents: {
    list: [
      {
        id: "orchestrator",
        subagents: {
          allowAgents: ["researcher", "coder"], // oder ["*"] um alle zu erlauben
        },
      },
    ],
  },
}
```

<Tip>3. 
Verwenden Sie das Tool `agents_list`, um herauszufinden, welche Agenten-IDs derzeit für `sessions_spawn` erlaubt sind.</Tip>

## 4. Sub-Agenten verwalten (`/subagents`)

5. Verwenden Sie den Slash-Befehl `/subagents`, um Sub-Agent-Läufe für die aktuelle Sitzung zu inspizieren und zu steuern:

| Befehl                                     | Beschreibung                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `/subagents list`                          | 6. Alle Sub-Agent-Läufe auflisten (aktiv und abgeschlossen) |
| `/subagents stop <id\\|#\\|all>`         | 7. Einen laufenden Sub-Agenten stoppen                                         |
| `/subagents log <id\\|#> [limit] [tools]` | 8. Sub-Agent-Transkript anzeigen                                               |
| `/subagents info <id\\|#>`                | 9. Detaillierte Lauf-Metadaten anzeigen                                        |
| `/subagents send <id\\|#> <message>`      | 10. Eine Nachricht an einen laufenden Sub-Agenten senden                       |

11. Sie können Sub-Agenten per Listenindex (`1`, `2`), Run-ID-Präfix, vollständigem Sitzungsschlüssel oder `last` referenzieren.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">12. 
    ```
    /subagents list
    ```

    ````
    13. ```
    🧭 Subagents (aktuelle Sitzung)
    Aktiv: 1 · Abgeschlossen: 2
    1) ✅ · research logs · 2m31s · run a1b2c3d4 · agent:main:subagent:...
    2) ✅ · check deps · 45s · run e5f6g7h8 · agent:main:subagent:...
    3) 🔄 · deploy staging · 1m12s · run i9j0k1l2 · agent:main:subagent:...
    ```
    
    ```
    /subagents stop 3
    ```
    
    ```
    ⚙️ Stopp für deploy staging angefordert.
    ```
    ````

  </Accordion>
  <Accordion title="Example: inspect a sub-agent">14. 
    ```
    /subagents info 1
    ```

    ````
    15. ```
    ℹ️ Subagent-Info
    Status: ✅
    Bezeichnung: research logs
    Aufgabe: Die neuesten Server-Fehlerprotokolle recherchieren und die Ergebnisse zusammenfassen
    Run: a1b2c3d4-...
    Sitzung: agent:main:subagent:...
    Laufzeit: 2m31s
    Aufräumen: behalten
    Ergebnis: ok
    ```
    ````

  </Accordion>
  <Accordion title="Example: view sub-agent log">16. 
    ```
    /subagents log 1 10
    ```

    ````
    17. Zeigt die letzten 10 Nachrichten aus dem Transkript des Sub-Agenten. Fügen Sie `tools` hinzu, um Tool-Call-Nachrichten einzuschließen:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">
    ```
    /subagents send 3 "Also check the staging environment"
    ```

    ```
    19. Sendet eine Nachricht in die Sitzung des laufenden Sub-Agenten und wartet bis zu 30 Sekunden auf eine Antwort.
    ```

  </Accordion>
</AccordionGroup>

## 20. Ankündigen (Wie Ergebnisse zurückkommen)

21. Wenn ein Sub-Agent fertig ist, durchläuft er einen **announce**-Schritt:

1. 22. Die finale Antwort des Sub-Agenten wird erfasst
2. 23. Eine Zusammenfassungsnachricht mit Ergebnis, Status und Statistiken wird an die Sitzung des Hauptagenten gesendet
3. 24. Der Hauptagent postet eine natürlichsprachliche Zusammenfassung in Ihren Chat

Announce-Antworten bewahren, sofern verfügbar, Thread-/Themen-Routing (Slack-Threads, Telegram-Themen, Matrix-Threads).

### 25. Ankündigungsstatistiken

26. Jede Ankündigung enthält eine Statistikzeile mit:

- 27. Laufzeitdauer
- Tokenverbrauch (Eingabe/Ausgabe/Gesamt)
- 28. Geschätzte Kosten (wenn die Modellbepreisung über `models.providers.*.models[].cost` konfiguriert ist)
- 29. Sitzungsschlüssel, Sitzungs-ID und Transkriptpfad

### 30. Ankündigungsstatus

31. Die Ankündigungsnachricht enthält einen Status, der aus dem Laufzeitergebnis abgeleitet ist (nicht aus der Modellausgabe):

- 32. **erfolgreicher Abschluss** (`ok`) — Aufgabe normal abgeschlossen
- 33. **Fehler** — Aufgabe fehlgeschlagen (Fehlerdetails in den Notizen)
- 34. **Zeitüberschreitung** — Aufgabe hat `runTimeoutSeconds` überschritten
- 35. **unbekannt** — Status konnte nicht ermittelt werden

<Tip>
36. Wenn keine benutzerseitige Ankündigung erforderlich ist, kann der Zusammenfassungsschritt des Hauptagenten `NO_REPLY` zurückgeben und es wird nichts gepostet.
37. Dies unterscheidet sich von `ANNOUNCE_SKIP`, das im Agent-zu-Agent-Ankündigungsfluss (`sessions_send`) verwendet wird.
</Tip>

## 38. Tool-Richtlinie

39. Standardmäßig erhalten Sub-Agenten **alle Tools außer** einer Reihe verweigerter Tools, die für Hintergrundaufgaben unsicher oder unnötig sind:

<AccordionGroup>
  <Accordion title="Default denied tools">40. 
    | Verweigertes Tool | Grund |
    |-------------|--------|
    | `sessions_list` | Sitzungsverwaltung — Hauptagent orchestriert |
    | `sessions_history` | Sitzungsverwaltung — Hauptagent orchestriert |
    | `sessions_send` | Sitzungsverwaltung — Hauptagent orchestriert |
    | `sessions_spawn` | Kein verschachteltes Fan-out (Sub-Agenten können keine Sub-Agenten starten) |
    | `gateway` | Systemadministration — gefährlich für Sub-Agenten |
    | `agents_list` | Systemadministration |
    | `whatsapp_login` | Interaktive Einrichtung — keine Aufgabe |
    | `session_status` | Status/Planung — Hauptagent koordiniert |
    | `cron` | Status/Planung — Hauptagent koordiniert |
    | `memory_search` | Relevante Informationen stattdessen im Spawn-Prompt übergeben |
    | `memory_get` | Relevante Informationen stattdessen im Spawn-Prompt übergeben |
  </Accordion>
</AccordionGroup>

### 41. Sub-Agent-Tools anpassen

42. Sie können die Tools für Sub-Agenten weiter einschränken:

```json5
43. {
  tools: {
    subagents: {
      tools: {
        // deny gewinnt immer über allow
        deny: ["browser", "firecrawl"],
      },
    },
  },
}
```

44. Um Sub-Agenten auf **nur** bestimmte Tools zu beschränken:

```json5
45. {
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // deny gewinnt weiterhin, falls gesetzt
      },
    },
  },
}
```

<Note>
46. Benutzerdefinierte Deny-Einträge werden **zur** Standard-Deny-Liste **hinzugefügt**. 47. Wenn `allow` gesetzt ist, sind nur diese Tools verfügbar (die Standard-Deny-Liste gilt weiterhin zusätzlich).
</Note>

## Authentifizierung

Die Sub-Agent-Authentifizierung wird nach **Agent-ID** aufgelöst, nicht nach Sitzungstyp:

- 48. Der Auth-Store wird aus dem `agentDir` des Zielagenten geladen
- 49. Die Auth-Profile des Hauptagenten werden als **Fallback** zusammengeführt (Agentenprofile gewinnen bei Konflikten)
- 50. Die Zusammenführung ist additiv — Hauptprofile sind immer als Fallbacks verfügbar

<Note>
Fully isolated auth per sub-agent is not currently supported.
</Note>

## Context and System Prompt

Sub-agents receive a reduced system prompt compared to the main agent:

- **Included:** Tooling, Workspace, Runtime sections, plus `AGENTS.md` and `TOOLS.md`
- **Not included:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

The sub-agent also receives a task-focused system prompt that instructs it to stay focused on the assigned task, complete it, and not act as the main agent.

## Stopping Sub-Agents

| Method                 | Effect                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| `/stop` in the chat    | Aborts the main session **and** all active sub-agent runs spawned from it |
| `/subagents stop <id>` | Stops a specific sub-agent without affecting the main session             |
| `runTimeoutSeconds`    | Automatically aborts the sub-agent run after the specified time           |

<Note>
`runTimeoutSeconds` does **not** auto-archive the session. The session remains until the normal archive timer fires.
</Note>

## Full Configuration Example

<Accordion title="Complete sub-agent configuration">
```json5
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4" },
      subagents: {
        model: "minimax/MiniMax-M2.1",
        thinking: "low",
        maxConcurrent: 4,
        archiveAfterMinutes: 30,
      },
    },
    list: [
      {
        id: "main",
        default: true,
        name: "Personal Assistant",
      },
      {
        id: "ops",
        name: "Ops Agent",
        subagents: {
          model: "anthropic/claude-sonnet-4",
          allowAgents: ["main"], // ops can spawn sub-agents under "main"
        },
      },
    ],
  },
  tools: {
    subagents: {
      tools: {
        deny: ["browser"], // sub-agents can't use the browser
      },
    },
  },
}
```
</Accordion>

## Einschränkungen

<Warning>
- **Best-effort announce:** If the gateway restarts, pending announce work is lost.
- **No nested spawning:** Sub-agents cannot spawn their own sub-agents.
- **Shared resources:** Sub-agents share the gateway process; use `maxConcurrent` as a safety valve.
- **Auto-archive is best-effort:** Pending archive timers are lost on gateway restart.
</Warning>

## Siehe auch

- [Session Tools](/concepts/session-tool) — details on `sessions_spawn` and other session tools
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — per-agent tool restrictions and sandboxing
- [Configuration](/gateway/configuration) — `agents.defaults.subagents` reference
- [Queue](/concepts/queue) — how the `subagent` lane works
