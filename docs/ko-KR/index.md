---
read_when:
  - OpenClaw를 새로운 사용자에게 소개할 때
summary: OpenClaw의 최상위 개요, 기능 및 목적
title: OpenClaw
x-i18n:
  generated_at: "2026-02-02T09:26:00Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 92462177964ac72c344d3e8613a3756bc8e06eb7844cda20a38cd43e7cadd3b2
  source_path: index.md
  workflow: 9
---

# OpenClaw 🦞

> _"EXFOLIATE! EXFOLIATE!"_ — 아마도 우주 랍스터가 한 말

<p align="center">
    <img
        src="/assets/openclaw-logo-text-dark.png"
        alt="OpenClaw"
        width="500"
        class="dark:hidden"
    />
    <img
        src="/assets/openclaw-logo-text.png"
        alt="OpenClaw"
        width="500"
        class="hidden dark:block"
    />
</p>

<p align="center">
  <strong>모든 운영체제에서 WhatsApp/Telegram/Discord/iMessage 게이트웨이를 통해 AI 에이전트(Pi)에 연결하세요.</strong><br />
  플러그인으로 Mattermost 등 더 많은 채널을 추가할 수 있습니다.
  메시지를 보내면 에이전트가 응답합니다—언제 어디서나, 손끝에서.
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw">GitHub</a> ·
  <a href="https://github.com/openclaw/openclaw/releases">릴리스</a> ·
  <a href="/">문서</a> ·
  <a href="/start/openclaw">OpenClaw 어시스턴트 설정</a>
</p>

OpenClaw는 WhatsApp(WhatsApp Web / Baileys를 통해), Telegram(Bot API / grammY를 통해), Discord(Bot API / channels.discord.js를 통해), iMessage(imsg CLI를 통해)를 [Pi](https://github.com/badlogic/pi-mono)와 같은 프로그래밍 에이전트에 연결합니다. 플러그인으로 Mattermost(Bot API + WebSocket) 등 더 많은 채널을 추가할 수 있습니다.
OpenClaw는 또한 OpenClaw 어시스턴트를 구동합니다.

## 시작하기

**새로 설치하시나요?** [시작 가이드](/start/getting-started)를 확인하세요.

**업데이트하시나요?** [업데이트 가이드](/install/updating)를 확인하세요.

**문제가 있으신가요?** [문제 해결](/channels/troubleshooting)을 확인하세요.

### 빠른 시작

```bash
npm install -g openclaw@latest

# 설정 마법사 실행
openclaw onboard --install-daemon

# 게이트웨이 시작
openclaw gateway run

# 메시지 보내기
openclaw message send --to +1234567890 --message "안녕, OpenClaw!"
```

### 지원되는 플랫폼

- **macOS** — 메뉴바 앱 포함 (권장)
- **Linux** — systemd 사용자 서비스
- **Windows** — WSL2 권장
- **iOS/Android** — 노드로서 (카메라, 캔버스, 알림)

### 지원되는 채널

- **WhatsApp** — Baileys를 통한 WhatsApp Web 프로토콜 사용
- **Telegram** — Bot API / grammY 사용
- **Discord** — Bot API / discord.js 사용
- **Slack** — Bolt 프레임워크 사용
- **Signal** — signal-cli 사용
- **iMessage** — imsg CLI 사용 (macOS 전용)
- **Google Chat** — Chat API 사용
- **BlueBubbles** — 확장 프로그램으로
- **Microsoft Teams** — 확장 프로그램으로
- **Matrix** — 확장 프로그램으로
- **Zalo** — 확장 프로그램으로
- **Mattermost** — 플러그인으로

## 주요 특징

### 🌍 **멀티 채널**
WhatsApp, Telegram, Discord, Slack, Signal, iMessage 등에서 하나의 AI 에이전트와 대화하세요.

### 🤖 **강력한 AI**
Claude, GPT, Gemini 등 최고의 AI 모델과 연결하세요.

### 🛠️ **도구와 스킬**
브라우저 제어, 코드 실행, 파일 관리, API 호출 등 다양한 도구를 사용하세요.

### 🔒 **프라이버시 우선**
데이터는 귀하의 기기에서 처리됩니다. 제3자 서비스 없음.

### 🎨 **캔버스**
시각적 작업과 인터랙티브 콘텐츠를 위한 실시간 캔버스.

### 🎙️ **음성 지원**
음성 인식과 텍스트 음성 변환으로 핸즈프리 사용.

## 아키텍처

```
WhatsApp / Telegram / Discord / Slack / Signal / iMessage
               │
               ▼
┌───────────────────────────────┐
│           게이트웨이            │
│        (제어 평면)            │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Pi 에이전트 (RPC)
               ├─ CLI (openclaw …)
               ├─ 웹챗 UI
               ├─ macOS 앱
               └─ iOS / Android 노드
```

## 라이선스

MIT —— 바다의 랍스터처럼 자유롭게 🦞

---

**Peter Steinberger** ([@steipete](https://x.com/steipete)) — 창조자, 랍스터 속삭이는 자

- [openclaw.ai](https://openclaw.ai)
- [GitHub](https://github.com/openclaw/openclaw)
- [Discord](https://discord.gg/clawd)
