# Moltbot 本地部署指南（中文）

## 📋 项目概述

**Moltbot** 是一个个人 AI 助手，运行在您自己的设备上。它可以通过您已经使用的通讯渠道（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat 等）与您交互，支持语音输入/输出（macOS/iOS/Android），并能渲染实时 Canvas 画布。

### 核心特性

- 🤖 **多模型支持**：Anthropic Claude、OpenAI、AWS Bedrock 等
- 💬 **多平台集成**：支持 10+ 种通讯平台
- 🔒 **隐私优先**：本地运行，数据自控
- 🎨 **Canvas 画布**：实时渲染和交互
- 🔌 **插件系统**：丰富的技能扩展
- 📱 **跨平台**：macOS、Linux、Windows（WSL2）

### 项目架构

```
moltbot/
├── src/                    # 核心源代码
│   ├── gateway/           # Gateway 网关服务（控制平面）
│   ├── agents/            # AI Agent 代理逻辑
│   ├── channels/          # 通讯渠道适配器
│   ├── cli/               # 命令行接口
│   ├── commands/          # CLI 命令实现
│   ├── providers/         # 第三方服务提供商
│   └── ...
├── skills/                # 技能插件目录（50+ 技能）
├── ui/                    # Web UI 界面
├── apps/                  # 移动端应用（iOS/Android）
├── extensions/            # 扩展程序
├── Dockerfile             # Docker 构建文件
├── docker-compose.yml     # Docker Compose 配置
└── docker-setup.sh        # Docker 自动化部署脚本
```

## 🛠️ 技术栈

### 核心技术

- **运行时环境**：Node.js ≥22.12.0
- **包管理器**：pnpm 10.23.0（推荐）/ npm / bun
- **编程语言**：TypeScript 5.9.3
- **构建工具**：TypeScript 编译器 + 自定义构建脚本

### 主要依赖

**AI/LLM 集成**：
- `@mariozechner/pi-agent-core` (0.49.3) - PI Agent 核心
- `@mariozechner/pi-ai` (0.49.3) - AI 能力
- `@mariozechner/pi-coding-agent` (0.49.3) - 编程助手
- `@agentclientprotocol/sdk` (0.13.1) - ACP 协议

**通讯平台**：
- `@whiskeysockets/baileys` (7.0.0-rc.9) - WhatsApp
- `grammy` (1.39.3) - Telegram
- `@slack/bolt` (4.6.0) - Slack
- `@line/bot-sdk` (10.6.0) - LINE
- Discord.js（通过 Discord API types）

**Web 服务**：
- `express` (5.2.1) - HTTP 服务器
- `hono` (4.11.4) - 轻量级 Web 框架
- `ws` (8.19.0) - WebSocket

**数据处理**：
- `sqlite-vec` (0.1.7-alpha.2) - 向量数据库
- `@mozilla/readability` (0.6.0) - 网页内容提取
- `pdfjs-dist` (5.4.530) - PDF 处理
- `sharp` (0.34.5) - 图像处理

**浏览器自动化**：
- `playwright-core` (1.58.0) - 浏览器控制
- `chromium-bidi` (13.0.1) - Chrome DevTools Protocol

### 可选依赖

- `@napi-rs/canvas` (0.1.88) - Canvas 图形渲染
- `node-llama-cpp` (3.15.0) - 本地 LLM 支持

## 📦 部署方式

### 方式一：Docker 部署（推荐）

#### 优势
- 环境隔离，依赖管理简单
- 跨平台一致性
- 易于升级和维护

#### 前置要求

1. **Docker 安装**
   ```bash
   # Ubuntu/Debian
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh

   # 启动 Docker 服务
   sudo systemctl start docker
   sudo systemctl enable docker

   # 添加当前用户到 docker 组（避免 sudo）
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. **Docker Compose**
   ```bash
   # Docker Desktop 自带 Compose
   # 或安装独立版本
   sudo apt install docker-compose
   ```

#### 部署步骤

**1. 克隆项目**
```bash
git clone https://github.com/moltbot/moltbot.git
cd moltbot
```

**2. 使用自动化脚本部署（最简单）**
```bash
bash docker-setup.sh
```

脚本会自动完成以下操作：
- 构建 Docker 镜像
- 创建配置目录（`~/.clawdbot` 和 `~/clawd`）
- 生成 Gateway Token
- 运行交互式配置向导
- 启动 Gateway 服务

**3. 手动部署（自定义配置）**

```bash
# 1. 配置环境变量（可选）
export CLAWDBOT_CONFIG_DIR="$HOME/.clawdbot"      # 配置目录
export CLAWDBOT_WORKSPACE_DIR="$HOME/clawd"       # 工作空间目录
export CLAWDBOT_GATEWAY_PORT="18789"              # Gateway 端口
export CLAWDBOT_BRIDGE_PORT="18790"               # Bridge 端口
export CLAWDBOT_GATEWAY_BIND="lan"                # 绑定地址（lan/local）
export CLAWDBOT_IMAGE="moltbot:local"             # Docker 镜像名称

# 2. 创建必要的目录
mkdir -p "$CLAWDBOT_CONFIG_DIR"
mkdir -p "$CLAWDBOT_WORKSPACE_DIR"

# 3. 生成 Gateway Token
export CLAWDBOT_GATEWAY_TOKEN=$(openssl rand -hex 32)

# 4. 构建 Docker 镜像
docker build -t "$CLAWDBOT_IMAGE" -f Dockerfile .

# 5. 运行配置向导
docker compose run --rm moltbot-cli onboard --no-install-daemon

# 配置向导会询问：
# - Gateway 绑定地址：选择 lan
# - Gateway 认证方式：选择 token
# - Gateway Token：输入上一步生成的 token
# - Tailscale 暴露：选择 No
# - 安装 Gateway 守护进程：选择 No（Docker 不需要）

# 6. 配置通讯渠道（可选）
# WhatsApp（QR 码登录）
docker compose run --rm moltbot-cli providers login

# Telegram（Bot Token）
docker compose run --rm moltbot-cli providers add --provider telegram --token <YOUR_BOT_TOKEN>

# Discord（Bot Token）
docker compose run --rm moltbot-cli providers add --provider discord --token <YOUR_BOT_TOKEN>

# 7. 启动 Gateway 服务
docker compose up -d moltbot-gateway

# 8. 查看日志
docker compose logs -f moltbot-gateway

# 9. 检查服务健康状态
docker compose exec moltbot-gateway node dist/index.js health --token "$CLAWDBOT_GATEWAY_TOKEN"
```

**4. 配置文件位置**

```
~/.clawdbot/              # 配置目录
├── config.json          # 主配置文件
├── gateway.json         # Gateway 配置
├── channels/            # 通讯渠道配置
├── providers/           # 服务提供商凭证
└── sessions/            # 会话存储

~/clawd/                  # 工作空间目录
├── workspace/           # AI 工作区
├── memory/              # 记忆存储
└── skills/              # 用户技能
```

**5. 常用命令**

```bash
# 启动服务
docker compose up -d moltbot-gateway

# 停止服务
docker compose stop moltbot-gateway

# 重启服务
docker compose restart moltbot-gateway

# 查看日志
docker compose logs -f moltbot-gateway

# 进入容器执行命令
docker compose run --rm moltbot-cli <command>

# 示例：发送消息
docker compose run --rm moltbot-cli message send --to +1234567890 --message "Hello from Moltbot"

# 示例：与 AI 对话
docker compose run --rm moltbot-cli agent --message "帮我分析数据" --thinking high

# 更新到最新版本
git pull
docker compose build
docker compose up -d moltbot-gateway
```

### 方式二：从源代码部署（开发模式）

#### 前置要求

1. **Node.js ≥22.12.0**
   ```bash
   # 检查 Node 版本
   node --version

   # 如果版本过低，安装 Node 22+
   # Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # 或使用 nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22
   nvm use 22
   ```

2. **pnpm 包管理器**
   ```bash
   npm install -g pnpm@10.23.0
   ```

3. **系统依赖（Ubuntu/Debian）**
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     build-essential \
     python3 \
     pkg-config \
     libvips-dev \
     libcairo2-dev \
     libpango1.0-dev \
     libjpeg-dev \
     libgif-dev \
     librsvg2-dev
   ```

#### 部署步骤

**1. 克隆项目**
```bash
git clone https://github.com/moltbot/moltbot.git
cd moltbot
```

**2. 安装依赖**
```bash
pnpm install
```

**3. 构建 UI 界面**
```bash
pnpm ui:build
```

**4. 编译 TypeScript**
```bash
pnpm build
```

**5. 运行配置向导**
```bash
pnpm moltbot onboard --install-daemon
```

配置向导会引导您完成：
- Gateway 配置
- 工作空间设置
- 通讯渠道配置
- AI 模型选择
- 技能安装

**6. 启动 Gateway 服务**
```bash
# 开发模式（自动重载）
pnpm gateway:watch

# 生产模式
pnpm moltbot gateway --port 18789 --verbose
```

**7. 测试 AI 助手**
```bash
# 发送消息
pnpm moltbot message send --to +1234567890 --message "Hello from Moltbot"

# 与 AI 对话
pnpm moltbot agent --message "分析当前市场趋势" --thinking high
```

#### 开发工作流

```bash
# 1. 修改代码后自动重新编译和重启
pnpm gateway:watch

# 2. 运行测试
pnpm test

# 3. 代码检查
pnpm lint

# 4. 格式化代码
pnpm format:fix

# 5. 运行 UI 开发服务器
pnpm ui:dev

# 6. 完整测试流程
pnpm test:all
```

### 方式三：NPM 全局安装（最简单）

#### 前置要求

- Node.js ≥22.12.0
- npm 或 pnpm

#### 安装步骤

```bash
# 使用 npm 安装
npm install -g moltbot@latest

# 或使用 pnpm
pnpm add -g moltbot@latest

# 运行配置向导
moltbot onboard --install-daemon

# 启动 Gateway
moltbot gateway --port 18789 --verbose
```

## 🔑 AI 模型配置

### Anthropic Claude（推荐）

```bash
# 使用 OAuth 登录（推荐）
moltbot models login --provider anthropic

# 或使用 API Key
moltbot models add --provider anthropic --api-key YOUR_API_KEY

# 设置默认模型
moltbot models default --model claude-opus-4-20250514
```

### OpenAI

```bash
# OAuth 登录
moltbot models login --provider openai

# 或 API Key
moltbot models add --provider openai --api-key YOUR_API_KEY

# 设置默认模型
moltbot models default --model gpt-4-turbo
```

### 本地模型（可选）

```bash
# Ollama 支持
moltbot models add --provider ollama --endpoint http://localhost:11434

# 设置默认模型
moltbot models default --model ollama/llama3
```

### 模型故障转移配置

```bash
# 配置备用模型（主模型失败时自动切换）
moltbot models failover \
  --primary claude-opus-4-20250514 \
  --fallback gpt-4-turbo \
  --tertiary ollama/llama3
```

## 📱 通讯渠道配置

### WhatsApp

```bash
# QR 码登录（推荐）
moltbot providers login

# 扫描 QR 码后即可使用
```

### Telegram

```bash
# 1. 创建 Bot（通过 @BotFather）
# 2. 获取 Bot Token
# 3. 添加到 Moltbot
moltbot providers add --provider telegram --token YOUR_BOT_TOKEN
```

### Discord

```bash
# 1. 创建 Discord 应用（https://discord.com/developers/applications）
# 2. 创建 Bot 并获取 Token
# 3. 添加到 Moltbot
moltbot providers add --provider discord --token YOUR_BOT_TOKEN

# 4. 邀请 Bot 到服务器
```

### Slack

```bash
# 1. 创建 Slack App（https://api.slack.com/apps）
# 2. 配置 OAuth 权限
# 3. 添加到 Moltbot
moltbot providers add --provider slack --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

### iMessage（仅 macOS）

```bash
# 需要额外的权限配置
# macOS 自动检测并提示授权
moltbot providers add --provider imessage
```

## 🔧 高级配置

### 环境变量配置

创建 `.env` 文件（可选）：

```bash
# Gateway 配置
CLAWDBOT_GATEWAY_PORT=18789
CLAWDBOT_GATEWAY_TOKEN=your_generated_token
CLAWDBOT_GATEWAY_BIND=lan

# 工作目录
CLAWDBOT_CONFIG_DIR=$HOME/.clawdbot
CLAWDBOT_WORKSPACE_DIR=$HOME/clawd

# AI 模型（可选，不推荐）
# CLAUDE_AI_SESSION_KEY=your_session_key
# OPENAI_API_KEY=your_api_key

# Twilio（可选）
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+17343367101
```

### 系统服务配置（systemd）

创建 `/etc/systemd/user/moltbot-gateway.service`：

```ini
[Unit]
Description=Moltbot Gateway Service
After=network.target

[Service]
Type=simple
ExecStart=/home/your_user/.local/share/pnpm/global/node_modules/.bin/moltbot gateway --port 18789
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

启动服务：

```bash
systemctl --user daemon-reload
systemctl --user enable moltbot-gateway.service
systemctl --user start moltbot-gateway.service
```

### macOS Launchd 配置

创建 `~/Library/LaunchAgents/com.moltbot.gateway.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.moltbot.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/moltbot</string>
    <string>gateway</string>
    <string>--port</string>
    <string>18789</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

加载服务：

```bash
launchctl load ~/Library/LaunchAgents/com.moltbot.gateway.plist
```

## 🔍 故障排查

### 常见问题

**1. 端口被占用**
```bash
# 检查端口占用
sudo lsof -i :18789

# 更改端口
moltbot gateway --port 18790
```

**2. 权限问题**
```bash
# 确保目录权限正确
chmod -R 755 ~/.clawdbot
chmod -R 755 ~/clawd
```

**3. Docker 镜像构建失败**
```bash
# 清理 Docker 缓存
docker system prune -a

# 重新构建
docker build --no-cache -t moltbot:local -f Dockerfile .
```

**4. 依赖安装失败**
```bash
# 清理缓存重新安装
pnpm store prune
rm -rf node_modules
pnpm install
```

**5. AI 模型认证失败**
```bash
# 检查模型配置
moltbot models list

# 重新登录
moltbot models login --provider anthropic
```

### 日志查看

```bash
# Docker 部署
docker compose logs -f moltbot-gateway

# 源代码部署
pnpm gateway:watch  # 开发模式，实时日志

# 系统服务
journalctl --user -u moltbot-gateway.service -f

# macOS
log stream --predicate 'process == "moltbot"' --level debug
```

### 健康检查

```bash
# Docker
docker compose exec moltbot-gateway node dist/index.js health --token YOUR_TOKEN

# 源代码
moltbot health --token YOUR_TOKEN
```

### 诊断工具

```bash
# 运行完整诊断
moltbot doctor

# 检查配置
moltbot config validate

# 测试 AI 模型连接
moltbot models test
```

## 📊 项目核心逻辑

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户界面层                            │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│   CLI       │   Web UI    │  移动应用   │  通讯平台集成     │
│  (命令行)    │  (控制面板)  │ (iOS/Android)│ (WhatsApp/Telegram...)│
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬───────────┘
       │             │             │             │
┌──────▼─────────────▼─────────────▼─────────────▼───────────┐
│                        Gateway 网关层                        │
│  ┌─────────────┬─────────────┬──────────────────────────┐  │
│  │ 认证/授权    │ 会话管理     │  消息路由                │  │
│  └─────────────┴─────────────┴──────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                      Agent 代理层                            │
│  ┌─────────────┬─────────────┬──────────────────────────┐  │
│  │ PI Agent    │ 提示词管理   │  上下文窗口              │  │
│  └─────────────┴─────────────┴──────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    LLM 模型集成层                            │
│  ┌──────────┬──────────┬──────────┬──────────────────────┐ │
│  │Anthropic │ OpenAI   │ AWS      │ 本地模型              │ │
│  └──────────┴──────────┴──────────┴──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户消息（WhatsApp/Telegram/CLI）
    ↓
Gateway 接收并验证
    ↓
识别用户意图（Agent Router）
    ↓
加载会话上下文（Memory Store）
    ↓
构建提示词（Prompt Builder）
    ↓
调用 LLM（Model Provider）
    ↓
处理响应（Response Handler）
    ↓
执行工具/技能（Skill Runner）
    ↓
返回结果（Gateway）
    ↓
发送到用户渠道（Channel Adapter）
```

### 关键组件

1. **Gateway（网关）**
   - 功能：控制平面，管理所有通讯渠道
   - 文件：`src/gateway/`
   - 作用：认证、路由、会话管理

2. **Agents（代理）**
   - 功能：AI 推理和决策
   - 文件：`src/agents/`
   - 技术栈：`@mariozechner/pi-agent-core`
   - 作用：理解意图、规划任务、调用工具

3. **Channels（渠道）**
   - 功能：多平台消息适配
   - 文件：`src/channels/`
   - 支持平台：WhatsApp、Telegram、Slack、Discord 等
   - 作用：统一的消息格式转换

4. **Skills（技能）**
   - 功能：特定任务能力
   - 目录：`skills/`
   - 示例：邮件发送、日历管理、文件操作、API 调用等

5. **Providers（提供商）**
   - 功能：外部服务集成
   - 文件：`src/providers/`
   - 类型：AI 模型、通讯平台、数据存储等

## 🎯 使用场景

### 1. 个人助手
```bash
moltbot agent --message "帮我安排明天的会议"
```

### 2. 编程助手
```bash
moltbot agent --message "分析这个项目的架构" --thinking high
```

### 3. 自动化任务
```bash
# 创建定时任务
moltbot cron add --schedule "0 9 * * *" --message "每日简报"
```

### 4. 多渠道通知
```bash
# 同时发送到多个渠道
moltbot broadcast \
  --channels whatsapp,telegram,discord \
  --message "服务器维护通知"
```

### 5. 技能扩展
```bash
# 安装新技能
moltbot skills install food-order

# 使用技能
moltbot agent --message "帮我订午餐"
```

## 📈 性能优化

### 1. 缓存配置
- 会话缓存：减少重复加载
- 响应缓存：相似问题快速回复
- 向量索引：加速语义搜索

### 2. 并发控制
```bash
# 限制并发请求数
moltbot gateway --max-concurrent 5
```

### 3. 资源限制（Docker）
```yaml
services:
  moltbot-gateway:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
```

## 🔐 安全建议

1. **Token 管理**
   - 使用强随机 Token（64 字符十六进制）
   - 定期轮换 Token
   - 不要在日志中暴露 Token

2. **权限控制**
   - Gateway 运行在非 root 用户
   - 配置目录权限 700
   - 使用防火墙限制端口访问

3. **网络安全**
   - 使用反向代理（Nginx/Caddy）
   - 启用 HTTPS（TLS/SSL）
   - 配置 IP 白名单

4. **数据加密**
   - 会话数据加密存储
   - API Key 使用密钥管理服务
   - 传输层使用 TLS

## 📚 参考资源

- **官方文档**：https://docs.molt.bot
- **GitHub 仓库**：https://github.com/moltbot/moltbot
- **Discord 社区**：https://discord.gg/clawd
- **API 文档**：https://docs.molt.bot/api
- **插件开发**：https://docs.molt.bot/plugins

## 🤝 贡献指南

欢迎贡献代码、报告问题、提出建议！

详见：[CONTRIBUTING.md](https://github.com/moltbot/moltbot/blob/main/CONTRIBUTING.md)

## 📄 许可证

MIT License - 详见 [LICENSE](https://github.com/moltbot/moltbot/blob/main/LICENSE)

---

**祝您使用愉快！如有问题，请随时查阅官方文档或加入社区讨论喵～** ฅ'ω'ฅ
