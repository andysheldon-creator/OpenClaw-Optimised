---
summary: "Sub-agents: het starten van geïsoleerde agentruns die resultaten terugmelden aan de aanvragende chat"
read_when:
  - Je wilt achtergrond-/parallel werk via de agent
  - Je wijzigt sessions_spawn of het toolbeleid voor sub-agents
title: "Sub-agenten"
---

# Sub-agenten

Sub-agents let you run background tasks without blocking the main conversation. When you spawn a sub-agent, it runs in its own isolated session, does its work, and announces the result back to the chat when finished.

**Use cases:**

- Research a topic while the main agent continues answering questions
- Run multiple long tasks in parallel (web scraping, code analysis, file processing)
- Delegate tasks to specialized agents in a multi-agent setup

## Snelle start

The simplest way to use sub-agents is to ask your agent naturally:

> "Spawn a sub-agent to research the latest Node.js release notes"

The agent will call the `sessions_spawn` tool behind the scenes. When the sub-agent finishes, it announces its findings back into your chat.

You can also be explicit about options:

> "Spawn a sub-agent to analyze the server logs from today. Use gpt-5.2 and set a 5-minute timeout."

## Hoe het werkt

<Steps>
  <Step title="Main agent spawns">
    The main agent calls `sessions_spawn` with a task description. The call is **non-blocking** — the main agent gets back `{ status: "accepted", runId, childSessionKey }` immediately.
  </Step>
  <Step title="Sub-agent runs in the background">
    A new isolated session is created (`agent:<agentId>:subagent:<uuid>`) on the dedicated `subagent` queue lane.
  </Step>
  <Step title="Result is announced">
    When the sub-agent finishes, it announces its findings back to the requester chat. The main agent posts a natural-language summary.
  </Step>
  <Step title="Session is archived">
    The sub-agent session is auto-archived after 60 minutes (configurable). Transcripts are preserved.
  </Step>
</Steps>

<Tip>
Each sub-agent has its **own** context and token usage. Set a cheaper model for sub-agents to save costs — see [Setting a Default Model](#setting-a-default-model) below.
</Tip>

## Configuratie

Sub-agents work out of the box with no configuration. Standaardwaarden:

- Model: target agent’s normal model selection (unless `subagents.model` is set)
- Thinking: no sub-agent override (unless `subagents.thinking` is set)
- Max concurrent: 8
- Auto-archive: after 60 minutes

### Setting a Default Model

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

### Per-agent-overschrijvingen

In een multi-agent-opstelling kun je standaardwaarden voor sub-agents per agent instellen:

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

### Concurrency

Bepaal hoeveel sub-agents tegelijk kunnen draaien:

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

Sub-agents gebruiken een speciale wachtrijlijn (`subagent`) die gescheiden is van de hoofd-agentwachtrij, zodat runs van sub-agents binnenkomende antwoorden niet blokkeren.

### Auto-Archive

Sub-agent sessions are automatically archived after a configurable period:

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

<Note>Archiveren hernoemt het transcript naar `*.deleted.<timestamp>` (dezelfde map) — transcripties blijven bewaard en worden niet verwijderd. Timers voor automatisch archiveren zijn best-effort; wachtende timers gaan verloren als de gateway opnieuw wordt gestart.
</Note>

## De tool `sessions_spawn`

This is the tool the agent calls to create sub-agents.

### Parameters

| Parameter           | Type                 | Standaard                                     | Beschrijving                                                                                       |
| ------------------- | -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `task`              | string               | _(required)_               | Wat de sub-agent moet doen                                                                         |
| `label`             | string               | —                                             | Korte label voor identificatie                                                                     |
| `agentId`           | string               | _(agent van de aanroeper)_ | Starten onder een andere agent-id (moet zijn toegestaan)                        |
| `model`             | string               | _(optioneel)_              | Het model voor deze sub-agent overschrijven                                                        |
| `thinking`          | string               | _(optioneel)_              | Denkniveau overschrijven (`off`, `low`, `medium`, `high`, enz.) |
| `runTimeoutSeconds` | getal                | `0` (geen limiet)          | De sub-agent afbreken na N seconden                                                                |
| `opschonen`         | "delete" \\| "keep" | "keep"                                        | "delete" archiveert onmiddellijk na aankondiging                                                   |

### Volgorde voor modelresolutie

Het sub-agentmodel wordt in deze volgorde bepaald (eerste overeenkomst wint):

1. Expliciete `model`-parameter in de `sessions_spawn`-aanroep
2. Per-agentconfiguratie: `agents.list[].subagents.model`
3. Globale standaard: `agents.defaults.subagents.model`
4. Normale modelresolutie van de doelagent voor die nieuwe sessie

Het denkniveau wordt in deze volgorde bepaald:

1. Expliciete `thinking`-parameter in de `sessions_spawn`-aanroep
2. Per-agentconfiguratie: `agents.list[].subagents.thinking`
3. Globale standaard: `agents.defaults.subagents.thinking`
4. Anders wordt er geen sub-agent-specifieke denkniveau-overschrijving toegepast

<Note>
Ongeldige modelwaarden worden stilzwijgend overgeslagen — de sub-agent draait op de eerstvolgende geldige standaard met een waarschuwing in het toolresultaat.</Note>

### Cross-agent spawning

Standaard kunnen sub-agents alleen worden gestart onder hun eigen agent-id. Om een agent toe te staan subagents te starten onder andere agent-id's:

```json5
{
  agents: {
    list: [
      {
        id: "orchestrator",
        subagents: {
          allowAgents: ["researcher", "coder"], // of ["*"] om alles toe te staan
        },
      },
    ],
  },
}
```

<Tip>
Gebruik de `agents_list`-tool om te ontdekken welke agent-id's momenteel zijn toegestaan voor `sessions_spawn`.</Tip>

## Subagents beheren (`/subagents`)

Gebruik de slash-opdracht `/subagents` om subagent-runs voor de huidige sessie te inspecteren en te beheren:

| Opdracht                                   | Beschrijving                                                         |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `/subagents list`                          | Alle subagent-runs weergeven (actief en voltooid) |
| `/subagents stop <id\\|#\\|all>`         | Een draaiende subagent stoppen                                       |
| `/subagents log <id\\|#> [limit] [tools]` | View sub-agent transcript                                            |
| `/subagents info <id\\|#>`                | Gedetailleerde run-metadata tonen                                    |
| `/subagents send <id\\|#> <message>`      | Een bericht naar een draaiende subagent sturen                       |

Je kunt subagents refereren via lijstindex (`1`, `2`), run-id-prefix, volledige sessiesleutel of `last`.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">```
    /subagents list
    ```

    ````
    ```
    🧭 Subagents (current session)
    Active: 1 · Done: 2
    1) ✅ · research logs · 2m31s · run a1b2c3d4 · agent:main:subagent:...
    2) ✅ · check deps · 45s · run e5f6g7h8 · agent:main:subagent:...
    3) 🔄 · deploy staging · 1m12s · run i9j0k1l2 · agent:main:subagent:...
    ```
    
    ```
    /subagents stop 3
    ```
    
    ```
    ⚙️ Stop requested for deploy staging.
    ```
    ````

  </Accordion>
  <Accordion title="Example: inspect a sub-agent">```
    /subagents info 1
    ```

    ````
    ```
    ℹ️ Subagent info
    Status: ✅
    Label: research logs
    Task: Research the latest server error logs and summarize findings
    Run: a1b2c3d4-...
    Session: agent:main:subagent:...
    Runtime: 2m31s
    Cleanup: keep
    Outcome: ok
    ```
    ````

  </Accordion>
  <Accordion title="Example: view sub-agent log">```
    /subagents log 1 10
    ```

    ````
    Toont de laatste 10 berichten uit het transcript van de subagent. Voeg `tools` toe om tool-aanroepberichten op te nemen:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">```
    /subagents send 3 "Also check the staging environment"
    ```

    ```
    Stuurt een bericht naar de sessie van de draaiende subagent en wacht tot maximaal 30 seconden op een antwoord.
    ```

  </Accordion>
</AccordionGroup>

## Aankondigen (Hoe resultaten terugkomen)

Wanneer een subagent klaar is, doorloopt deze een **announce**-stap:

1. Het definitieve antwoord van de subagent wordt vastgelegd
2. Er wordt een samenvattend bericht naar de sessie van de hoofdagent gestuurd met het resultaat, de status en statistieken
3. De hoofdagent plaatst een samenvatting in natuurlijke taal in je chat

Announce-antwoorden behouden thread-/topicroutering wanneer beschikbaar (Slack-threads, Telegram-topics, Matrix-threads).

### Aankondigingsstatistieken

Elke aankondiging bevat een statregel met:

- Duur van de runtime
- Tokengebruik (invoer/uitvoer/totaal)
- Geschatte kosten (wanneer modelprijzen zijn geconfigureerd via `models.providers.*.models[].cost`)
- Sessiesleutel, sessie-id en transcriptpad

### Aankondigingsstatus

Het aankondigingsbericht bevat een status die is afgeleid van de runtime-uitkomst (niet van de modeloutput):

- **succesvolle voltooiing** (`ok`) — taak normaal voltooid
- **fout** — taak mislukt (foutdetails in notities)
- **timeout** — taak overschreed `runTimeoutSeconds`
- **onbekend** — status kon niet worden bepaald

<Tip>
Als er geen gebruikersgerichte aankondiging nodig is, kan de samenvattingsstap van de hoofdagent `NO_REPLY` retourneren en wordt er niets geplaatst.
Dit is anders dan `ANNOUNCE_SKIP`, dat wordt gebruikt in de announce-flow tussen agents (`sessions_send`).
</Tip>

## Toolbeleid

Standaard krijgen subagents **alle tools behalve** een set geweigerde tools die onveilig of onnodig zijn voor achtergrondtaken:

<AccordionGroup>
  <Accordion title="Default denied tools">
    | Geweigerde tool | Reden |
    |-------------|--------|
    | `sessions_list` | Sessiebeheer — hoofdagent orkestreert |
    | `sessions_history` | Sessiebeheer — hoofdagent orkestreert |
    | `sessions_send` | Sessiebeheer — hoofdagent orkestreert |
    | `sessions_spawn` | Geen geneste fan-out (subagents kunnen geen subagents starten) |
    | `gateway` | Systeembeheer — gevaarlijk vanuit subagent |
    | `agents_list` | Systeembeheer |
    | `whatsapp_login` | Interactieve setup — geen taak |
    | `session_status` | Status/planning — hoofdagent coördineert |
    | `cron` | Status/planning — hoofdagent coördineert |
    | `memory_search` | Geef relevante info liever door in de spawn-prompt |
    | `memory_get` | Geef relevante info liever door in de spawn-prompt |
  </Accordion>
</AccordionGroup>

### Subagent-tools aanpassen

Je kunt subagent-tools verder beperken:

```json5
{
  tools: {
    subagents: {
      tools: {
        // deny wint altijd van allow
        deny: ["browser", "firecrawl"],
      },
    },
  },
}
```

Om subagents te beperken tot **alleen** specifieke tools:

```json5
{
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // deny wint nog steeds als ingesteld
      },
    },
  },
}
```

<Note>
Aangepaste deny-vermeldingen worden **toegevoegd aan** de standaard deny-lijst. Als `allow` is ingesteld, zijn alleen die tools beschikbaar (de standaard deny-lijst is hierop nog steeds van toepassing).
</Note>

## Authenticatie

Sub-agentauthenticatie wordt bepaald op **agent-id**, niet op sessietype:

- De auth-store wordt geladen vanuit de `agentDir` van de doelagent
- De auth-profielen van de hoofdagent worden samengevoegd als **fallback** (agentprofielen winnen bij conflicten)
- De samenvoeging is additief — hoofdprofielen zijn altijd beschikbaar als fallbacks

<Note>Volledig geïsoleerde authenticatie per sub-agent wordt momenteel niet ondersteund.</Note>

## Context en systeemprompt

Sub-agents ontvangen een verkorte systeemprompt in vergelijking met de hoofdagent:

- **Inbegrepen:** Tooling-, Workspace- en Runtime-secties, plus `AGENTS.md` en `TOOLS.md`
- **Niet inbegrepen:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

De sub-agent ontvangt ook een taakgerichte systeemprompt die hem instrueert zich te focussen op de toegewezen taak, deze te voltooien en niet als hoofdagent te handelen.

## Sub-agents stoppen

| Methode                | Effect                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `/stop` in de chat     | Breekt de hoofdsessie **en** alle actieve sub-agent-runs die daaruit zijn gestart af |
| `/subagents stop <id>` | Stopt een specifieke sub-agent zonder de hoofdsessie te beïnvloeden                  |
| `runTimeoutSeconds`    | Breekt de sub-agent-run automatisch af na de opgegeven tijd                          |

<Note>
`runTimeoutSeconds` archiveert de sessie **niet** automatisch. De sessie blijft bestaan totdat de normale archieftimer afgaat.
</Note>

## Volledig configuratievoorbeeld

<Accordion title="Complete sub-agent configuration">```json5
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
```</Accordion>

## Beperkingen

<Warning>
- **Best-effort aankondiging:** Als de gateway opnieuw start, gaat lopend aankondigingswerk verloren.
- **Geen geneste spawning:** Sub-agents kunnen geen eigen sub-agents starten.
- **Gedeelde resources:** Sub-agents delen het gatewayproces; gebruik `maxConcurrent` als veiligheidsventiel.
- **Auto-archiveren is best-effort:** Lopende archieftimers gaan verloren bij een herstart van de gateway.
</Warning>

## Zie ook

- [Sessietools](/concepts/session-tool) — details over `sessions_spawn` en andere sessietools
- [Multi-agent-sandbox en tools](/tools/multi-agent-sandbox-tools) — per-agent toolbeperkingen en sandboxing
- [Configuratie](/gateway/configuration) — referentie voor `agents.defaults.subagents`
- [Wachtrij](/concepts/queue) — hoe de `subagent`-lane werkt
