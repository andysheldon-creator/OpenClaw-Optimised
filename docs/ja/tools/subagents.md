---
summary: "サブエージェント: 要求元のチャットに結果を通知する、分離されたエージェント実行の生成"
read_when:
  - エージェントによるバックグラウンド／並列作業が必要な場合
  - sessions_spawn または sub-agent のツールポリシーを変更する場合
title: "サブエージェント"
---

# Sub-Agents

Sub-agents let you run background tasks without blocking the main conversation. When you spawn a sub-agent, it runs in its own isolated session, does its work, and announces the result back to the chat when finished.

**Use cases:**

- メインエージェントが質問に答え続けている間にトピックを調査する
- 複数の長時間タスクを並列で実行する（Webスクレイピング、コード解析、ファイル処理）
- マルチエージェント構成で専門エージェントにタスクを委任する

## クイックスタート

サブエージェントを使う最も簡単な方法は、エージェントに自然な形で依頼することです：

> "最新の Node.js リリースノートを調査するサブエージェントを起動して"

エージェントは内部で `sessions_spawn` ツールを呼び出します。 サブエージェントが完了すると、その調査結果をこのチャットに報告します。

オプションを明示的に指定することもできます：

> "今日のサーバーログを分析するサブエージェントを起動して。 gpt-5.2 を使用し、5分のタイムアウトを設定して。"

## 仕組み

<Steps>
  <Step title="Main agent spawns">
    メインエージェントは、タスク内容とともに `sessions_spawn` を呼び出します。 この呼び出しは **ノンブロッキング** です — メインエージェントは即座に `{ status: "accepted", runId, childSessionKey }` を受け取ります。
  </Step>
  <Step title="Sub-agent runs in the background">
    新しい分離されたセッションが作成されます（`agent:
    :subagent:
    `）。専用の `subagent` キューレーン上で実行されます。
  <agentId>サブエージェントが完了すると、依頼元のチャットに調査結果を報告します。<uuid>メインエージェントは自然言語の要約を投稿します。</Step>
  <Step title="Result is announced">
    サブエージェントのセッションは 60 分後に自動アーカイブされます（設定可能）。 トランスクリプトは保持されます。
  </Step>
  <Step title="Session is archived">
    各サブエージェントは **独自の** コンテキストとトークン使用量を持ちます。 コスト削減のため、サブエージェントにはより安価なモデルを設定できます — 下記の「[Setting a Default Model](#setting-a-default-model)」を参照してください。
  </Step>
</Steps>

<Tip>
設定 サブエージェントは設定なしですぐに利用できます。
</Tip>

## デフォルト：

モデル：対象エージェントの通常のモデル選択（`subagents.model` が設定されていない場合） 思考：サブエージェント用の上書きなし（`subagents.thinking` が設定されていない場合）

- 最大同時実行数：8
- 自動アーカイブ：60 分後
- デフォルトモデルの設定
- トークンコストを抑えるため、サブエージェントにより安価なモデルを使用します：

### {&#xA;agents: {&#xA;defaults: {&#xA;subagents: {&#xA;model: "minimax/MiniMax-M2.1",&#xA;},&#xA;},&#xA;},&#xA;}

デフォルト思考レベルの設定

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

### エージェントごとの上書き設定

```json5
マルチエージェント構成では、エージェントごとにサブエージェントのデフォルトを設定できます：
```

### {&#xA;agents: {&#xA;list: [&#xA;{&#xA;id: "researcher",&#xA;subagents: {&#xA;model: "anthropic/claude-sonnet-4",&#xA;},&#xA;},&#xA;{&#xA;id: "assistant",&#xA;subagents: {&#xA;model: "minimax/MiniMax-M2.1",&#xA;},&#xA;},&#xA;],&#xA;},&#xA;}

同時に実行できるサブエージェントの数を制御します：

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

### 同時実行

サブエージェントは、メインエージェントのキューとは別の専用キューレーン（`subagent`）を使用するため、サブエージェントの実行が受信返信をブロックしません。

```json5
自動アーカイブ
```

サブエージェントのセッションは、設定可能な期間後に自動的にアーカイブされます：

### {&#xA;agents: {&#xA;defaults: {&#xA;subagents: {&#xA;archiveAfterMinutes: 120, // default: 60&#xA;},&#xA;},&#xA;},&#xA;}

アーカイブでは、トランスクリプトの名前が `*.deleted. 46. `（同じフォルダ）に変更されます — トランスクリプトは削除されず、保持されます。

```json5
自動アーカイブのタイマーはベストエフォートです。ゲートウェイが再起動すると、保留中のタイマーは失われます。
```

<Note>`sessions_spawn` ツール<timestamp>これは、サブエージェントを作成するためにエージェントが呼び出すツールです。 パラメータ
</Note>

## The `sessions_spawn` Tool

This is the tool the agent calls to create sub-agents.

### Parameters

| Parameter           | Type                     | Default                               | Description                                                                                       |
| ------------------- | ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `task`              | string                   | _(required)_       | What the sub-agent should do                                                                      |
| `label`             | string                   | —                                     | Short label for identification                                                                    |
| `agentId`           | string                   | _(caller's agent)_ | Spawn under a different agent id (must be allowed)                             |
| `model`             | string                   | _(optional)_       | Override the model for this sub-agent                                                             |
| `thinking`          | string                   | _(optional)_       | Override thinking level (`off`, `low`, `medium`, `high`, etc.) |
| `runTimeoutSeconds` | number                   | `0` (no limit)     | Abort the sub-agent after N seconds                                                               |
| `cleanup`           | `"delete"` \\| `"keep"` | `"keep"`                              | `"delete"` archives immediately after announce                                                    |

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

利用可能な場合、アナウンス返信はスレッド／トピックのルーティングを保持します（Slack スレッド、Telegram トピック、Matrix スレッド）。

### Announce Stats

Each announce includes a stats line with:

- Runtime duration
- トークン使用量（入力／出力／合計）
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
1. カスタムの deny エントリは、デフォルトの deny リストに**追加**されます。 2. `allow` が設定されている場合、そのツールのみが利用可能になります（デフォルトの deny リストはその上に引き続き適用されます）。
</Note>

## 認証

サブエージェントの認証は、セッション種別ではなく**エージェント ID** により解決されます。

- 3. auth ストアは、対象エージェントの `agentDir` から読み込まれます。
- 4. メインエージェントの auth プロファイルは **フォールバック** としてマージされます（競合時はエージェント側のプロファイルが優先されます）。
- 5. マージは加算的です — メインのプロファイルは常にフォールバックとして利用可能です。

<Note>6. 
現在、サブエージェントごとに完全に分離された auth はサポートされていません。</Note>

## 7. コンテキストとシステムプロンプト

8. サブエージェントは、メインエージェントと比べて縮小されたシステムプロンプトを受け取ります。

- 9. **含まれるもの:** Tooling、Workspace、Runtime セクションに加え、`AGENTS.md` と `TOOLS.md`
- 10. **含まれないもの:** `SOUL.md`、`IDENTITY.md`、`USER.md`、`HEARTBEAT.md`、`BOOTSTRAP.md`

11. サブエージェントは、割り当てられたタスクに集中し、それを完了し、メインエージェントとして振る舞わないよう指示する、タスク重視のシステムプロンプトも受け取ります。

## 12. サブエージェントの停止

| 13. 方法                     | 14. 効果                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 15. チャット内の `/stop`         | 16. メインセッション **および** そこから生成されたすべてのアクティブなサブエージェント実行を中止します。 |
| 17. `/subagents stop <id>` | 18. メインセッションに影響を与えず、特定のサブエージェントのみを停止します。                  |
| 19. `runTimeoutSeconds`    | 20. 指定した時間後にサブエージェントの実行を自動的に中止します。                        |

<Note>
21. `runTimeoutSeconds` はセッションを自動アーカイブ **しません**。 22. セッションは、通常のアーカイブタイマーが発火するまで残ります。
</Note>

## 23. 完全な設定例

<Accordion title="Complete sub-agent configuration">24. 
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
```</Accordion>

## 制限事項

<Warning>
25. - **ベストエフォートでの announce:** ゲートウェイが再起動すると、保留中の announce 作業は失われます。
26. - **ネストされた生成は不可:** サブエージェントは自身のサブエージェントを生成できません。
27. - **共有リソース:** サブエージェントはゲートウェイプロセスを共有します。安全弁として `maxConcurrent` を使用してください。
28. - **自動アーカイブはベストエフォート:** ゲートウェイ再起動時に、保留中のアーカイブタイマーは失われます。
</Warning>

## 29. 関連項目

- 30. [Session Tools](/concepts/session-tool) — `sessions_spawn` やその他のセッションツールの詳細
- 31. [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — エージェントごとのツール制限とサンドボックス化
- 32. [Configuration](/gateway/configuration) — `agents.defaults.subagents` のリファレンス
- 33. [Queue](/concepts/queue) — `subagent` レーンの仕組み
