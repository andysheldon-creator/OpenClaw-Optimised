---
summary: "Mga sub-agent: pag-spawn ng mga hiwalay na agent run na nag-aanunsyo ng mga resulta pabalik sa requester chat"
read_when:
  - Gusto mo ng background/parallel na trabaho gamit ang agent
  - Binabago mo ang sessions_spawn o patakaran ng sub-agent tool
title: "Mga Sub-Agent"
---

# Mga Sub-Agent

Pinapayagan ka ng mga sub-agent na magpatakbo ng mga background task nang hindi hinaharangan ang pangunahing usapan. Kapag nag-spawn ka ng isang sub-agent, tatakbo ito sa sarili nitong hiwalay na session, gagawin ang trabaho nito, at iaanunsyo ang resulta pabalik sa chat kapag tapos na.

**Mga use case:**

- Mag-research ng isang paksa habang ang pangunahing agent ay patuloy na sumasagot ng mga tanong
- Magpatakbo ng maraming mahahabang gawain nang sabay-sabay (web scraping, pagsusuri ng code, pagproseso ng file)
- I-delegate ang mga gawain sa mga espesyalisadong agent sa isang multi-agent na setup

## Mabilis na pagsisimula

Ang pinakasimpleng paraan para gumamit ng mga sub-agent ay ang natural na paghingi sa iyong agent:

> "Mag-spawn ng isang sub-agent para i-research ang pinakabagong Node.js release notes"

Tatawagin ng agent ang `sessions_spawn` tool sa likod ng mga eksena. Kapag natapos ang sub-agent, iaanunsyo nito ang mga natuklasan pabalik sa iyong chat.

Maaari ka ring maging tahasan tungkol sa mga opsyon:

> "Mag-spawn ng isang sub-agent para suriin ang mga server log mula ngayong araw. Gumamit ng gpt-5.2 at magtakda ng 5-minutong timeout."

## Paano Ito Gumagana

<Steps>
  <Step title="Main agent spawns">
    Tinatawag ng pangunahing agent ang `sessions_spawn` na may paglalarawan ng gawain. Ang tawag ay **non-blocking** — agad na babalik sa pangunahing agent ang `{ status: "accepted", runId, childSessionKey }`.
  </Step>
  <Step title="Sub-agent runs in the background">
    A new isolated session is created (`agent:<agentId>Isang bagong hiwalay na session ang nililikha (`agent:<uuid>:subagent:</Step>
  <Step title="Result is announced">
    `) sa dedikadong `subagent` queue lane. The main agent posts a natural-language summary.
  </Step>
  <Step title="Session is archived">
    Kapag natapos ang sub-agent, iaanunsyo nito ang mga natuklasan pabalik sa chat ng humiling. Ang pangunahing agent ay nagpo-post ng buod sa natural na wika.
  </Step>
</Steps>

<Tip>
Ang session ng sub-agent ay awtomatikong ina-archive pagkalipas ng 60 minuto (na maaaring i-configure). Pinananatili ang mga transcript.
</Tip>

## Konpigurasyon

Ang bawat sub-agent ay may **sarili nitong** context at paggamit ng token. Mga default:

- Magtakda ng mas murang modelo para sa mga sub-agent upang makatipid sa gastos — tingnan ang [Setting a Default Model](#setting-a-default-model) sa ibaba.
- Gumagana ang mga sub-agent agad nang walang anumang configuration.
- Model: karaniwang pagpili ng modelo ng target agent (maliban kung nakatakda ang `subagents.model`)
- Thinking: walang override para sa sub-agent (maliban kung nakatakda ang `subagents.thinking`)

### Max na sabay-sabay: 8

Auto-archive: pagkalipas ng 60 minuto

```json5
Setting a Default Model
```

### Gumamit ng mas murang modelo para sa mga sub-agent upang makatipid sa gastos sa token:

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

### Concurrency

Kontrolin kung ilang sub-agent ang maaaring tumakbo nang sabay-sabay:

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

Gumagamit ang mga sub-agent ng isang nakalaang queue lane (`subagent`) na hiwalay sa pangunahing agent queue, kaya hindi hinaharangan ng mga run ng sub-agent ang mga papasok na sagot.

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

<Note>Pinapalitan ng archive ang pangalan ng transcript sa `*.deleted.<timestamp>` (parehong folder) — pinapanatili ang mga transcript, hindi sila binubura. Ang mga auto-archive timer ay best-effort; nawawala ang mga nakabinbing timer kapag nag-restart ang gateway.
</Note>

## Ang `sessions_spawn` Tool

Ito ang tool na tinatawag ng agent para lumikha ng mga sub-agent.

### Parameters

| Parameter           | Uri                  | Default                                    | Description                                                                                                  |
| ------------------- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `task`              | string               | _(kinakailangan)_       | Kung ano ang dapat gawin ng sub-agent                                                                        |
| `label`             | string               | —                                          | Maikling label para sa pagkakakilanlan                                                                       |
| `agentId`           | string               | _(agent ng tumatawag)_  | Mag-spawn sa ilalim ng ibang agent id (dapat pinapayagan)                                 |
| `model`             | string               | _(opsyonal)_            | I-override ang model para sa sub-agent na ito                                                                |
| `thinking`          | string               | _(opsyonal)_            | I-override ang antas ng pag-iisip (`off`, `low`, `medium`, `high`, atbp.) |
| `runTimeoutSeconds` | numero               | `0` (walang limitasyon) | I-abort ang sub-agent pagkatapos ng N segundo                                                                |
| `cleanup`           | "delete" \\| "keep" | "keep"                                     | "delete" ay agad na nag-a-archive pagkatapos ng announce                                                     |

### Ayos ng Pagresolba ng Model

Nireresolba ang model ng sub-agent sa ganitong pagkakasunod-sunod (unang tumugma ang nananalo):

1. Tahasang `model` na parameter sa tawag na `sessions_spawn`
2. Config kada agent: `agents.list[].subagents.model`
3. Pangkalahatang default: `agents.defaults.subagents.model`
4. Karaniwang resolusyon ng model ng target na agent para sa bagong session na iyon

Ang antas ng pag-iisip ay nireresolba sa ganitong pagkakasunod-sunod:

1. Tahasang `thinking` na parameter sa tawag na `sessions_spawn`
2. Config kada agent: `agents.list[].subagents.thinking`
3. Pangkalahatang default: `agents.defaults.subagents.thinking`
4. Kung hindi, walang inilalapat na sub-agent–specific na override sa pag-iisip

<Note>Ang mga hindi wastong value ng model ay tahimik na nilalaktawan — tatakbo ang sub-agent sa susunod na wastong default na may babala sa resulta ng tool.</Note>

### Pag-spawn sa Iba’t Ibang Agent

Bilang default, maaari lamang mag-spawn ang mga sub-agent sa ilalim ng sarili nilang agent id. 1. Upang pahintulutan ang isang agent na lumikha ng mga sub-agent sa ilalim ng ibang agent ids:

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

<Tip>3. Gamitin ang `agents_list` tool upang matuklasan kung aling mga agent id ang kasalukuyang pinapayagan para sa `sessions_spawn`.</Tip>

## 4. Pamamahala ng mga Sub-Agent (`/subagents`)

5. Gamitin ang `/subagents` slash command upang siyasatin at kontrolin ang mga sub-agent run para sa kasalukuyang session:

| Command                                    | Description                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `/subagents list`                          | 6. Ilista ang lahat ng sub-agent run (aktibo at natapos) |
| `/subagents stop <id\\|#\\|all>`         | 7. Ihinto ang isang tumatakbong sub-agent                                   |
| `/subagents log <id\\|#> [limit] [tools]` | 8. Tingnan ang transcript ng sub-agent                                      |
| `/subagents info <id\\|#>`                | 9. Ipakita ang detalyadong metadata ng run                                  |
| `/subagents send <id\\|#> <message>`      | 10. Magpadala ng mensahe sa isang tumatakbong sub-agent                     |

11. Maaari mong tukuyin ang mga sub-agent gamit ang list index (`1`, `2`), run id prefix, buong session key, o `last`.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">12. ```
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
  <Accordion title="Example: inspect a sub-agent">14. ```
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
  <Accordion title="Example: view sub-agent log">16. ```
    /subagents log 1 10
    ```

    ````
    17. Ipinapakita ang huling 10 mensahe mula sa transcript ng sub-agent. Idagdag ang `tools` upang isama ang mga mensahe ng tool call:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">18. ```
    /subagents send 3 "Also check the staging environment"
    ```

    ```
    19. Nagpapadala ng mensahe sa tumatakbong session ng sub-agent at naghihintay ng hanggang 30 segundo para sa tugon.
    ```

  </Accordion>
</AccordionGroup>

## 20. Anunsyo (Paano Bumabalik ang mga Resulta)

21. Kapag natapos ang isang sub-agent, dumadaan ito sa isang hakbang na **announce**:

1. 22. Kinukuha ang huling tugon ng sub-agent
2. 23. Isang buod na mensahe ang ipinapadala sa session ng pangunahing agent na may resulta, status, at mga estadistika
3. 24. Nagpo-post ang pangunahing agent ng buod sa natural na wika sa iyong chat

Pinapanatili ng mga announce reply ang thread/topic routing kapag available (Slack threads, Telegram topics, Matrix threads).

### 25. Mga Estadistika ng Anunsyo

26. Bawat anunsyo ay may kasamang linya ng estadistika na may:

- 27. Tagal ng runtime
- Paggamit ng token (input/output/kabuuan)
- 28. Tinatayang gastos (kapag ang pagpepresyo ng modelo ay naka-configure sa pamamagitan ng `models.providers.*.models[].cost`)
- 29. Session key, session id, at path ng transcript

### 30. Status ng Anunsyo

31. Kasama sa mensahe ng anunsyo ang isang status na hinango mula sa kinalabasan ng runtime (hindi mula sa output ng modelo):

- 32. **matagumpay na pagkumpleto** (`ok`) — normal na natapos ang gawain
- 33. **error** — nabigo ang gawain (mga detalye ng error ay nasa notes)
- 34. **timeout** — lumampas ang gawain sa `runTimeoutSeconds`
- 35. **unknown** — hindi matukoy ang status

<Tip>
36. Kung walang kailangang anunsyong nakikita ng user, ang hakbang na pagbuod ng pangunahing agent ay maaaring magbalik ng `NO_REPLY` at walang ipo-post.
37. Iba ito sa `ANNOUNCE_SKIP`, na ginagamit sa daloy ng anunsyo ng agent-sa-agent (`sessions_send`).
</Tip>

## 38. Patakaran sa Tool

39. Bilang default, nakakakuha ang mga sub-agent ng **lahat ng tool maliban** sa isang set ng mga ipinagbabawal na tool na hindi ligtas o hindi kailangan para sa mga background task:

<AccordionGroup>
  <Accordion title="Default denied tools">40. 
    | Denied tool | Reason |
    |-------------|--------|
    | `sessions_list` | Pamamahala ng session — ang pangunahing agent ang nag-o-orchestrate |
    | `sessions_history` | Pamamahala ng session — ang pangunahing agent ang nag-o-orchestrate |
    | `sessions_send` | Pamamahala ng session — ang pangunahing agent ang nag-o-orchestrate |
    | `sessions_spawn` | Walang nested fan-out (hindi maaaring lumikha ng sub-agent ang mga sub-agent) |
    | `gateway` | System admin — mapanganib mula sa sub-agent |
    | `agents_list` | System admin |
    | `whatsapp_login` | Interactive setup — hindi isang gawain |
    | `session_status` | Status/iskedyul — ang pangunahing agent ang nagko-coordinate |
    | `cron` | Status/iskedyul — ang pangunahing agent ang nagko-coordinate |
    | `memory_search` | Ipasa na lang ang kaugnay na impormasyon sa spawn prompt |
    | `memory_get` | Ipasa na lang ang kaugnay na impormasyon sa spawn prompt |
  </Accordion>
</AccordionGroup>

### 41. Pag-customize ng Mga Tool ng Sub-Agent

42. Maaari mo pang higpitan ang mga tool ng sub-agent:

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

44. Upang higpitan ang mga sub-agent sa **tanging** mga partikular na tool:

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
46. Ang mga custom deny entry ay **idinadagdag sa** default na deny list. 47. Kung naka-set ang `allow`, tanging ang mga tool na iyon lamang ang magagamit (patuloy na nalalapat ang default na deny list sa ibabaw nito).
</Note>

## Authentication

Ang auth ng sub-agent ay nireresolba ayon sa **agent id**, hindi ayon sa uri ng session:

- 48. Ang auth store ay nilo-load mula sa `agentDir` ng target agent
- 49. Ang mga auth profile ng pangunahing agent ay isinasama bilang isang **fallback** (nangunguna ang mga profile ng agent kapag may conflict)
- 50. Ang pagsasanib ay additive — ang mga pangunahing profile ay laging magagamit bilang mga fallback

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

## Mga Limitasyon

<Warning>
- **Best-effort announce:** If the gateway restarts, pending announce work is lost.
- **No nested spawning:** Sub-agents cannot spawn their own sub-agents.
- **Shared resources:** Sub-agents share the gateway process; use `maxConcurrent` as a safety valve.
- **Auto-archive is best-effort:** Pending archive timers are lost on gateway restart.
</Warning>

## Tingnan Din

- [Session Tools](/concepts/session-tool) — details on `sessions_spawn` and other session tools
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — per-agent tool restrictions and sandboxing
- [Configuration](/gateway/configuration) — `agents.defaults.subagents` reference
- [Queue](/concepts/queue) — how the `subagent` lane works
