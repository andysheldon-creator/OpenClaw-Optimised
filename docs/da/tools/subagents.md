---
summary: "Sub-agenter: opstart af isolerede agentkørsler, der annoncerer resultater tilbage til anmoderens chat"
read_when:
  - Du ønsker baggrunds-/parallelarbejde via agenten
  - Du ændrer sessions_spawn eller politik for sub-agent-værktøjer
title: "Sub-agenter"
---

# Sub-agenter

Sub-agents let you run background tasks without blocking the main conversation. Når du opretter en sub-agent, kører den i sin egen isolerede session, udfører sit arbejde og annoncerer resultatet tilbage i chatten, når den er færdig.

**Anvendelsestilfælde:**

- Undersøg et emne, mens hovedagenten fortsætter med at besvare spørgsmål
- Kør flere lange opgaver parallelt (web scraping, kodeanalyse, filbehandling)
- Uddelegér opgaver til specialiserede agenter i en multi-agent-opsætning

## Hurtig start

Den nemmeste måde at bruge sub-agenter på er at bede din agent naturligt:

> "Opret en sub-agent til at undersøge de seneste Node.js-udgivelsesnoter"

Agenten kalder værktøjet `sessions_spawn` bag kulisserne. Når sub-agenten er færdig, annoncerer den sine resultater tilbage i din chat.

Du kan også være eksplicit omkring muligheder:

> "Opret en sub-agent til at analysere serverlogfilerne fra i dag.
> Brug gpt-5.2 og sæt en timeout på 5 minutter." Hovedagenten kalder `sessions_spawn` med en opgavebeskrivelse.

## Sådan virker det

<Steps>
  <Step title="Main agent spawns">
    Kaldet er **ikke-blokerende** — hovedagenten får straks `{ status: "accepted", runId, childSessionKey }` tilbage.     
    En ny isoleret session oprettes (`agent:
    :subagent:
    `) på den dedikerede `subagent`-købane.
  
  </Step>
  <Step title="Sub-agent runs in the background">Når sub-agenten er færdig, annoncerer den sine resultater tilbage til den anmodende chat.<agentId>Hovedagenten poster et resumé i naturligt sprog.<uuid>Sub-agent-sessionen autoarkiveres efter 60 minutter (kan konfigureres).</Step>
  <Step title="Result is announced">
    Transskriptioner bevares. Hver sub-agent har sin **egen** kontekst og tokenforbrug.
  </Step>
  <Step title="Session is archived">
    Indstil en billigere model for sub-agenter for at spare omkostninger — se [Setting a Default Model](#setting-a-default-model) nedenfor. Sub-agenter fungerer out of the box uden konfiguration.
  </Step>
</Steps>

<Tip>
Model: målagentens normale modelvalg (medmindre `subagents.model` er sat) Tænkning: ingen tilsidesættelse for sub-agenter (medmindre `subagents.thinking` er sat)
</Tip>

## Konfiguration

Maks. samtidige: 8 Standarder:

- Autoarkivering: efter 60 minutter
- Indstilling af en standardmodel
- Brug en billigere model til sub-agenter for at spare på token-omkostninger:
- {
  agents: {
  defaults: {
  subagents: {
  model: "minimax/MiniMax-M2.1",
  },
  },
  },
  }

### Indstilling af et standard-tænkeniveau

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

### Per-Agent Overrides

In a multi-agent setup, you can set sub-agent defaults per agent:

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

### Samtidighed

Control how many sub-agents can run at the same time:

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

Sub-agents use a dedicated queue lane (`subagent`) separate from the main agent queue, so sub-agent runs don't block inbound replies.

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

<Note>
Archive renames the transcript to `*.deleted.<timestamp>` (same folder) — transcripts are preserved, not deleted. Auto-archive timers are best-effort; pending timers are lost if the gateway restarts.
</Note>

## The `sessions_spawn` Tool

This is the tool the agent calls to create sub-agents.

### Parametre

| Parameter           | Type                     | Standard                              | Beskrivelse                                                                                       |
| ------------------- | ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `task`              | string                   | _(required)_       | What the sub-agent should do                                                                      |
| `etiket`            | string                   | —                                     | Short label for identification                                                                    |
| `agentId`           | string                   | _(caller's agent)_ | Spawn under a different agent id (must be allowed)                             |
| `model`             | string                   | _(optional)_       | Override the model for this sub-agent                                                             |
| `thinking`          | string                   | _(optional)_       | Override thinking level (`off`, `low`, `medium`, `high`, etc.) |
| `runTimeoutSeconds` | number                   | `0` (no limit)     | Abort the sub-agent after N seconds                                                               |
| `oprydning`         | `"delete"` \\| `"keep"` | `"keep"`                              | `"delete"` archives immediately after announce                                                    |

### Model Resolution Order

The sub-agent model is resolved in this order (first match wins):

1. Explicit `model` parameter in the `sessions_spawn` call
2. Per-agent config: `agents.list[].subagents.model`
3. Global default: `agents.defaults.subagents.model`
4. Target agent’s normal model resolution for that new session

Thinking level is resolved in this order:

1. Explicit `thinking` parameter in the `sessions_spawn` call
2. Per-agent config: `agents.list[].subagents.thinking`
3. Global default: `agents.defaults.subagents.thinking`
4. Otherwise no sub-agent-specific thinking override is applied

<Note>
Invalid model values are silently skipped — the sub-agent runs on the next valid default with a warning in the tool result.
</Note>

### Cross-Agent Spawning

By default, sub-agents can only spawn under their own agent id. To allow an agent to spawn sub-agents under other agent ids:

```json5
{
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

<Tip>
Use the `agents_list` tool to discover which agent ids are currently allowed for `sessions_spawn`.
</Tip>

## Managing Sub-Agents (`/subagents`)

Use the `/subagents` slash command to inspect and control sub-agent runs for the current session:

| Kommando                                   | Beskrivelse                                                       |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `/subagents list`                          | List all sub-agent runs (active and completed) |
| `/subagents stop <id\\|#\\|all>`         | Stop a running sub-agent                                          |
| `/subagents log <id\\|#> [limit] [tools]` | View sub-agent transcript                                         |
| `/subagents info <id\\|#>`                | Show detailed run metadata                                        |
| `/subagents send <id\\|#> <message>`      | Send a message to a running sub-agent                             |

You can reference sub-agents by list index (`1`, `2`), run id prefix, full session key, or `last`.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">
    ```
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
  <Accordion title="Example: inspect a sub-agent">
    ```
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
  <Accordion title="Example: view sub-agent log">
    ```
    /subagents log 1 10
    ```

    ````
    Shows the last 10 messages from the sub-agent's transcript. Add `tools` to include tool call messages:
    
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
    Sends a message into the running sub-agent's session and waits up to 30 seconds for a reply.
    ```

  </Accordion>
</AccordionGroup>

## Announce (How Results Come Back)

When a sub-agent finishes, it goes through an **announce** step:

1. The sub-agent's final reply is captured
2. A summary message is sent to the main agent's session with the result, status, and stats
3. The main agent posts a natural-language summary to your chat

Announce-svar bevarer tråd-/emnerouting, når det er tilgængeligt (Slack-tråde, Telegram-emner, Matrix-tråde).

### Announce Stats

Each announce includes a stats line with:

- Runtime duration
- Tokenforbrug (input/output/i alt)
- Estimated cost (when model pricing is configured via `models.providers.*.models[].cost`)
- Session key, session id, and transcript path

### Announce Status

The announce message includes a status derived from the runtime outcome (not from model output):

- **successful completion** (`ok`) — task completed normally
- **error** — task failed (error details in notes)
- **timeout** — task exceeded `runTimeoutSeconds`
- **unknown** — status could not be determined

<Tip>
If no user-facing announcement is needed, the main-agent summarize step can return `NO_REPLY` and nothing is posted.
This is different from `ANNOUNCE_SKIP`, which is used in agent-to-agent announce flow (`sessions_send`).
</Tip>

## Tool Policy

By default, sub-agents get **all tools except** a set of denied tools that are unsafe or unnecessary for background tasks:

<AccordionGroup>
  <Accordion title="Default denied tools">
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
    | `memory_get` | Pass relevant info in spawn prompt instead |
  </Accordion>
</AccordionGroup>

### Customizing Sub-Agent Tools

You can further restrict sub-agent tools:

```json5
{
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

To restrict sub-agents to **only** specific tools:

```json5
{
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
Custom deny entries are **added to** the default deny list. If `allow` is set, only those tools are available (the default deny list still applies on top).
</Note>

## Autentificering

Sub-agent-autentificering afgøres af **agent-id**, ikke af sessionstype:

- The auth store is loaded from the target agent's `agentDir`
- The main agent's auth profiles are merged in as a **fallback** (agent profiles win on conflicts)
- The merge is additive — main profiles are always available as fallbacks

<Note>Fuldt isoleret godkendelse pr. underagent understøttes i øjeblikket ikke.</Note>

## Kontekst og systemprompt

Underagenter modtager en reduceret systemprompt sammenlignet med hovedagenten:

- **Inkluderet:** Tooling-, Workspace- og Runtime-sektioner samt `AGENTS.md` og `TOOLS.md`
- **Ikke inkluderet:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

Underagenten modtager også en opgavefokuseret systemprompt, der instruerer den i at forblive fokuseret på den tildelte opgave, fuldføre den og ikke agere som hovedagenten.

## Stop af underagenter

| Metode                 | Effekt                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `/stop` i chatten      | Afbryder hovedsessionen **og** alle aktive underagentkørsler, der er oprettet fra den |
| `/subagents stop <id>` | Stopper en specifik underagent uden at påvirke hovedsessionen                         |
| `runTimeoutSeconds`    | Afbryder automatisk underagentkørslen efter den angivne tid                           |

<Note>
`runTimeoutSeconds` does **not** auto-archive the session. Sessionen forbliver, indtil den normale arkiveringstimer udløses.
</Note>

## Fuldt konfigurationseksempel

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

## Begrænsninger

<Warning>
- **Best-effort-annoncering:** Hvis gatewayen genstarter, går afventende annonceringsarbejde tabt.
- **Ingen indlejret oprettelse:** Underagenter kan ikke oprette deres egne underagenter.
- **Delte ressourcer:** Underagenter deler gateway-processen; brug `maxConcurrent` som en sikkerhedsventil.
- **Auto-arkivering er best-effort:** Afventende arkiveringstimere går tabt ved genstart af gatewayen.
</Warning>

## Se også

- [Sessionværktøjer](/concepts/session-tool) — detaljer om `sessions_spawn` og andre sessionsværktøjer
- [Multi-agent-sandkasse og værktøjer](/tools/multi-agent-sandbox-tools) — værktøjsbegrænsninger pr. agent og sandkassemiljø
- [Konfiguration](/gateway/configuration) — reference til `agents.defaults.subagents`
- [Kø](/concepts/queue) — hvordan `subagent`-banen fungerer
