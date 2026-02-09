---
summary: "OpenClaw 가 환경 변수를 로드하는 위치와 우선순위 순서"
read_when:
  - You need to know which env vars are loaded, and in what order
  - Gateway(게이트웨이) 에서 API 키 누락을 디버깅할 때
  - 프로바이더 인증 또는 배포 환경을 문서화할 때
title: "환경 변수"
---

# 환경 변수

OpenClaw 는 여러 소스에서 환경 변수를 가져옵니다. 규칙은 **기존 값을 절대 덮어쓰지 않는 것**입니다.

## 우선순위 (높음 → 낮음)

1. **프로세스 환경** (Gateway(게이트웨이) 프로세스가 상위 셸 또는 데몬에서 이미 가지고 있는 값).
2. **현재 작업 디렉토리의 `.env`** (dotenv 기본값; 덮어쓰지 않음).
3. **`~/.openclaw/.env` 에 있는 전역 `.env`** (일명 `$OPENCLAW_STATE_DIR/.env`; 덮어쓰지 않음).
4. **`~/.openclaw/openclaw.json` 의 Config `env` 블록** (누락된 경우에만 적용).
5. **선택적 로그인 셸 가져오기** (`env.shellEnv.enabled` 또는 `OPENCLAW_LOAD_SHELL_ENV=1`), 예상되는 키 중 누락된 항목에만 적용.

구성 파일이 완전히 없는 경우 4단계는 건너뜁니다. 셸 가져오기는 활성화되어 있으면 여전히 실행됩니다.

## Config `env` 블록

인라인 환경 변수를 설정하는 두 가지 동등한 방법이 있습니다 (둘 다 덮어쓰지 않음):

```json5
{
  env: {
    OPENROUTER_API_KEY: "sk-or-...",
    vars: {
      GROQ_API_KEY: "gsk-...",
    },
  },
}
```

## Shell env import

`env.shellEnv` 는 로그인 셸을 실행하고 **누락된** 예상 키만 가져옵니다:

```json5
{
  env: {
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

Env var equivalents:

- `OPENCLAW_LOAD_SHELL_ENV=1`
- `OPENCLAW_SHELL_ENV_TIMEOUT_MS=15000`

## Env var substitution in config

구성 문자열 값에서 `${VAR_NAME}` 구문을 사용하여 환경 변수를 직접 참조할 수 있습니다:

```json5
{
  models: {
    providers: {
      "vercel-gateway": {
        apiKey: "${VERCEL_GATEWAY_API_KEY}",
      },
    },
  },
}
```

자세한 내용은 [Configuration: Env var substitution](/gateway/configuration#env-var-substitution-in-config) 을 참고하십시오.

## Path-related env vars

| 변수                     | 목적                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_HOME`        | Override the home directory used for all internal path resolution (`~/.openclaw/`, agent dirs, sessions, credentials). Useful when running OpenClaw as a dedicated service user. |
| `OPENCLAW_STATE_DIR`   | Override the state directory (default `~/.openclaw`).                                                                                                                                            |
| `OPENCLAW_CONFIG_PATH` | 1. 설정 파일 경로를 재정의합니다(기본값 `~/.openclaw/openclaw.json`).                                                                                                                     |

### 2. `OPENCLAW_HOME`

3. 설정되면 `OPENCLAW_HOME`은 모든 내부 경로 해석에서 시스템 홈 디렉터리(`$HOME` / `os.homedir()`)를 대체합니다. 4. 이를 통해 헤드리스 서비스 계정에 대해 완전한 파일시스템 격리를 활성화할 수 있습니다.

5. **우선순위:** `OPENCLAW_HOME` > `$HOME` > `USERPROFILE` > `os.homedir()`

6. **예시** (macOS LaunchDaemon):

```xml
7. <key>EnvironmentVariables</key>
<dict>
  <key>OPENCLAW_HOME</key>
  <string>/Users/kira</string>
</dict>
```

8. `OPENCLAW_HOME`은 틸드 경로(예: `~/svc`)로도 설정할 수 있으며, 사용 전에 `$HOME`을 기준으로 확장됩니다.

## 관련 항목

- [Gateway 구성](/gateway/configuration)
- [FAQ: 환경 변수와 .env 로딩](/help/faq#env-vars-and-env-loading)
- [모델 개요](/concepts/models)
