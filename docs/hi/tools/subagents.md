---
summary: "उप-एजेंट: ऐसे पृथक एजेंट रन उत्पन्न करना जो अनुरोधकर्ता चैट को परिणामों की घोषणा करते हैं"
read_when:
  - आप एजेंट के माध्यम से पृष्ठभूमि/समानांतर कार्य चाहते हैं
  - आप sessions_spawn या उप-एजेंट टूल नीति बदल रहे हैं
title: "उप-एजेंट"
---

# उप-एजेंट

Sub-agents let you run background tasks without blocking the main conversation. When you spawn a sub-agent, it runs in its own isolated session, does its work, and announces the result back to the chat when finished.

**Use cases:**

- Research a topic while the main agent continues answering questions
- Run multiple long tasks in parallel (web scraping, code analysis, file processing)
- Delegate tasks to specialized agents in a multi-agent setup

## त्वरित प्रारंभ

The simplest way to use sub-agents is to ask your agent naturally:

> "Spawn a sub-agent to research the latest Node.js release notes"

The agent will call the `sessions_spawn` tool behind the scenes. When the sub-agent finishes, it announces its findings back into your chat.

You can also be explicit about options:

> "Spawn a sub-agent to analyze the server logs from today. Use gpt-5.2 and set a 5-minute timeout."

## यह कैसे काम करता है

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

## विन्यास

Sub-agents work out of the box with no configuration. डिफ़ॉल्ट्स:

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

### समवर्तीता

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

### पैरामीटर

| Parameter           | Type                     | Default                               | विवरण                                                                                             |
| ------------------- | ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `task`              | string                   | _(required)_       | What the sub-agent should do                                                                      |
| `लेबल`              | string                   | —                                     | Short label for identification                                                                    |
| `agentId`           | string                   | _(caller's agent)_ | Spawn under a different agent id (must be allowed)                             |
| `मॉडल`              | string                   | _(optional)_       | Override the model for this sub-agent                                                             |
| `thinking`          | string                   | _(optional)_       | Override thinking level (`off`, `low`, `medium`, `high`, etc.) |
| `runTimeoutSeconds` | number                   | `0` (no limit)     | Abort the sub-agent after N seconds                                                               |
| `सफ़ाई`             | `"delete"` \\| `"keep"` | `"keep"`                              | `"delete"` archives immediately after announce                                                    |

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

| Command                                    | Description                                                       |
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

उपलब्ध होने पर घोषणा उत्तर थ्रेड/टॉपिक रूटिंग को संरक्षित रखते हैं (Slack थ्रेड्स, Telegram टॉपिक्स, Matrix थ्रेड्स)।

### Announce Stats

Each announce includes a stats line with:

- रनटाइम अवधि
- टोकन उपयोग (इनपुट/आउटपुट/कुल)
- अनुमानित लागत (जब मॉडल मूल्य निर्धारण `models.providers.*.models[].cost` के माध्यम से कॉन्फ़िगर किया गया हो)
- सेशन कुंजी, सेशन आईडी, और ट्रांसक्रिप्ट पथ

### घोषणा स्थिति

घोषणा संदेश में रनटाइम परिणाम से निकली स्थिति शामिल होती है (मॉडल आउटपुट से नहीं):

- **सफल पूर्णता** (`ok`) — कार्य सामान्य रूप से पूरा हुआ
- **त्रुटि** — कार्य विफल हुआ (विवरण नोट्स में)
- **टाइमआउट** — कार्य ने `runTimeoutSeconds` पार कर लिया
- **अज्ञात** — स्थिति निर्धारित नहीं की जा सकी

<Tip>
यदि उपयोगकर्ता-समक्ष किसी घोषणा की आवश्यकता नहीं है, तो मुख्य-एजेंट का summarize चरण `NO_REPLY` लौटा सकता है और कुछ भी पोस्ट नहीं किया जाता।
यह `ANNOUNCE_SKIP` से अलग है, जिसका उपयोग एजेंट-से-एजेंट घोषणा प्रवाह (`sessions_send`) में किया जाता है।
</Tip>

## टूल नीति

डिफ़ॉल्ट रूप से, सब-एजेंट्स को **सभी टूल मिलते हैं सिवाय** उन टूल्स के जो असुरक्षित या बैकग्राउंड कार्यों के लिए अनावश्यक हैं:

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

### | निषिद्ध टूल        | कारण                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `sessions_list`    | सेशन प्रबंधन — मुख्य एजेंट समन्वय करता है                                      |
| `sessions_history` | सेशन प्रबंधन — मुख्य एजेंट समन्वय करता है                                      |
| `sessions_send`    | सेशन प्रबंधन — मुख्य एजेंट समन्वय करता है                                      |
| `sessions_spawn`   | नेस्टेड फैन-आउट नहीं (सब-एजेंट सब-एजेंट स्पॉन नहीं कर सकते) |
| `gateway`          | सिस्टम एडमिन — सब-एजेंट से खतरनाक                                              |
| `agents_list`      | सिस्टम एडमिन                                                                   |
| `whatsapp_login`   | इंटरैक्टिव सेटअप — कोई कार्य नहीं                                              |
| `session_status`   | स्थिति/शेड्यूलिंग — मुख्य एजेंट समन्वय करता है                                 |
| `cron`             | स्थिति/शेड्यूलिंग — मुख्य एजेंट समन्वय करता है                                 |
| `memory_search`    | इसके बजाय प्रासंगिक जानकारी स्पॉन प्रॉम्प्ट में दें                            |
| `memory_get`       | इसके बजाय प्रासंगिक जानकारी स्पॉन प्रॉम्प्ट में दें                            |

सब-एजेंट टूल्स को अनुकूलित करना

```json5
आप सब-एजेंट टूल्स को और प्रतिबंधित कर सकते हैं:
```

{
tools: {
subagents: {
tools: {
// deny हमेशा allow पर जीतता है
deny: ["browser", "firecrawl"],
},
},
},
}

```json5
सब-एजेंट्स को **केवल** विशिष्ट टूल्स तक सीमित करने के लिए:
```

<Note>
{
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // यदि सेट हो तो deny फिर भी जीतता है
      },
    },
  },
} कस्टम deny प्रविष्टियाँ डिफ़ॉल्ट deny सूची में **जोड़ी जाती हैं**।
</Note>

## प्रमाणीकरण

उप-एजेंट प्रमाणीकरण **एजेंट आईडी** द्वारा हल किया जाता है, सत्र प्रकार द्वारा नहीं:

- यदि `allow` सेट है, तो केवल वही टूल उपलब्ध होंगे (डिफ़ॉल्ट deny सूची फिर भी लागू रहती है)।
- ऑथ स्टोर लक्ष्य एजेंट के `agentDir` से लोड किया जाता है
- मुख्य एजेंट की ऑथ प्रोफ़ाइल्स को **फ़ॉलबैक** के रूप में मर्ज किया जाता है (टकराव होने पर एजेंट प्रोफ़ाइल्स जीतती हैं)

<Note>मर्ज जोड़ात्मक है — मुख्य प्रोफ़ाइल्स हमेशा फ़ॉलबैक के रूप में उपलब्ध रहती हैं</Note>

## Context and System Prompt

प्रत्येक सब-एजेंट के लिए पूर्णतः अलग-थलग ऑथ वर्तमान में समर्थित नहीं है।

- कॉन्टेक्स्ट और सिस्टम प्रॉम्प्ट
- सब-एजेंट्स को मुख्य एजेंट की तुलना में एक कम किया हुआ सिस्टम प्रॉम्प्ट मिलता है:

**शामिल:** Tooling, Workspace, Runtime सेक्शन, साथ ही `AGENTS.md` और `TOOLS.md`

## **शामिल नहीं:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

| सब-एजेंट को एक कार्य-केंद्रित सिस्टम प्रॉम्प्ट भी मिलता है जो उसे सौंपे गए कार्य पर केंद्रित रहने, उसे पूरा करने, और मुख्य एजेंट की तरह कार्य न करने का निर्देश देता है। | सब-एजेंट्स को रोकना                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| विधि                                                                                                                                                                     | प्रभाव                                                                  |
| `/stop` चैट में                                                                                                                                                          | मुख्य सेशन **और** उससे स्पॉन हुए सभी सक्रिय सब-एजेंट रन को रद्द करता है |
| `/subagents stop <id>`                                                                                                                                                   | मुख्य सेशन को प्रभावित किए बिना किसी विशिष्ट सब-एजेंट को रोकता है       |

<Note>
`runTimeoutSeconds` निर्दिष्ट समय के बाद सब-एजेंट रन को स्वतः रद्द करता है
</Note>

## `runTimeoutSeconds` सेशन को स्वतः आर्काइव नहीं करता।

<Accordion title="Complete sub-agent configuration">सेशन तब तक रहता है जब तक सामान्य आर्काइव टाइमर ट्रिगर नहीं होता।</Accordion>

## सीमाएँ

<Warning>
पूर्ण कॉन्फ़िगरेशन उदाहरण
- **No nested spawning:** Sub-agents cannot spawn their own sub-agents.
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
          allowAgents: ["main"], // ops "main" के अंतर्गत सब-एजेंट स्पॉन कर सकता है
        },
      },
    ],
  },
  tools: {
    subagents: {
      tools: {
        deny: ["browser"], // सब-एजेंट ब्राउज़र का उपयोग नहीं कर सकते
      },
    },
  },
}
```
- **सर्वोत्तम-प्रयास घोषणा:** यदि गेटवे रीस्टार्ट होता है, तो लंबित घोषणा कार्य खो जाता है।
</Warning>

## See Also

- - **कोई नेस्टेड स्पॉनिंग नहीं:** सब-एजेंट अपने स्वयं के सब-एजेंट स्पॉन नहीं कर सकते।
- - **साझा संसाधन:** सब-एजेंट गेटवे प्रक्रिया साझा करते हैं; सुरक्षा वाल्व के रूप में `maxConcurrent` का उपयोग करें।
- - **ऑटो-आर्काइव सर्वश्रेष्ठ-प्रयास है:** गेटवे रीस्टार्ट पर लंबित आर्काइव टाइमर खो जाते हैं।
- [Queue](/concepts/queue) — how the `subagent` lane works
