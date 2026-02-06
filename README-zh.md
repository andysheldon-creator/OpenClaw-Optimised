# 🦞 OpenClaw — 个人AI助手

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="500">
    </picture>
</p>

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**OpenClaw** 是一款在你自己的设备上运行的*个人AI助手*。
它可以在你已经使用的频道上回复你（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat），还包括BlueBubbles、Matrix、Zalo和Zalo Personal等扩展频道。它可以在macOS/iOS/Android上说话和倾听，并可以渲染你控制的实时Canvas。网关只是控制平面——产品是助手。

如果你想要一个感觉本地化、快速且始终在线的个人单用户助手，这就是它。

[网站](https://openclaw.ai) · [文档](https://docs.openclaw.ai) · [DeepWiki](https://deepwiki.com/openclaw/openclaw) · [入门指南](https://docs.openclaw.ai/start/getting-started) · [更新](https://docs.openclaw.ai/install/updating) · [展示](https://docs.openclaw.ai/start/showcase) · [常见问题](https://docs.openclaw.ai/start/faq) · [向导](https://docs.openclaw.ai/start/wizard) · [Nix](https://github.com/openclaw/nix-clawdbot) · [Docker](https://docs.openclaw.ai/install/docker) · [Discord](https://discord.gg/clawd)

推荐设置：运行入职向导（`openclaw onboard`）。它会引导你完成网关、工作区、频道和技能的设置。CLI向导是推荐路径，在**macOS、Linux和Windows（通过WSL2；强烈推荐）**上都可用。
支持npm、pnpm或bun。
新安装？从这里开始：[入门指南](https://docs.openclaw.ai/start/getting-started)

**订阅（OAuth）：**

- **[Anthropic](https://www.anthropic.com/)** (Claude Pro/Max)
- **[OpenAI](https://openai.com/)** (ChatGPT/Codex)

模型说明：虽然支持任何模型，但我强烈推荐**Anthropic Pro/Max (100/200) + Opus 4.6**以获得更好的长上下文能力和更强的提示注入抵抗能力。参见[入职指南](https://docs.openclaw.ai/start/onboarding)。

## 模型（选择 + 认证）

- 模型配置 + CLI: [模型](https://docs.openclaw.ai/concepts/models)
- 认证配置文件轮换（OAuth vs API密钥）+ 故障转移: [模型故障转移](https://docs.openclaw.ai/concepts/model-failover)

## 安装（推荐）

运行时：**Node ≥22**。

```bash
npm install -g openclaw@latest
# 或: pnpm add -g openclaw@latest

openclaw onboard --install-daemon
```

向导安装网关守护进程（launchd/systemd用户服务）使其持续运行。

## 快速开始（TL;DR）

运行时：**Node ≥22**。

完整初学者指南（认证、配对、频道）：[入门指南](https://docs.openclaw.ai/start/getting-started)

```bash
openclaw onboard --install-daemon

openclaw gateway --port 18789 --verbose

# 发送消息
openclaw message send --to +1234567890 --message "Hello from OpenClaw"

# 与助手对话（可选地将回复发送到任何连接的频道：WhatsApp/Telegram/Slack/Discord/Google Chat/Signal/iMessage/BlueBubbles/Microsoft Teams/Matrix/Zalo/Zalo Personal/WebChat）
openclaw agent --message "Ship checklist" --thinking high
```

升级？[更新指南](https://docs.openclaw.ai/install/updating)（并运行`openclaw doctor`）。

## 开发渠道

- **stable**: 标记发布的版本（`vYYYY.M.D` 或 `vYYYY.M.D-<patch>`），npm标签`latest`。
- **beta**: 预发布标签（`vYYYY.M.D-beta.N`），npm标签`beta`（macOS应用可能缺失）。
- **dev**: `main`分支的最新版本，npm标签`dev`（发布时）。

切换渠道（git + npm）：`openclaw update --channel stable|beta|dev`。
详情：[开发渠道](https://docs.openclaw.ai/install/development-channels)。

## 从源码（开发）

推荐使用`pnpm`进行源码构建。Bun可用于直接运行TypeScript。

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

pnpm install
pnpm ui:build # 首次运行时自动安装UI依赖
pnpm build

pnpm openclaw onboard --install-daemon

# 开发循环（TS更改时自动重载）
pnpm gateway:watch
```

注意：`pnpm openclaw ...`直接运行TypeScript（通过`tsx`）。`pnpm build`生成`dist/`用于通过Node/打包的`openclaw`二进制文件运行。

## 安全默认设置（DM访问）

OpenClaw连接到真实的通讯界面。将入站私信视为**不受信任的输入**。

完整安全指南：[安全](https://docs.openclaw.ai/gateway/security)

在Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack上的默认行为：

- **私信配对**（`dmPolicy="pairing"` / `channels.discord.dm.policy="pairing"` / `channels.slack.dm.policy="pairing"`）：未知发送者会收到一个短配对码，机器人不会处理他们的消息。
- 批准使用：`openclaw pairing approve <channel> <code>`（然后发送者会被添加到本地允许列表存储中）。
- 公开入站私信需要明确选择：设置`dmPolicy="open"`并在频道允许列表中包含`"*"`（`allowFrom` / `channels.discord.dm.allowFrom` / `channels.slack.dm.allowFrom`）。

运行`openclaw doctor`以显示风险/错误配置的DM策略。

## 亮点

- **[本地优先网关](https://docs.openclaw.ai/gateway)** — 会话、频道、工具和事件的单一控制平面。
- **[多频道收件箱](https://docs.openclaw.ai/channels)** — WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、BlueBubbles（iMessage）、iMessage（旧版）、Microsoft Teams、Matrix、Zalo、Zalo Personal、WebChat、macOS、iOS/Android。
- **[多代理路由](https://docs.openclaw.ai/gateway/configuration)** — 将入站频道/账户/对等方路由到隔离的代理（工作区 + 每个代理的会话）。
- **[语音唤醒](https://docs.openclaw.ai/nodes/voicewake) + [语音模式](https://docs.openclaw.ai/nodes/talk)** — 使用ElevenLabs为macOS/iOS/Android提供常开语音功能。
- **[实时画布](https://docs.openclaw.ai/platforms/mac/canvas)** — 由代理驱动的可视化工作空间，带有[A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)。
- **[一流工具](https://docs.openclaw.ai/tools)** — 浏览器、画布、节点、定时任务、会话和Discord/Slack操作。
- **[配套应用](https://docs.openclaw.ai/platforms/macos)** — macOS菜单栏应用 + iOS/Android [节点](https://docs.openclaw.ai/nodes)。
- **[入职](https://docs.openclaw.ai/start/wizard) + [技能](https://docs.openclaw.ai/tools/skills)** — 向导驱动的设置，包含捆绑/管理/工作区技能。

## Star历史

[![Star历史图表](https://api.star-history.com/svg?repos=openclaw/openclaw&type=date&legend=top-left)](https://www.star-history.com/#openclaw/openclaw&type=date&legend=top-left)

## 我们迄今构建的一切

### 核心平台

- [网关WS控制平面](https://docs.openclaw.ai/gateway) 包含会话、状态、配置、定时任务、webhooks、[控制UI](https://docs.openclaw.ai/web)和[画布主机](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)。
- [CLI界面](https://docs.openclaw.ai/tools/agent-send)：网关、代理、发送、[向导](https://docs.openclaw.ai/start/wizard)和[医生](https://docs.openclaw.ai/gateway/doctor)。
- [Pi代理运行时](https://docs.openclaw.ai/concepts/agent) 在RPC模式下运行，具有工具流和块流功能。
- [会话模型](https://docs.openclaw.ai/concepts/session)：`main`用于直接聊天，组隔离，激活模式，队列模式，回复回传。组规则：[组](https://docs.openclaw.ai/concepts/groups)。
- [媒体流水线](https://docs.openclaw.ai/nodes/images)：图像/音频/视频，转录钩子，大小限制，临时文件生命周期。音频详情：[音频](https://docs.openclaw.ai/nodes/audio)。

### 频道

- [频道](https://docs.openclaw.ai/channels)：[WhatsApp](https://docs.openclaw.ai/channels/whatsapp) (Baileys)、[Telegram](https://docs.openclaw.ai/channels/telegram) (grammY)、[Slack](https://docs.openclaw.ai/channels/slack) (Bolt)、[Discord](https://docs.openclaw.ai/channels/discord) (discord.js)、[Google Chat](https://docs.openclaw.ai/channels/googlechat) (Chat API)、[Signal](https://docs.openclaw.ai/channels/signal) (signal-cli)、[BlueBubbles](https://docs.openclaw.ai/channels/bluebubbles) (iMessage, 推荐)、[iMessage](https://docs.openclaw.ai/channels/imessage) (旧版)、[Microsoft Teams](https://docs.openclaw.ai/channels/msteams) (扩展)、[Matrix](https://docs.openclaw.ai/channels/matrix) (扩展)、[Zalo](https://docs.openclaw.ai/channels/zalo) (扩展)、[Zalo Personal](https://docs.openclaw.ai/channels/zalouser) (扩展)、[WebChat](https://docs.openclaw.ai/web/webchat)。
- [组路由](https://docs.openclaw.ai/concepts/group-messages)：提及守门、回复标签、每个频道的分块和路由。频道规则：[频道](https://docs.openclaw.ai/channels)。

### 应用 + 节点

- [macOS应用](https://docs.openclaw.ai/platforms/macos)：菜单栏控制平面、[语音唤醒](https://docs.openclaw.ai/nodes/voicewake)/PTT、[语音模式](https://docs.openclaw.ai/nodes/talk)覆盖、[WebChat](https://docs.openclaw.ai/web/webchat)、调试工具、[远程网关](https://docs.openclaw.ai/gateway/remote)控制。
- [iOS节点](https://docs.openclaw.ai/platforms/ios)：[画布](https://docs.openclaw.ai/platforms/mac/canvas)、[语音唤醒](https://docs.openclaw.ai/nodes/voicewake)、[语音模式](https://docs.openclaw.ai/nodes/talk)、相机、屏幕录制、Bonjour配对。
- [Android节点](https://docs.openclaw.ai/platforms/android)：[画布](https://docs.openclaw.ai/platforms/mac/canvas)、[语音模式](https://docs.openclaw.ai/nodes/talk)、相机、屏幕录制、可选SMS。
- [macOS节点模式](https://docs.openclaw.ai/nodes)：system.run/notify + 画布/相机暴露。

### 工具 + 自动化

- [浏览器控制](https://docs.openclaw.ai/tools/browser)：专用的openclaw Chrome/Chromium、快照、操作、上传、配置文件。
- [画布](https://docs.openclaw.ai/platforms/mac/canvas)：[A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)推送/重置、评估、快照。
- [节点](https://docs.openclaw.ai/nodes)：相机快照/剪辑、屏幕录制、[location.get](https://docs.openclaw.ai/nodes/location-command)、通知。
- [定时任务 + 唤醒](https://docs.openclaw.ai/automation/cron-jobs)；[webhooks](https://docs.openclaw.ai/automation/webhook)；[Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub)。
- [技能平台](https://docs.openclaw.ai/tools/skills)：捆绑、管理和工作区技能，带安装守门 + UI。

### 运行时 + 安全

- [频道路由](https://docs.openclaw.ai/concepts/channel-routing)、[重试策略](https://docs.openclaw.ai/concepts/retry)和[流/分块](https://docs.openclaw.ai/concepts/streaming)。
- [状态](https://docs.openclaw.ai/concepts/presence)、[打字指示器](https://docs.openclaw.ai/concepts/typing-indicators)和[使用跟踪](https://docs.openclaw.ai/concepts/usage-tracking)。
- [模型](https://docs.openclaw.ai/concepts/models)、[模型故障转移](https://docs.openclaw.ai/concepts/model-failover)和[会话修剪](https://docs.openclaw.ai/concepts/session-pruning)。
- [安全](https://docs.openclaw.ai/gateway/security)和[故障排除](https://docs.openclaw.ai/channels/troubleshooting)。

### 运维 + 打包

- [控制UI](https://docs.openclaw.ai/web) + [WebChat](https://docs.openclaw.ai/web/webchat)直接从网关提供服务。
- [Tailscale Serve/Funnel](https://docs.openclaw.ai/gateway/tailscale)或[SSH隧道](https://docs.openclaw.ai/gateway/remote)带令牌/密码认证。
- [Nix模式](https://docs.openclaw.ai/install/nix)用于声明式配置；[Docker](https://docs.openclaw.ai/install/docker)-基础安装。
- [医生](https://docs.openclaw.ai/gateway/doctor)迁移，[日志](https://docs.openclaw.ai/logging)。

## 工作原理（简短）

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│            网关               │
│        （控制平面）           │
│     ws://127.0.0.1:18789    │
└──────────────┬────────────────┘
               │
               ├─ Pi代理（RPC）
               ├─ CLI（openclaw …）
               ├─ WebChat UI
               ├─ macOS应用
               └─ iOS / Android节点
```
