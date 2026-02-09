---
summary: "서브 에이전트: 요청자 채널로 결과를 알리는 격리된 에이전트 실행을 스폰합니다"
read_when:
  - 에이전트를 통한 백그라운드/병렬 작업이 필요할 때
  - sessions_spawn 또는 서브 에이전트 도구 정책을 변경할 때
title: "서브 에이전트"
---

# 서브 에이전트

서브 에이전트를 사용하면 메인 대화를 차단하지 않고 백그라운드 작업을 실행할 수 있습니다. 서브 에이전트를 생성하면 자체적으로 격리된 세션에서 실행되어 작업을 수행한 후, 완료되면 결과를 채팅에 알립니다.

**사용 사례:**

- 메인 에이전트가 질문에 답하는 동안 주제를 조사
- 여러 개의 장기 작업을 병렬로 실행 (웹 스크래핑, 코드 분석, 파일 처리)
- 다중 에이전트 구성에서 전문화된 에이전트에게 작업 위임

## 빠른 시작

서브 에이전트를 사용하는 가장 간단한 방법은 에이전트에게 자연스럽게 요청하는 것입니다:

> "최신 Node.js 릴리스 노트를 조사할 서브 에이전트를 생성해 줘"

에이전트는 내부적으로 `sessions_spawn` 도구를 호출합니다. 서브 에이전트가 작업을 완료하면, 그 결과를 다시 이 채팅에 알려줍니다.

옵션을 명시적으로 지정할 수도 있습니다:

> "오늘의 서버 로그를 분석할 서브 에이전트를 생성해 줘. gpt-5.2를 사용하고 타임아웃을 5분으로 설정해."

## 작동 방식

<Steps>
  <Step title="Main agent spawns">
    메인 에이전트는 작업 설명과 함께 `sessions_spawn`를 호출합니다. 이 호출은 **비차단(non-blocking)** 방식입니다 — 메인 에이전트는 즉시 `{ status: "accepted", runId, childSessionKey }`를 반환받습니다.
  </Step>
  <Step title="Sub-agent runs in the background">
    새로운 격리된 세션이 생성됩니다 (`agent:<agentId>    :subagent:<uuid>    `) 전용 `subagent` 큐 레인에서.</Step>
  <Step title="Result is announced">
    서브 에이전트가 작업을 완료하면, 요청자 채팅으로 결과를 알립니다. 메인 에이전트는 자연어 요약을 게시합니다.
  </Step>
  <Step title="Session is archived">
    서브 에이전트 세션은 60분 후 자동으로 아카이브됩니다(설정 가능). 대화 기록은 보존됩니다.
  </Step>
</Steps>

<Tip>
각 서브 에이전트는 **자신만의** 컨텍스트와 토큰 사용량을 가집니다. 비용을 절감하려면 서브 에이전트에 더 저렴한 모델을 설정하세요 — 아래의 [Setting a Default Model](#setting-a-default-model)을 참고하세요.
</Tip>

## 설정

서브 에이전트는 별도의 설정 없이 바로 사용할 수 있습니다. 기본값:

- 모델: 대상 에이전트의 기본 모델 선택 (`subagents.model`이 설정되지 않은 경우)
- 사고(thinking): 서브 에이전트에 대한 오버라이드 없음 (`subagents.thinking`이 설정되지 않은 경우)
- 최대 동시 실행: 8
- 자동 아카이브: 60분 후

### 기본 모델 설정

토큰 비용을 절약하기 위해 서브 에이전트에 더 저렴한 모델을 사용하세요:

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

### 기본 사고 수준 설정

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

### 에이전트별 오버라이드

멀티 에이전트 설정에서는 에이전트별로 서브 에이전트 기본값을 설정할 수 있습니다:

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

### 동시성

동시에 실행될 수 있는 서브 에이전트 수를 제어합니다:

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

서브 에이전트는 메인 에이전트 큐와 분리된 전용 큐 레인(`subagent`)을 사용하므로, 서브 에이전트 실행이 인바운드 응답을 차단하지 않습니다.

### 자동 아카이브

서브 에이전트 세션은 설정 가능한 기간 이후 자동으로 아카이브됩니다:

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
아카이브 시 대화 기록의 이름이 `*.deleted.
<timestamp>` (같은 폴더)로 변경됩니다 — 대화 기록은 삭제되지 않고 보존됩니다. 자동 아카이브 타이머는 최선의 노력(best-effort) 방식이며, 게이트웨이가 재시작되면 대기 중인 타이머는 유실됩니다.
</Note>

## `sessions_spawn` 도구

에이전트가 서브 에이전트를 생성하기 위해 호출하는 도구입니다.

### 매개변수

| 매개변수                                           | 유형                                                  | 기본값                                                         | 설명                                                                                          |
| ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. `task`               | 2. 문자열                       | 3. _(필수)_         | 4. 하위 에이전트가 수행해야 할 작업                                                |
| 5. `label`              | 6. 문자열                       | 7. —                                 | 8. 식별을 위한 짧은 레이블                                                     |
| 9. `agentId`            | 10. 문자열                      | 11. _(호출자의 에이전트)_ | 12. 다른 에이전트 ID 하위에서 생성 (허용되어야 함)                  |
| 13. `model`             | 14. 문자열                      | 15. _(선택 사항)_     | 16. 이 하위 에이전트에 사용할 모델을 재정의                                           |
| 17. `thinking`          | 18. 문자열                      | 19. _(선택 사항)_     | 20. 사고 수준을 재정의 (`off`, `low`, `medium`, `high` 등) |
| 21. `runTimeoutSeconds` | 22. 숫자                       | 23. `0` (제한 없음)   | 24. N초 후 하위 에이전트를 중단                                                 |
| 25. `cleanup`           | 26. `"delete"` \\| `"keep"` | 27. `"keep"`                         | 28. `"delete"`는 알림 후 즉시 보관 처리                                        |

### 29. 모델 결정 순서

30. 하위 에이전트의 모델은 다음 순서로 결정됩니다 (먼저 일치하는 항목이 적용됨):

1. 31. `sessions_spawn` 호출의 명시적 `model` 파라미터
2. 32. 에이전트별 설정: `agents.list[].subagents.model`
3. 33. 전역 기본값: `agents.defaults.subagents.model`
4. 34. 새 세션에 대한 대상 에이전트의 일반 모델 결정 규칙

35) 사고 수준은 다음 순서로 결정됩니다:

1. 36. `sessions_spawn` 호출의 명시적 `thinking` 파라미터
2. 37. 에이전트별 설정: `agents.list[].subagents.thinking`
3. 38. 전역 기본값: `agents.defaults.subagents.thinking`
4. 39. 그렇지 않으면 하위 에이전트 전용 사고 수준 재정의는 적용되지 않습니다

<Note>40.
유효하지 않은 모델 값은 조용히 건너뛰어지며 — 하위 에이전트는 다음으로 유효한 기본값으로 실행되고 도구 결과에 경고가 표시됩니다.</Note>

### 41. 교차 에이전트 생성

42. 기본적으로 하위 에이전트는 자신의 에이전트 ID 하위에서만 생성할 수 있습니다. 43. 에이전트가 다른 에이전트 ID 하위에서 하위 에이전트를 생성하도록 허용하려면:

```json5
44. {
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

<Tip>45. `sessions_spawn`에 대해 현재 허용된 에이전트 ID를 확인하려면 `agents_list` 도구를 사용하세요.</Tip>

## 46. 하위 에이전트 관리 (`/subagents`)

47. 현재 세션의 하위 에이전트 실행을 검사하고 제어하려면 `/subagents` 슬래시 명령을 사용하세요:

| 48. 명령              | 49. 설명                                            |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `/subagents list`                          | 50. 모든 하위 에이전트 실행 목록 (활성 및 완료) |
| `/subagents stop <id\\|#\\|all>`         | 실행 중인 서브 에이전트를 중지합니다                                                     |
| `/subagents log <id\\|#> [limit] [tools]` | 서브 에이전트의 트랜스크립트를 확인합니다                                                   |
| `/subagents info <id\\|#>`                | 상세 실행 메타데이터를 표시합니다                                                       |
| `/subagents send <id\\|#> <message>`      | 실행 중인 서브 에이전트에 메시지를 전송합니다                                                |

서브 에이전트는 목록 인덱스(`1`, `2`), 실행 ID 접두사, 전체 세션 키 또는 `last`로 참조할 수 있습니다.

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
    서브 에이전트 트랜스크립트의 마지막 10개 메시지를 표시합니다. 도구 호출 메시지를 포함하려면 `tools`를 추가하세요:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">```
/subagents send 3 "Also check the staging environment"
```

    ```
    실행 중인 서브 에이전트의 세션으로 메시지를 전송하고 최대 30초 동안 응답을 기다립니다.
    ```

  </Accordion>
</AccordionGroup>

## Announce (결과가 돌아오는 방식)

서브 에이전트가 완료되면 **announce** 단계를 거칩니다:

1. 서브 에이전트의 최종 응답이 캡처됩니다
2. 결과, 상태, 통계를 포함한 요약 메시지가 메인 에이전트의 세션으로 전송됩니다
3. 메인 에이전트가 자연어 요약을 채팅에 게시합니다

알림 응답은 가능한 경우 스레드/토픽 라우팅을 유지합니다(Slack 스레드, Telegram 토픽, Matrix 스레드).

### Announce 통계

각 announce에는 다음이 포함된 통계 라인이 있습니다:

- 실행 시간
- 토큰 사용량(입력/출력/총합)
- 예상 비용 (`models.providers.*.models[].cost`를 통해 모델 가격이 구성된 경우)
- 세션 키, 세션 ID, 트랜스크립트 경로

### Announce 상태

announce 메시지에는 모델 출력이 아닌 실행 결과에서 파생된 상태가 포함됩니다:

- **성공적 완료** (`ok`) — 작업이 정상적으로 완료됨
- **오류** — 작업 실패 (세부 오류는 notes에 포함)
- **타임아웃** — 작업이 `runTimeoutSeconds`를 초과함
- **알 수 없음** — 상태를 결정할 수 없음

<Tip>
사용자에게 알릴 announce가 필요 없는 경우, 메인 에이전트의 요약 단계에서 `NO_REPLY`를 반환하면 아무것도 게시되지 않습니다.
이는 에이전트 간 announce 흐름(`sessions_send`)에서 사용되는 `ANNOUNCE_SKIP`과는 다릅니다.
</Tip>

## 도구 정책

기본적으로 서브 에이전트는 **안전하지 않거나 백그라운드 작업에 불필요한** 일부 도구를 제외한 **모든 도구**를 사용할 수 있습니다:

<AccordionGroup>
  <Accordion title="Default denied tools">| Denied tool | Reason |
|-------------|--------|
| `sessions_list` | 세션 관리 — 메인 에이전트가 오케스트레이션 |
| `sessions_history` | 세션 관리 — 메인 에이전트가 오케스트레이션 |
| `sessions_send` | 세션 관리 — 메인 에이전트가 오케스트레이션 |
| `sessions_spawn` | 중첩 팬아웃 금지 (서브 에이전트는 서브 에이전트를 생성할 수 없음) |
| `gateway` | 시스템 관리 — 서브 에이전트에서 위험함 |
| `agents_list` | 시스템 관리 |
| `whatsapp_login` | 대화형 설정 — 작업이 아님 |
| `session_status` | 상태/스케줄링 — 메인 에이전트가 조정 |
| `cron` | 상태/스케줄링 — 메인 에이전트가 조정 |
| `memory_search` | 대신 스폰 프롬프트에 관련 정보를 전달 |
| `memory_get` | 대신 스폰 프롬프트에 관련 정보를 전달 |</Accordion>
</AccordionGroup>

### 서브 에이전트 도구 커스터마이징

서브 에이전트 도구를 추가로 제한할 수 있습니다:

```json5
{
  tools: {
    subagents: {
      tools: {
        // deny는 항상 allow보다 우선
        deny: ["browser", "firecrawl"],
      },
    },
  },
}
```

서브 에이전트를 **특정 도구만** 사용하도록 제한하려면:

```json5
{
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // 설정된 경우 deny가 여전히 우선
      },
    },
  },
}
```

<Note>
사용자 정의 deny 항목은 기본 deny 목록에 **추가**됩니다. `allow`가 설정되면 해당 도구만 사용 가능하며 (기본 deny 목록은 그 위에 계속 적용됩니다).
</Note>

## 인증

서브 에이전트 인증은 세션 유형이 아니라 **에이전트 id** 로 해결됩니다:

- 인증 스토어는 대상 에이전트의 `agentDir`에서 로드됩니다
- 메인 에이전트의 인증 프로필은 **폴백**으로 병합됩니다(충돌 시 에이전트 프로필이 우선합니다).
- 병합은 가산적입니다 — 메인 프로필은 항상 폴백으로 사용 가능합니다.

<Note>현재 서브 에이전트별로 완전히 격리된 인증은 지원되지 않습니다.</Note>

## Context and System Prompt

서브 에이전트는 메인 에이전트에 비해 축소된 시스템 프롬프트를 받습니다:

- **포함:** Tooling, Workspace, Runtime 섹션, 그리고 `AGENTS.md` 및 `TOOLS.md`
- **미포함:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

서브 에이전트는 또한 할당된 작업에 집중하고 이를 완료하며, 메인 에이전트처럼 행동하지 않도록 지시하는 작업 중심의 시스템 프롬프트를 받습니다.

## 서브 에이전트 중지

| 방법                     | 효과                                                            |
| ---------------------- | ------------------------------------------------------------- |
| 채팅에서 `/stop`           | 메인 세션 **및** 그로부터 생성된 모든 활성 서브 에이전트 실행을 중단합니다. |
| `/subagents stop <id>` | 메인 세션에는 영향을 주지 않고 특정 서브 에이전트만 중지합니다.          |
| `runTimeoutSeconds`    | 지정된 시간이 지나면 서브 에이전트 실행을 자동으로 중단합니다.           |

<Note>
`runTimeoutSeconds`는 세션을 자동으로 아카이브하지 **않습니다**. 세션은 일반적인 아카이브 타이머가 실행될 때까지 유지됩니다.
</Note>

## 전체 구성 예시

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

## 제한 사항

<Warning>
- **최선 노력 공지:** 게이트웨이가 재시작되면 대기 중인 공지 작업은 손실됩니다.
- **중첩 생성 불가:** 서브 에이전트는 자신의 서브 에이전트를 생성할 수 없습니다.
- **공유 리소스:** 서브 에이전트는 게이트웨이 프로세스를 공유합니다; 안전장치로 `maxConcurrent`를 사용하세요.
- **자동 아카이브는 최선 노력 방식:** 게이트웨이 재시작 시 대기 중인 아카이브 타이머는 손실됩니다.
</Warning>

## 참고 자료

- [Session Tools](/concepts/session-tool) — `sessions_spawn` 및 기타 세션 도구에 대한 상세
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) — 에이전트별 도구 제한 및 샌드박싱
- [Configuration](/gateway/configuration) — `agents.defaults.subagents` 참조
- [Queue](/concepts/queue) — `subagent` 레인이 동작하는 방식
