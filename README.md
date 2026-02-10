# OpenCray 🦞

> **OpenClaw 的本地化增强版** —— 专注于为中国用户提供极致的 AI 消息网关体验。

OpenCray 是基于 [OpenClaw](https://github.com/openclaw/openclaw) 构建的定制版本。我们致力于解决国内开发者在使用 AI 网关时遇到的痛点，通过集成主流的国内即时通讯平台（IM）并进行网络优化，让 AI 助手更贴近您的工作与生活。

## ✨ 核心特性

### 🚀 深度集成的国内 IM 渠道
OpenCray 原生支持国内主流办公与社交平台，无需复杂的第三方中转：

- **飞书 (Feishu/Lark)**
  - 基于官方 SDK (`@larksuiteoapi/node-sdk`) 深度开发。
  - 支持群组、私聊、富文本消息、卡片交互。
  - 优化的事件订阅与自动回复机制。
  
- **QQ (via NapCat)**
  - 通过 [NapCatQQ](https://github.com/NapNeko/NapCatQQ) 实现 OneBot v11 协议对接。
  - 稳定支持 QQ 群与私聊消息收发。
  
- **钉钉 (DingTalk)**
  - 支持企业内部机器人与群机器人。
  - 适配钉钉卡片消息与互动。

### 🌏 网络与环境适配
- **国内网络优化**: 针对国内网络环境调整了连接策略，提升 API 访问稳定性。
- **本地化配置**: 预设了更符合国内用户习惯的配置模版。

## 📦 快速开始

### 前置要求
- **Node.js**: v18+ (推荐 v20 或 v22)
- **包管理器**: [pnpm](https://pnpm.io/) (必需)

### 1. 获取代码
```bash
git clone https://github.com/CrayBotAGI/OpenCray.git
cd OpenCray
```

### 2. 安装依赖
OpenCray 使用 pnpm workspace 管理依赖，请确保在根目录运行：
```bash
pnpm install
```

### 3. 配置环境
复制示例配置文件并根据您的需求修改：
```bash
cp .env.example .env
# 或者使用 CLI 进行交互式配置
pnpm openclaw config setup
```

### 4. 启动服务
开发模式（支持热重载）：
```bash
pnpm dev
```

构建并运行生产版本：
```bash
pnpm build
pnpm start
```

## 🛠️ 渠道配置指南

### 飞书 (Feishu)
在 `config.yaml` 或环境变量中配置：
```yaml
channels:
  feishu:
    appId: "cli_..."
    appSecret: "..."
    encryptKey: "..." # 可选
    verificationToken: "..."
```

### QQ (NapCat)
需配合 NapCatQQ 运行，配置 WebSocket 连接：
```yaml
channels:
  qq:
    wsUrl: "ws://127.0.0.1:3001"
    accessToken: "..." # NapCat 配置的 token
```

## 🤝 参与贡献

OpenCray 是一个开源社区项目，我们非常欢迎您的参与！

- **提交 Issue**: 反馈 Bug 或建议新功能。
- **提交 PR**: 修复问题或贡献新渠道代码。
- **加入讨论**: 关注我们的 GitHub Discussions。

## 📄 开源协议

本项目遵循 [MIT 协议](LICENSE)。

---
*OpenCray 与 OpenClaw 保持上游同步，定期合并核心功能更新。*
