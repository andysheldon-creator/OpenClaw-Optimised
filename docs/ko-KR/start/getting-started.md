---
read_when:
  - 처음부터 시작하는 초기 설정
  - 설치 → 온보딩 → 첫 메시지 전송의 가장 빠른 경로를 찾고 계신 경우
summary: 초보자 가이드: 처음부터 첫 메시지 전송까지 (마법사, 인증, 채널, 페어링)
title: 시작하기
x-i18n:
  generated_at: "2026-02-02T09:26:00Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: d0ebc83c10efc569eaf6fb32368a29ef75a373f15da61f3499621462f08aff63
  source_path: start/getting-started.md
  workflow: 9
---

# 시작하기

목표: **처음부터** → **첫 번째 성공적인 채팅** (합리적인 기본값 사용)까지 가능한 한 빠르게 완료하기.

가장 빠른 채팅 방법: 컨트롤 UI 열기 (채널 설정 불필요). `openclaw dashboard` 실행
후 브라우저에서 채팅하거나 `http://127.0.0.1:18789/` 열기 (게이트웨이 호스트에서).
문서: [대시보드](/web/dashboard) 및 [컨트롤 UI](/web/control-ui).

권장 경로: **CLI 온보딩 마법사** (`openclaw onboard`) 사용. 다음을 설정합니다:

- 모델/인증 (OAuth 권장)
- 게이트웨이 설정
- 채널 (WhatsApp/Telegram/Discord/Mattermost(플러그인)/...)
- 페어링 기본값 (안전한 DM)
- 워크스페이스 부트스트랩 + 스킬
- 선택적 백그라운드 서비스

더 자세한 참조 페이지가 필요하시면: [마법사](/start/wizard), [설정](/start/setup), [페어링](/start/pairing), [보안](/gateway/security).

샌드박스 참고사항: `agents.defaults.sandbox.mode: "non-main"`은 `session.mainKey` (기본값 `"main"`)를 사용하므로 그룹/채널 세션은 샌드박스됩니다. 메인 에이전트가 항상 호스트에서 실행되기를 원한다면, 명시적인 에이전트별 오버라이드를 설정하세요:

```json
{
  "routing": {
    "agents": {
      "main": {
        "workspace": "~/.openclaw/workspace",
        "sandbox": { "mode": "off" }
      }
    }
  }
}
```

## 0) 전제 조건

- Node `>=22`
- `pnpm` (선택사항; 소스에서 빌드하는 경우 권장)
- **권장:** 웹 검색을 위한 Brave Search API 키. 가장 쉬운 방법:
  `openclaw configure --section web` (`tools.web.search.apiKey` 저장).
  참조: [웹 도구](/tools/web).

macOS: 앱 빌드 계획이 있다면 Xcode / CLT 설치. CLI + 게이트웨이만 사용한다면 Node만으로 충분.
Windows: **WSL2** 사용 (Ubuntu 권장). WSL2를 강력히 권장; 네이티브 Windows는 테스트되지 않았고 문제가 많으며 도구 호환성이 떨어집니다. 먼저 WSL2를 설치한 다음 WSL 내에서 Linux 단계를 수행하세요. 참조: [Windows (WSL2)](/platforms/windows).

## 1) CLI 설치 (권장)

```bash
curl -fsSL https://openclaw.bot/install.sh | bash
```

설치 옵션 (설치 방법, 비대화형, GitHub에서 설치): [설치](/install).

Windows (PowerShell):

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

대안 (글로벌 설치):

```bash
npm install -g openclaw@latest
```

```bash
pnpm add -g openclaw@latest
```

## 2) 온보딩 마법사 실행 (+ 서비스 설치)

```bash
openclaw onboard --install-daemon
```

선택해야 할 사항:

- **로컬 vs 원격** 게이트웨이
- **인증**: OpenAI Code (Codex) 구독 (OAuth) 또는 API 키. Anthropic의 경우 API 키 권장; `claude setup-token`도 지원됨.
- **제공자**: WhatsApp QR 로그인, Telegram/Discord 봇 토큰, Mattermost 플러그인 토큰 등.
- **데몬**: 백그라운드 설치 (launchd/systemd; WSL2는 systemd 사용)
  - **런타임**: Node (권장; WhatsApp/Telegram 필수). Bun은 **권장하지 않음**.
- **게이트웨이 토큰**: 마법사는 기본적으로 하나를 생성하고 (루프백에서도) `gateway.auth.token`에 저장합니다.

마법사 문서: [마법사](/start/wizard)

### 인증: 저장 위치 (중요)

- **권장 Anthropic 경로:** API 키 설정 (마법사가 서비스용으로 저장 가능). Claude Code 자격 증명을 재사용하려면 `claude setup-token`도 지원됨.

- OAuth 자격 증명 (레거시 가져오기): `~/.openclaw/credentials/oauth.json`
- 인증 프로필 (OAuth + API 키): `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

헤드리스/서버 팁: 먼저 일반 머신에서 OAuth 완료 후 `oauth.json`을 게이트웨이 호스트로 복사.

## 3) 게이트웨이 시작

온보딩 중 서비스를 설치했다면 게이트웨이가 이미 실행 중이어야 합니다:

```bash
openclaw gateway status
```

수동 실행 (포어그라운드):

```bash
openclaw gateway --port 18789 --verbose
```

대시보드 (로컬 루프백): `http://127.0.0.1:18789/`
토큰이 구성되어 있다면 컨트롤 UI 설정에 붙여넣기 (`connect.params.auth.token`으로 저장됨).

⚠️ **Bun 경고 (WhatsApp + Telegram):** 이러한 채널에서 Bun에 알려진 문제 있음. WhatsApp 또는 Telegram 사용 시 **Node** 사용.

## 3.5) 빠른 검증 (2분)

```bash
openclaw status
openclaw health
openclaw security audit --deep
```

## 4) 페어링 + 첫 번째 채팅 인터페이스 연결

### WhatsApp (QR 로그인)

```bash
openclaw channels login
```

WhatsApp → 설정 → 연결된 기기에서 스캔.

WhatsApp 문서: [WhatsApp](/channels/whatsapp)

### Telegram / Discord / 기타

마법사가 토큰/구성을 작성해줄 수 있습니다. 수동 구성을 선호한다면:

- Telegram: [Telegram](/channels/telegram)
- Discord: [Discord](/channels/discord)
- Mattermost (플러그인): [Mattermost](/channels/mattermost)

**Telegram DM 팁:** 첫 번째 DM은 페어링 코드를 반환합니다. 승인하세요 (다음 단계 참조), 그렇지 않으면 봇이 응답하지 않습니다.

## 5) DM 보안 (페어링 승인)

기본 정책: 알 수 없는 DM은 짧은 코드를 받고, 승인될 때까지 메시지가 처리되지 않습니다.
첫 번째 DM에 응답이 없다면 페어링을 승인하세요:

```bash
openclaw pairing list whatsapp
openclaw pairing approve whatsapp <code>
```

페어링 문서: [페어링](/start/pairing)

## 소스에서 설치 (개발)

OpenClaw 자체를 개발하고 있다면 소스에서 실행:

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build # 첫 실행 시 UI 종속성 자동 설치
pnpm build
openclaw onboard --install-daemon
```

글로벌 설치를 하지 않았다면 `pnpm openclaw ...` (저장소에서)로 온보딩 단계 실행.
`pnpm build`는 A2UI 자산도 번들링; 해당 단계만 필요하다면 `pnpm canvas:a2ui:bundle` 사용.

게이트웨이 (이 저장소에서):

```bash
node openclaw.mjs gateway --port 18789 --verbose
```

## 7) 종단 간 검증

새 터미널에서 테스트 메시지 전송:

```bash
openclaw message send --target +15555550123 --message "Hello from OpenClaw"
```

`openclaw health`가 "인증이 구성되지 않음"을 표시한다면, 마법사로 돌아가서 OAuth/키 인증 설정—인증 없이는 에이전트가 응답할 수 없습니다.

팁: `openclaw status --all`은 최고의 붙여넣기 가능한 읽기 전용 디버그 보고서입니다.
헬스 프로브: `openclaw health` (또는 `openclaw status --deep`)는 실행 중인 게이트웨이에 헬스 스냅샷을 요청합니다.

## 다음 단계 (선택사항이지만 강력히 권장)

- macOS 메뉴 바 앱 + 음성 웨이크: [macOS 앱](/platforms/macos)
- iOS/Android 노드 (캔버스/카메라/음성): [노드](/nodes)
- 원격 액세스 (SSH 터널 / Tailscale Serve): [원격 액세스](/gateway/remote) 및 [Tailscale](/gateway/tailscale)
- 항상 켜진 상태 / VPN 설정: [원격 액세스](/gateway/remote), [exe.dev](/platforms/exe-dev), [Hetzner](/platforms/hetzner), [macOS 원격](/platforms/mac/remote)
