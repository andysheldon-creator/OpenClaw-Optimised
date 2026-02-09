---
summary: "Sub-agenter: starta isolerade agentkörningar som annonserar resultat tillbaka till den begärande chatten"
read_when:
  - Du vill ha bakgrunds-/parallellt arbete via agenten
  - Du ändrar sessions_spawn eller policy för sub-agentverktyg
title: "Sub-agenter"
---

# Sub-agenter

Sub-agents let you run background tasks without blocking the main conversation. When you spawn a sub-agent, it runs in its own isolated session, does its work, and announces the result back to the chat when finished.

**Use cases:**

- Research a topic while the main agent continues answering questions
- Run multiple long tasks in parallel (web scraping, code analysis, file processing)
- Delegate tasks to specialized agents in a multi-agent setup

## Snabbstart

The simplest way to use sub-agents is to ask your agent naturally:

> "Spawn a sub-agent to research the latest Node.js release notes"

The agent will call the `sessions_spawn` tool behind the scenes. When the sub-agent finishes, it announces its findings back into your chat.

You can also be explicit about options:

> "Spawn a sub-agent to analyze the server logs from today. Use gpt-5.2 and set a 5-minute timeout."

## Hur det fungerar

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

## Konfiguration

Sub-agents work out of the box with no configuration. Standardvärden:

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

### Åsidosättningar per agent

I en multiagentkonfiguration kan du ange standardvärden för underagenter per agent:

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

### Samtidighet

Styr hur många underagenter som kan köras samtidigt:

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

Underagenter använder en dedikerad köfil (lane) (`subagent`) som är separerad från huvudagentens kö, så att körningar av underagenter inte blockerar inkommande svar.

### Automatisk arkivering

Underagentsessioner arkiveras automatiskt efter en konfigurerbar tidsperiod:

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

<Note>Arkivering byter namn på transkriptet till `*.deleted.<timestamp>` (samma mapp) — transkript bevaras, raderas inte. Timers för automatisk arkivering är best-effort; väntande timers går förlorade om gatewayen startas om.
</Note>

## Verktyget `sessions_spawn`

Detta är verktyget som agenten anropar för att skapa underagenter.

### Parametrar

| Parameter           | Typ                  | Default                                 | Description                                                                                   |
| ------------------- | -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `task`              | string               | _(obligatorisk)_     | Vad underagenten ska göra                                                                     |
| `etikett`           | string               | —                                       | Kort etikett för identifiering                                                                |
| `agentId`           | string               | _(anroparens agent)_ | Skapa under en annan agent-id (måste vara tillåtet)                        |
| `Modell`            | string               | _(valfri)_           | Åsidosätt modellen för denna underagent                                                       |
| `thinking`          | string               | _(valfri)_           | Åsidosätt tänkenivå (`off`, `low`, `medium`, `high`, etc.) |
| `runTimeoutSeconds` | nummer               | `0` (ingen gräns)    | Avbryt underagenten efter N sekunder                                                          |
| `rensa upp`         | "delete" \\| "keep" | "keep"                                  | "delete" arkiverar omedelbart efter annonsering                                               |

### Ordning för modellupplösning

Underagentens modell löses upp i denna ordning (första träffen vinner):

1. Explicit `model`-parameter i `sessions_spawn`-anropet
2. Per-agent-konfiguration: `agents.list[].subagents.model`
3. Global standard: `agents.defaults.subagents.model`
4. Målagentens normala modellupplösning för den nya sessionen

Tänkenivån löses upp i denna ordning:

1. Explicit `thinking`-parameter i `sessions_spawn`-anropet
2. Per-agent-konfiguration: `agents.list[].subagents.thinking`
3. Global standard: `agents.defaults.subagents.thinking`
4. Annars tillämpas ingen underagent-specifik åsidosättning av tänkenivå

<Note>Ogiltiga modellvärden hoppas över tyst — underagenten körs på nästa giltiga standard med en varning i verktygsresultatet.</Note>

### Spawning över agenter

Som standard kan underagenter endast skapas under sin egen agent-id. 1. För att tillåta en agent att skapa underagenter under andra agent-id:n:

```json5
2. {
  agents: {
    list: [
      {
        id: "orchestrator",
        subagents: {
          allowAgents: ["researcher", "coder"], // or ["*"] to allow any
        },
      },
    ],
  },
}
```

<Tip>3. 
Använd verktyget `agents_list` för att ta reda på vilka agent-id:n som för närvarande är tillåtna för `sessions_spawn`.</Tip>

## 4. Hantering av underagenter (`/subagents`)

5. Använd snedstreckskommandot `/subagents` för att granska och styra körningar av underagenter för den aktuella sessionen:

| Kommando                                   | Beskrivning                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `/subagents list`                          | 6. Lista alla körningar av underagenter (aktiva och slutförda) |
| `/subagents stop <id\\|#\\|all>`         | 7. Stoppa en körande underagent                                                   |
| `/subagents log <id\\|#> [limit] [tools]` | 8. Visa underagentens transkript                                                  |
| `/subagents info <id\\|#>`                | 9. Visa detaljerad körningsmetadata                                               |
| `/subagents send <id\\|#> <message>`      | 10. Skicka ett meddelande till en körande underagent                              |

11. Du kan referera till underagenter via listindex (`1`, `2`), kör-id-prefix, fullständig sessionsnyckel eller `last`.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">12. 
    ```
    /subagents list
    ```

    ````
    13. ```
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
  <Accordion title="Example: inspect a sub-agent">14. 
    ```
    /subagents info 1
    ```

    ````
    15. ```
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
  <Accordion title="Example: view sub-agent log">16. 
    ```
    /subagents log 1 10
    ```

    ````
    17. Visar de senaste 10 meddelandena från underagentens transkript. Lägg till `tools` för att inkludera meddelanden om verktygsanrop:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">18. 
    ```
    /subagents send 3 "Also check the staging environment"
    ```

    ```
    19. Skickar ett meddelande till den körande underagentens session och väntar upp till 30 sekunder på ett svar.
    ```

  </Accordion>
</AccordionGroup>

## 20. Annonsera (hur resultaten kommer tillbaka)

21. När en underagent avslutas går den igenom ett **announce**-steg:

1. 22. Underagentens slutliga svar fångas
2. 23. Ett sammanfattningsmeddelande skickas till huvudagentens session med resultat, status och statistik
3. 24. Huvudagenten publicerar en sammanfattning i naturligt språk i din chatt

Announce-svar bevarar tråd-/ämnesroutning när det finns (Slack-trådar, Telegram-ämnen, Matrix-trådar).

### 25. Announce-statistik

26. Varje announce innehåller en statistikrad med:

- 27. Körtidens längd
- Tokenförbrukning (in/ut/totalt)
- 28. Uppskattad kostnad (när modellprissättning är konfigurerad via `models.providers.*.models[].cost`)
- 29. Sessionsnyckel, sessions-id och transkriptsökväg

### 30. Announce-status

31. Announce-meddelandet innehåller en status som härleds från körningens utfall (inte från modellens utdata):

- 32. **lyckat slutförande** (`ok`) — uppgiften slutfördes normalt
- 33. **fel** — uppgiften misslyckades (feldetaljer i anteckningar)
- 34. **timeout** — uppgiften överskred `runTimeoutSeconds`
- 35. **okänd** — status kunde inte fastställas

<Tip>
36. Om ingen användarvänd annonsering behövs kan huvudagentens sammanfattningssteg returnera `NO_REPLY` och ingenting publiceras.
37. Detta skiljer sig från `ANNOUNCE_SKIP`, som används i agent‑till‑agent‑annonseringsflödet (`sessions_send`).
</Tip>

## 38. Verktygspolicy

39. Som standard får underagenter **alla verktyg utom** en uppsättning nekade verktyg som är osäkra eller onödiga för bakgrundsuppgifter:

<AccordionGroup>
  <Accordion title="Default denied tools">40. 
    | Denied tool | Reason |
    |-------------|--------|
    | `sessions_list` | Session management — main agent orchestrates |
    | `sessions_history` | Session management — main agent orchestrates |
    | `sessions_send` | Session management — main agent orchestrates |
    | `sessions_spawn` | No nested fan-out (sub-agents cannot spawn sub-agents) |
    | `gateway` | System admin — dangerous from sub-agent |
    | `agents_list` | System admin |
    | `whatsapp_login` | Interactive setup — not a task |
    | `session_status` | Status/scheduling — main agent coordinates |
    | `cron` | Status/scheduling — main agent coordinates |
    | `memory_search` | Pass relevant info in spawn prompt instead |
    | `memory_get` | Pass relevant info in spawn prompt instead |</Accordion>
</AccordionGroup>

### 41. Anpassa verktyg för underagenter

42. Du kan ytterligare begränsa underagenters verktyg:

```json5
43. {
  tools: {
    subagents: {
      tools: {
        // deny always wins over allow
        deny: ["browser", "firecrawl"],
      },
    },
  },
}
```

44. För att begränsa underagenter till **endast** specifika verktyg:

```json5
45. {
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // deny still wins if set
      },
    },
  },
}
```

<Note>
46. Anpassade deny-poster **läggs till** i standardlistan för deny. 47. Om `allow` är inställt är endast dessa verktyg tillgängliga (standardlistan för deny gäller fortfarande ovanpå).
</Note>

## Autentisering

Sub-agentautentisering löses via **agent-id**, inte via sessionstyp:

- 48. Autentiseringslagret laddas från målagentens `agentDir`
- 49. Huvudagentens autentiseringsprofiler slås samman som en **fallback** (agentprofiler vinner vid konflikter)
- 50. Sammanfogningen är additiv — huvudprofiler är alltid tillgängliga som fallbacks

<Note>Fullständigt isolerad autentisering per underagent stöds för närvarande inte.</Note>

## Context and System Prompt

Underagenter får en reducerad systemprompt jämfört med huvudagenten:

- **Inkluderat:** Verktyg, Arbetsyta, Runtime-avsnitt, samt `AGENTS.md` och `TOOLS.md`
- **Inte inkluderat:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

Underagenten får också en uppgiftsfokuserad systemprompt som instruerar den att hålla fokus på den tilldelade uppgiften, slutföra den och inte agera som huvudagent.

## Stoppa underagenter

| Metod                  | Effekt                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `/stop` i chatten      | Avbryter huvudsessionen **och** alla aktiva underagentkörningar som skapats från den |
| `/subagents stop <id>` | Stoppar en specifik underagent utan att påverka huvudsessionen                       |
| `runTimeoutSeconds`    | Avbryter automatiskt underagentkörningen efter den angivna tiden                     |

<Note>
`runTimeoutSeconds` autoarkiverar **inte** sessionen. Sessionen kvarstår tills den normala arkiveringstimern utlöses.
</Note>

## Fullständigt konfigurationsexempel

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

## Begränsningar

<Warning>
- **Bästa möjliga tillkännagivande:** Om gatewayen startar om går väntande tillkännagivandearbete förlorat.
- **Ingen nästlad skapande:** Underagenter kan inte skapa egna underagenter.
- **Delade resurser:** Underagenter delar gateway-processen; använd `maxConcurrent` som en säkerhetsventil.
- **Autoarkivering sker enligt bästa förmåga:** Väntande arkiveringstimers går förlorade vid omstart av gatewayen.
</Warning>

## Se även

- [Session Tools](/concepts/session-tool) — details on `sessions_spawn` and other session tools
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — per-agent tool restrictions and sandboxing
- [Configuration](/gateway/configuration) — `agents.defaults.subagents` reference
- [Queue](/concepts/queue) — how the `subagent` lane works
