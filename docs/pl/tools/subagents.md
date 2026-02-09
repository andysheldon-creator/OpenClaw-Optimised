---
summary: "Subagenci: uruchamianie odizolowanych przebiegów agentów, które ogłaszają wyniki z powrotem w czacie żądającym"
read_when:
  - Chcesz wykonywać pracę w tle/równolegle za pomocą agenta
  - Zmieniasz politykę sessions_spawn lub narzędzi subagenta
title: "Podagenci"
---

# Podagenci

Sub-agents let you run background tasks without blocking the main conversation. When you spawn a sub-agent, it runs in its own isolated session, does its work, and announces the result back to the chat when finished.

**Use cases:**

- Research a topic while the main agent continues answering questions
- Run multiple long tasks in parallel (web scraping, code analysis, file processing)
- Delegate tasks to specialized agents in a multi-agent setup

## Szybki start

The simplest way to use sub-agents is to ask your agent naturally:

> "Spawn a sub-agent to research the latest Node.js release notes"

The agent will call the `sessions_spawn` tool behind the scenes. When the sub-agent finishes, it announces its findings back into your chat.

You can also be explicit about options:

> "Spawn a sub-agent to analyze the server logs from today. Use gpt-5.2 and set a 5-minute timeout."

## Jak to działa

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

## Konfiguracja

Sub-agents work out of the box with no configuration. Ustawienia domyślne:

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

### Nadpisania per agent

W konfiguracji wieloagentowej możesz ustawić domyślne wartości sub-agentów dla każdego agenta:

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

### Współbieżność

Kontroluj, ile sub-agentów może działać jednocześnie:

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

Sub-agenci używają dedykowanej kolejki (`subagent`) oddzielonej od głównej kolejki agenta, dzięki czemu uruchomienia sub-agentów nie blokują odpowiedzi przychodzących.

### Automatyczna archiwizacja

Sesje sub-agentów są automatycznie archiwizowane po konfigurowalnym czasie:

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

<Note>Archiwizacja zmienia nazwę transkryptu na `*.deleted.<timestamp>` (ten sam folder) — transkrypty są zachowywane, a nie usuwane. Liczniki automatycznej archiwizacji działają w trybie best-effort; oczekujące timery są tracone, jeśli brama zostanie zrestartowana.
</Note>

## Narzędzie `sessions_spawn`

To jest narzędzie, które agent wywołuje, aby tworzyć sub-agentów.

### Parametry

| Parametr            | Typ                      | Domyślna                                | Opis                                                                                             |
| ------------------- | ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `task`              | string                   | _(wymagane)_         | Co powinien zrobić sub-agent                                                                     |
| `etykieta`          | string                   | —                                       | Krótka etykieta identyfikacyjna                                                                  |
| `agentId`           | string                   | _(agent wywołujący)_ | Utwórz pod innym identyfikatorem agenta (musi być dozwolone)                  |
| `wzór`              | string                   | _(opcjonalne)_       | Nadpisz model dla tego sub-agenta                                                                |
| `thinking`          | string                   | _(optional)_         | Nadpisz poziom myślenia (`off`, `low`, `medium`, `high` itd.) |
| `runTimeoutSeconds` | liczba                   | `0` (brak limitu)    | Przerwij działanie sub-agenta po N sekundach                                                     |
| `czyszczenie`       | `"delete"` \\| `"keep"` | `"keep"`                                | `"delete"` archiwizuje natychmiast po ogłoszeniu                                                 |

### Kolejność rozstrzygania modelu

Model sub-agenta jest wybierany w następującej kolejności (pierwsze dopasowanie wygrywa):

1. Jawny parametr `model` w wywołaniu `sessions_spawn`
2. Konfiguracja per agent: `agents.list[].subagents.model`
3. Globalna wartość domyślna: `agents.defaults.subagents.model`
4. Zwykła kolejność rozstrzygania modelu docelowego agenta dla tej nowej sesji

Poziom myślenia jest rozstrzygany w tej kolejności:

1. Jawny parametr `thinking` w wywołaniu `sessions_spawn`
2. Konfiguracja per agent: `agents.list[].subagents.thinking`
3. Globalna wartość domyślna: `agents.defaults.subagents.thinking`
4. W przeciwnym razie nie jest stosowane żadne specyficzne dla sub-agenta nadpisanie poziomu myślenia

<Note>Nieprawidłowe wartości modelu są po cichu pomijane — sub-agent uruchamia się na następnym prawidłowym domyślnym modelu z ostrzeżeniem w wyniku narzędzia.</Note>

### Tworzenie sub-agentów między agentami

Domyślnie sub-agenci mogą być tworzeni tylko pod własnym identyfikatorem agenta. Aby umożliwić agentowi uruchamianie subagentów pod innymi identyfikatorami agentów:

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

<Tip>Użyj narzędzia `agents_list`, aby sprawdzić, które identyfikatory agentów są obecnie dozwolone dla `sessions_spawn`.</Tip>

## Zarządzanie subagentami (`/subagents`)

Użyj komendy ukośnika `/subagents`, aby sprawdzić i kontrolować uruchomienia subagentów w bieżącej sesji:

| Polecenie                                  | Opis                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `/subagents list`                          | Wyświetl listę wszystkich uruchomień subagentów (aktywnych i zakończonych) |
| `/subagents stop <id\\|#\\|all>`         | Zatrzymaj działającego subagenta                                                              |
| `/subagents log <id\\|#> [limit] [tools]` | Wyświetl transkrypcję subagenta                                                               |
| `/subagents info <id\\|#>`                | Pokaż szczegółowe metadane uruchomienia                                                       |
| `/subagents send <id\\|#> <message>`      | Wyślij wiadomość do działającego subagenta                                                    |

You can reference sub-agents by list index (`1`, `2`), run id prefix, full session key, or `last`.

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
    Pokazuje ostatnie 10 wiadomości z transkrypcji subagenta. Dodaj `tools`, aby uwzględnić wiadomości wywołań narzędzi:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">```
/subagents send 3 "Also check the staging environment"
```

    ```
    Wysyła wiadomość do sesji działającego subagenta i czeka do 30 sekund na odpowiedź.
    ```

  </Accordion>
</AccordionGroup>

## Ogłaszanie (Jak wracają wyniki)

Gdy subagent zakończy pracę, przechodzi przez krok **announce**:

1. Końcowa odpowiedź subagenta jest przechwytywana
2. Wiadomość podsumowująca jest wysyłana do sesji głównego agenta wraz z wynikiem, statusem i statystykami
3. Główny agent publikuje w czacie podsumowanie w języku naturalnym

Odpowiedzi ogłoszeń zachowują trasowanie wątków/tematów, gdy jest dostępne (wątki Slack, tematy Telegram, wątki Matrix).

### Statystyki ogłoszenia

Każde ogłoszenie zawiera wiersz statystyk z:

- Czasem trwania wykonania
- Zużycie tokenów (wejście/wyjście/razem)
- Szacowanym kosztem (gdy ceny modeli są skonfigurowane przez `models.providers.*.models[].cost`)
- Kluczem sesji, identyfikatorem sesji oraz ścieżką do transkrypcji

### Status ogłoszenia

Wiadomość ogłoszenia zawiera status wyprowadzony z wyniku wykonania (nie z wyjścia modelu):

- **pomyślne zakończenie** (`ok`) — zadanie ukończone normalnie
- **błąd** — zadanie nie powiodło się (szczegóły błędu w notatkach)
- **przekroczenie czasu** — zadanie przekroczyło `runTimeoutSeconds`
- **nieznany** — nie można było określić statusu

<Tip>
Jeśli nie jest potrzebne ogłoszenie widoczne dla użytkownika, krok podsumowania głównego agenta może zwrócić `NO_REPLY` i nic nie zostanie opublikowane.
Różni się to od `ANNOUNCE_SKIP`, który jest używany w przepływie ogłaszania agent–agent (`sessions_send`).
</Tip>

## Polityka narzędzi

Domyślnie subagenci otrzymują **wszystkie narzędzia z wyjątkiem** zestawu narzędzi zabronionych, które są niebezpieczne lub niepotrzebne dla zadań w tle:

<AccordionGroup>
  <Accordion title="Default denied tools">| Denied tool | Reason |
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

### Dostosowywanie narzędzi subagentów

Możesz dodatkowo ograniczyć narzędzia subagentów:

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

Aby ograniczyć subagentów **wyłącznie** do określonych narzędzi:

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
Niestandardowe wpisy deny są **dodawane do** domyślnej listy deny. Jeśli ustawiono `allow`, dostępne są tylko te narzędzia (domyślna lista deny nadal obowiązuje dodatkowo).
</Note>

## Uwierzytelnianie

Uwierzytelnianie subagenta jest rozstrzygane według **identyfikatora agenta**, a nie typu sesji:

- Magazyn uwierzytelniania jest ładowany z `agentDir` docelowego agenta
- Profile uwierzytelniania głównego agenta są scalane jako **zapasowe** (profile agenta mają pierwszeństwo w przypadku konfliktów)
- Scalanie jest addytywne — profile głównego agenta są zawsze dostępne jako zapasowe

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

## Ograniczenia

<Warning>
- **Best-effort announce:** If the gateway restarts, pending announce work is lost.
- **No nested spawning:** Sub-agents cannot spawn their own sub-agents.
- **Shared resources:** Sub-agents share the gateway process; use `maxConcurrent` as a safety valve.
- **Auto-archive is best-effort:** Pending archive timers are lost on gateway restart.
</Warning>

## Zobacz także

- [Session Tools](/concepts/session-tool) — details on `sessions_spawn` and other session tools
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — per-agent tool restrictions and sandboxing
- [Configuration](/gateway/configuration) — `agents.defaults.subagents` reference
- [Queue](/concepts/queue) — how the `subagent` lane works
