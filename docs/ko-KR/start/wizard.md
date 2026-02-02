---
read_when:
  - 온보딩 마법사 실행 또는 구성
  - 새 머신 설정
summary: CLI 온보딩 마법사：Gateway, 워크스페이스, 채널 및 스킬의 안내식 설정
title: 온보딩 마법사
x-i18n:
  generated_at: "2026-02-02T09:26:00Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 571302dcf63a0c700cab6b54964e524d75d98315d3b35fafe7232d2ce8199e83
  source_path: start/wizard.md
  workflow: 9
---

# 온보딩 마법사 (CLI)

온보딩 마법사는 macOS, Linux 또는 Windows(WSL2를 통해; 강력히 추천)에서 OpenClaw를 설정하는 **추천** 방법입니다. 로컬 Gateway 또는 원격 Gateway 연결, 채널, 스킬 및 워크스페이스 기본 설정을 안내식 프로세스를 통해 구성합니다.

주요 진입점:

```bash
openclaw onboard
```

가장 빠른 첫 대화 방법: Control UI를 여세요(채널 설정 필요 없음). `openclaw dashboard`를 실행한 다음 브라우저에서 대화하세요. 문서: [대시보드](/web/dashboard).

후속 재구성:

```bash
openclaw configure
```

추천: Brave Search API 키를 설정하여 에이전트가 `web_search`를 사용할 수 있도록 하세요(`web_fetch`는 키 없이도 사용 가능). 가장 간단한 방법: `openclaw configure --section web`로 `tools.web.search.apiKey`를 저장합니다. 문서: [웹 도구](/tools/web).

## 퀵 스타트와 고급 모드

마법사는 **퀵 스타트**(기본 설정)와 **고급**(완전 제어) 모드로 시작됩니다.

**퀵 스타트**는 기본 설정을 유지합니다:

- 로컬 Gateway(루프백 주소)
- 기본 워크스페이스(또는 기존 워크스페이스)
- Gateway 포트 **18789**
- Gateway 인증 **토큰**(자동 생성, 루프백 주소에서도)
- Tailscale 노출 **비활성화**
- Telegram + WhatsApp 개인 메시지 기본값 **허용 목록**(시스템에서 전화번호 입력 안내)

**고급**은 모든 단계를 보여줍니다(모드, 워크스페이스, Gateway, 채널, 데몬, 스킬).

## 마법사가 하는 일

**로컬 모드(기본값)**는 다음을 안내합니다:

- 모델/인증(OpenAI Code (Codex) 구독 OAuth, Anthropic API 키(추천) 또는 setup-token(붙여넣기), MiniMax/GLM/Moonshot/AI Gateway 옵션 포함)
- 워크스페이스 위치 + 부트스트랩 파일
- Gateway 설정(포트/바인딩/인증/Tailscale)
- 제공자(Telegram, WhatsApp, Discord, Google Chat, Mattermost(플러그인), Signal)
- 데몬 설치(LaunchAgent / systemd 사용자 단위)
- 건강 검사
- 스킬(추천)

**원격 모드**는 다른 위치의 Gateway에 연결하도록 로컬 클라이언트만 구성합니다. 원격 호스트에서는 아무것도 설치하거나 변경하지 **않습니다**.

더 많은 격리된 에이전트(독립적인 워크스페이스 + 세션 + 인증)를 추가하려면:

```bash
openclaw agents add <name>
```

힌트: `--json`은 비대화형 모드를 의미하지 **않습니다**. 스크립트용으로는 `--non-interactive`(그리고 `--workspace`)를 사용하세요.

## 프로세스 세부사항(로컬)

1. **기존 구성 감지**
   - `~/.openclaw/openclaw.json`이 존재하면 **유지 / 수정 / 재설정** 중 선택.
   - 마법사 재실행은 명시적으로 **재설정**을 선택하지 않는 한(또는 `--reset`을 전달하지 않는 한) 아무것도 삭제하지 **않습니다**.
   - 구성이 유효하지 않거나 레거시 키를 포함하면 마법사가 중지되고 계속하기 전에 `openclaw doctor`를 실행하라고 요구합니다.
   - 재설정은 `trash`를 사용하고(`rm`은 절대 사용하지 않음) 범위를 제공합니다:
     - 구성만
     - 구성 + 자격 증명 + 세션
     - 완전 재설정(워크스페이스도 함께 제거)

2. **모델/인증**
   - **Anthropic API 키(추천)**: `ANTHROPIC_API_KEY`를 사용하거나(있는 경우) 키 입력을 안내한 다음 데몬용으로 저장.
   - **Anthropic OAuth (Claude Code CLI)**: macOS에서는 마법사가 키체인 항목 "Claude Code-credentials"를 확인합니다(launchd 시작 시 차단되지 않도록 "항상 허용" 선택); Linux/Windows에서는 `~/.claude/.credentials.json`을 재사용합니다(있는 경우).
   - **Anthropic 토큰(setup-token 붙여넣기)**: 임의의 머신에서 `claude setup-token`을 실행한 다음 토큰을 붙여넣습니다(이름을 지정할 수 있음; 비워두면 = 기본값).
   - **OpenAI Code (Codex) 구독 (Codex CLI)**: `~/.codex/auth.json`이 존재하면 마법사가 재사용할 수 있습니다.
   - **OpenAI Code (Codex) 구독 (OAuth)**: 브라우저 플로우; `code#state`를 붙여넣습니다.
     - 모델이 설정되지 않았거나 `openai/*`인 경우 `agents.defaults.model`을 `openai-codex/gpt-5.2`로 설정.
   - **OpenAI API 키**: `OPENAI_API_KEY`를 사용하거나(있는 경우) 키 입력을 안내한 다음 launchd가 읽을 수 있도록 `~/.openclaw/.env`에 저장.
   - **OpenCode Zen(다중 모델 에이전트)**: `OPENCODE_API_KEY`를 입력하라고 안내합니다(또는 `OPENCODE_ZEN_API_KEY`, https://opencode.ai/auth에서 확인).
   - **API 키**: 키를 저장해 드립니다.
   - **Vercel AI Gateway(다중 모델 에이전트)**: `AI_GATEWAY_API_KEY`를 입력하라고 안내합니다.
   - 자세한 내용: [Vercel AI Gateway](/providers/vercel-ai-gateway)
   - **MiniMax M2.1**: 구성이 자동으로 작성됩니다.
   - 자세한 내용: [MiniMax](/providers/minimax)
   - **Synthetic(Anthropic 호환)**: `SYNTHETIC_API_KEY`를 입력하라고 안내합니다.
   - 자세한 내용: [Synthetic](/providers/synthetic)
   - **Moonshot (Kimi K2)**: 구성이 자동으로 작성됩니다.
   - **Kimi Coding**: 구성이 자동으로 작성됩니다.
   - 자세한 내용: [Moonshot AI (Kimi + Kimi Coding)](/providers/moonshot)
   - **건너뛰기**: 지금은 인증을 구성하지 않습니다.
   - 감지된 옵션에서 기본 모델을 선택하거나(수동으로 제공자/모델 입력).
   - 마법사가 모델 검사를 실행하고 구성된 모델이 알 수 없거나 인증이 누락된 경우 경고를 표시합니다.

- OAuth 자격 증명은 `~/.openclaw/credentials/oauth.json`에 저장됩니다; 인증 구성은 `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`(API 키 + OAuth)에 저장됩니다.
- 자세한 내용: [/concepts/oauth](/concepts/oauth)

3. **워크스페이스**
   - 기본값 `~/.openclaw/workspace`(구성 가능).
   - 에이전트 부트스트랩 시작 의식에 필요한 워크스페이스 파일을 생성합니다.
   - 전체 워크스페이스 레이아웃 + 백업 가이드: [에이전트 워크스페이스](/concepts/agent-workspace)

4. **Gateway**
   - 포트, 바인딩, 인증 모드, Tailscale 노출.
   - 인증 권장사항: 루프백 주소에서도 **토큰**을 유지하여 로컬 WS 클라이언트가 인증해야 하도록 합니다.
   - 모든 로컬 프로세스를 완전히 신뢰할 때만 인증을 비활성화하세요.
   - 비루프백 바인딩은 여전히 인증이 필요합니다.

5. **채널**
   - [WhatsApp](/channels/whatsapp): 선택적 QR 코드 로그인.
   - [Telegram](/channels/telegram): 봇 토큰.
   - [Discord](/channels/discord): 봇 토큰.
   - [Google Chat](/channels/googlechat): 서비스 계정 JSON + 웹훅 대상.
   - [Mattermost](/channels/mattermost)(플러그인): 봇 토큰 + 기본 URL.
   - [Signal](/channels/signal): 선택적 `signal-cli` 설치 + 계정 구성.
   - [iMessage](/channels/imessage): 로컬 `imsg` CLI 경로 + 데이터베이스 접근.
   - 개인 메시지 보안: 기본적으로 페어링 모드. 첫 개인 메시지는 확인 코드를 보내고; `openclaw pairing approve <channel> <code>`로 승인하거나 허용 목록을 사용합니다.

6. **데몬 설치**
   - macOS: LaunchAgent
     - 로그인된 사용자 세션이 필요합니다; 헤드리스 모드의 경우 커스텀 LaunchDaemon을 사용하세요(포함되지 않음).
   - Linux(및 WSL2를 통한 Windows): systemd 사용자 단위
     - 마법사가 `loginctl enable-linger <user>`를 통해 lingering을 활성화하려고 시도하여 로그아웃 후에도 Gateway가 계속 실행되도록 합니다.
     - sudo를 요구할 수 있습니다(`/var/lib/systemd/linger`에 쓰기); sudo 없이 먼저 시도합니다.
   - **런타임 선택:** Node(추천; WhatsApp/Telegram에 필요). Bun은 **추천하지 않습니다**.

7. **건강 검사**
   - Gateway를 시작하고(필요한 경우) `openclaw health`를 실행합니다.
   - 힌트: `openclaw status --deep`는 상태 출력에 Gateway 건강 프로브를 추가합니다(연결 가능한 Gateway 필요).

8. **스킬(추천)**
   - 사용 가능한 스킬을 읽고 종속성 조건을 확인합니다.
   - Node 관리자 선택: **npm / pnpm**(bun 추천하지 않음).
   - 선택적 종속성 설치(일부는 macOS에서 Homebrew 사용).

9. **완료**
   - 요약 + 다음 단계, 추가 기능을 위한 iOS/Android/macOS 앱 포함.

- GUI가 감지되지 않으면 마법사가 브라우저를 여는 대신 Control UI용 SSH 포트 포워딩 지침을 출력합니다.
- Control UI 리소스 파일이 누락된 경우 마법사가 빌드를 시도합니다; 대안은 `pnpm ui:build`(UI 종속성 자동 설치)입니다.

## 원격 모드

원격 모드는 다른 위치의 Gateway에 연결하도록 로컬 클라이언트를 구성합니다.

설정해야 할 것:

- 원격 Gateway URL(`ws://...`)
- 원격 Gateway가 인증을 요구하는 경우 토큰(추천)

참고사항:

- 원격 설치나 데몬 변경을 실행하지 않습니다.
- Gateway가 루프백 주소에만 바인딩된 경우 SSH 터널이나 tailnet을 사용하세요.
- 검색 힌트:
  - macOS: Bonjour(`dns-sd`)
  - Linux: Avahi(`avahi-browse`)

## 다른 에이전트 추가

`openclaw agents add <name>`을 사용하여 독립적인 워크스페이스, 세션 및 인증 구성을 가진 별도의 에이전트를 생성합니다. `--workspace` 없이 실행하면 마법사를 시작합니다.

설정하는 것:

- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`

참고사항:

- 기본 워크스페이스는 `~/.openclaw/workspace-<agentId>`를 따릅니다.
- 인바운드 메시지 라우팅을 위해 `bindings`를 추가합니다(마법사가 실행 가능).
- 비대화형 플래그: `--model`, `--agent-dir`, `--bind`, `--non-interactive`.

## 비대화형 모드

자동화된 또는 스크립트화된 온보딩을 위해 `--non-interactive`를 사용합니다:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

머신 읽기 가능한 요약을 위해 `--json`을 추가합니다.

Gemini 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice gemini-api-key \
  --gemini-api-key "$GEMINI_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Z.AI 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice zai-api-key \
  --zai-api-key "$ZAI_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Vercel AI Gateway 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice ai-gateway-api-key \
  --ai-gateway-api-key "$AI_GATEWAY_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Moonshot 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice moonshot-api-key \
  --moonshot-api-key "$MOONSHOT_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Synthetic 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice synthetic-api-key \
  --synthetic-api-key "$SYNTHETIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

OpenCode Zen 예제:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice opencode-zen \
  --opencode-zen-api-key "$OPENCODE_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

에이전트 추가(비대화형) 예제:

```bash
openclaw agents add work \
  --workspace ~/.openclaw/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive \
  --json
```

## Gateway 마법사 RPC

Gateway는 RPC를 통해 마법사 프로세스를 노출합니다(`wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status`). 클라이언트(macOS 앱, Control UI)가 온보딩 로직을 재구현하지 않고도 단계를 렌더링할 수 있습니다.

## Signal 설정 (signal-cli)

마법사는 `signal-cli`를 설치할 수 있습니다(GitHub 릴리스에서):

- 적절한 릴리스 자산을 다운로드합니다.
- `~/.openclaw/tools/signal-cli/<version>/`에 저장합니다.
- 구성에 `channels.signal.cliPath`를 씁니다.

참고사항:

- JVM 빌드는 **Java 21**이 필요합니다.
- 네이티브 빌드가 있으면 우선적으로 사용합니다.
- Windows는 WSL2를 사용합니다; signal-cli 설치는 WSL 내의 Linux 프로세스를 따릅니다.

## 마법사가 작성하는 것

`~/.openclaw/openclaw.json`의 일반적인 필드:

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers`(Minimax를 선택한 경우)
- `gateway.*`(모드, 바인딩, 인증, Tailscale)
- `channels.telegram.botToken`, `channels.discord.token`, `channels.signal.*`, `channels.imessage.*`
- 채널 허용 목록(Slack/Discord/Matrix/Microsoft Teams), 프롬프트 중 활성화 선택 시 적용됩니다(이름은 가능한 한 ID로 해석됩니다).
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`openclaw agents add`는 `agents.list[]`와 선택적으로 `bindings`를 씁니다.

WhatsApp 자격 증명은 `~/.openclaw/credentials/whatsapp/<accountId>/` 아래에 저장됩니다. 세션은 `~/.openclaw/agents/<agentId>/sessions/`에 저장됩니다.

일부 채널은 플러그인으로 제공됩니다. 온보딩 중 채널을 선택하면 마법사가 구성하기 전에 먼저 설치하라고 안내합니다(npm 또는 로컬 경로를 통해).

## 관련 문서

- macOS 앱 온보딩: [온보딩](/start/onboarding)
- 구성 참조: [Gateway 구성](/gateway/configuration)
- 제공자: [WhatsApp](/channels/whatsapp), [Telegram](/channels/telegram), [Discord](/channels/discord), [Google Chat](/channels/googlechat), [Signal](/channels/signal), [iMessage](/channels/imessage)
- 스킬: [스킬](/tools/skills), [스킬 구성](/tools/skills-config)
