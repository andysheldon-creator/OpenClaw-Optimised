# Moltbot Ubuntu NAS 内网部署指南

## 📋 部署场景

**适用场景**：
- 🖥️ **服务器**：Ubuntu NAS（内网环境）
- 📱 **客户端**：手机、PC、平板等内网设备
- 🔑 **AI 模型**：使用自己的 Claude Code API Key
- 🌐 **访问方式**：Web UI + 移动应用（通过内网 IP 访问）
- 🔒 **数据隐私**：所有数据存储在本地 NAS

### 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Ubuntu NAS 服务器                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Moltbot Gateway (Docker)             │  │
│  │  ┌─────────────┬─────────────┬─────────────────┐  │  │
│  │  │ Web UI      │  AI Agent   │  数据存储        │  │  │
│  │  │ (端口 3000) │  (Claude)   │  (SQLite)       │  │  │
│  │  └─────────────┴─────────────┴─────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ 内网 (192.168.x.x:18789)
                     │
      ┌──────────────┼──────────────┐
      │              │              │
┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│   手机     │  │   PC      │  │   平板    │
│  (浏览器)  │  │  (浏览器)  │  │  (浏览器)  │
└───────────┘  └───────────┘  └───────────┘
```

## 🛠️ 前置要求

### NAS 服务器要求

- **操作系统**：Ubuntu 22.04+ / 24.04+
- **内存**：至少 4GB RAM（推荐 8GB+）
- **存储**：至少 20GB 可用空间
- **网络**：内网静态 IP（如 192.168.1.100）
- **CPU**：x86_64 架构（支持 Docker）

### 客户端要求

- **浏览器**：Chrome、Edge、Safari、Firefox（现代浏览器）
- **网络**：与 NAS 在同一局域网
- **移动应用**：iOS 14+ / Android 8+（可选）

## 📦 快速部署（推荐）

### 方式一：自动化脚本部署（最简单）

**优势**：
- ✅ 一键部署，无需手动配置
- ✅ 自动生成安全 Token
- ✅ 自动创建配置目录
- ✅ 自动启动服务

#### 步骤 1：连接到 NAS

```bash
# SSH 连接到 NAS（替换为你的 NAS IP）
ssh user@192.168.1.100

# 或直接在 NAS 终端操作
```

#### 步骤 2：安装 Docker

```bash
# 检查是否已安装 Docker
docker --version
docker compose version

# 如果未安装，执行以下命令
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 启动 Docker 服务
sudo systemctl start docker
sudo systemctl enable docker

# 添加当前用户到 docker 组（避免 sudo）
sudo usermod -aG docker $USER
newgrp docker

# 验证安装
docker --version
docker compose version
```

#### 步骤 3：克隆项目

```bash
# 进入工作目录（建议放在专门的目录）
cd ~/apps
# 或
cd /opt

# 克隆项目
git clone https://github.com/moltbot/moltbot.git
cd moltbot
```

#### 步骤 4：配置环境变量

```bash
# 编辑 .env 文件（如果不存在则创建）
nano .env

# 添加以下内容（根据你的内网环境调整）
```

```bash
# Gateway 配置
CLAWDBOT_GATEWAY_PORT=18789              # Gateway 端口
CLAWDBOT_GATEWAY_BIND=lan                # 绑定到局域网
CLAWDBOT_CONFIG_DIR=/home/your_user/.clawdbot  # 配置目录
CLAWDBOT_WORKSPACE_DIR=/home/your_user/clawd   # 工作空间目录

# 镜像配置
CLAWDBOT_IMAGE=moltbot:local             # Docker 镜像名称

# Claude API 配置（稍后配置）
# ANTHROPIC_API_KEY=your_api_key_here
```

**保存并退出**：`Ctrl+O` → `Enter` → `Ctrl+X`

#### 步骤 5：运行自动化部署脚本

```bash
# 赋予执行权限
chmod +x docker-setup.sh

# 运行部署脚本
bash docker-setup.sh
```

**脚本会自动完成**：
1. 构建 Docker 镜像（约 5-10 分钟）
2. 生成 Gateway Token
3. 创建配置目录
4. 运行交互式配置向导
5. 启动 Gateway 服务

#### 步骤 6：配置向导交互

脚本运行后会进入交互式配置界面：

```
==> Onboarding (interactive)
When prompted:
  - Gateway bind: lan              # 选择 lan（局域网访问）
  - Gateway auth: token            # 选择 token（Token 认证）
  - Gateway token: <自动生成>       # 使用脚本生成的 Token
  - Tailscale exposure: Off        # 选择 Off（不需要外网访问）
  - Install Gateway daemon: No     # 选择 No（Docker 不需要）
```

**记录以下信息**（稍后访问时需要）：
```
Gateway Token: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Gateway Port: 18789
Config: /home/your_user/.clawdbot
Workspace: /home/your_user/clawd
```

#### 步骤 7：配置 Claude API Key

```bash
# 使用 Docker Compose 运行配置命令
docker compose run --rm moltbot-cli models add \
  --provider anthropic \
  --api-key YOUR_CLAUDE_API_KEY

# 设置为默认模型
docker compose run --rm moltbot-cli models default \
  --model claude-opus-4-20250514

# 验证配置
docker compose run --rm moltbot-cli models list
```

**获取 Claude API Key**：
1. 访问 https://console.anthropic.com/
2. 登录或注册账号
3. 进入 "API Keys" 页面
4. 点击 "Create Key"
5. 复制生成的 API Key

#### 步骤 8：配置通讯渠道（可选）

**WhatsApp（推荐）**：
```bash
# 运行登录命令，会显示 QR 码
docker compose run --rm moltbot-cli providers login

# 用手机 WhatsApp 扫码登录
```

**Telegram（可选）**：
```bash
# 1. 在 Telegram 中找到 @BotFather
# 2. 发送 /newbot 创建机器人
# 3. 获取 Bot Token
# 4. 添加到 Moltbot
docker compose run --rm moltbot-cli providers add \
  --provider telegram \
  --token YOUR_TELEGRAM_BOT_TOKEN
```

**Discord（可选）**：
```bash
# 1. 访问 https://discord.com/developers/applications
# 2. 创建应用并获取 Bot Token
# 3. 添加到 Moltbot
docker compose run --rm moltbot-cli providers add \
  --provider discord \
  --token YOUR_DISCORD_BOT_TOKEN
```

#### 步骤 9：验证部署

```bash
# 检查服务状态
docker compose ps

# 查看日志
docker compose logs -f moltbot-gateway

# 健康检查（替换 YOUR_TOKEN）
docker compose exec moltbot-gateway node dist/index.js health \
  --token "YOUR_GATEWAY_TOKEN"
```

**预期输出**：
```
✓ Gateway is running
✓ Database is connected
✓ AI model is configured
✓ Channels are ready
```

#### 步骤 10：从客户端访问

**获取 NAS IP 地址**：
```bash
# 查看 NAS IP
hostname -I
# 假设输出：192.168.1.100
```

**从手机/PC 浏览器访问**：
```
http://192.168.1.100:18789
```

**首次访问配置**：
1. 输入 Gateway Token（步骤 6 中记录的）
2. 选择 AI 模型（Claude Opus）
3. 开始聊天！

---

### 方式二：手动部署（高级用户）

#### 步骤 1：准备环境

```bash
# 克隆项目
git clone https://github.com/moltbot/moltbot.git
cd moltbot

# 创建必要的目录
mkdir -p ~/.clawdbot
mkdir -p ~/clawd

# 生成 Gateway Token
export CLAWDBOT_GATEWAY_TOKEN=$(openssl rand -hex 32)
echo $CLAWDBOT_GATEWAY_TOKEN
# 记录这个 Token！
```

#### 步骤 2：配置 Docker Compose

```bash
# 复制并编辑 docker-compose.yml
nano docker-compose.yml
```

**修改端口映射（可选）**：
```yaml
services:
  moltbot-gateway:
    image: moltbot:local
    environment:
      HOME: /home/node
      TERM: xterm-256color
      CLAWDBOT_GATEWAY_TOKEN: ${CLAWDBOT_GATEWAY_TOKEN}
      # 添加你的 Claude API Key
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    volumes:
      - ${CLAWDBOT_CONFIG_DIR}:/home/node/.clawdbot
      - ${CLAWDBOT_WORKSPACE_DIR}:/home/node/clawd
    ports:
      # 修改为你的内网 IP（可选，默认 0.0.0.0）
      - "18789:18789"
      - "18790:18790"
    restart: unless-stopped
```

#### 步骤 3：构建镜像

```bash
# 构建 Docker 镜像
docker build -t moltbot:local -f Dockerfile .

# 验证镜像
docker images | grep moltbot
```

#### 步骤 4：运行配置向导

```bash
# 运行一次性配置容器
docker compose run --rm moltbot-cli onboard --no-install-daemon
```

**按提示配置**：
- Gateway bind: `lan`
- Gateway auth: `token`
- Gateway token: 输入步骤 1 生成的 Token
- Install daemon: `No`

#### 步骤 5：配置 Claude API

```bash
# 方式 1：通过 CLI
docker compose run --rm moltbot-cli models add \
  --provider anthropic \
  --api-key sk-ant-api03-...

# 方式 2：直接编辑配置文件
nano ~/.clawdbot/config.json
```

在 `config.json` 中添加：
```json
{
  "models": {
    "default": "claude-opus-4-20250514",
    "providers": {
      "anthropic": {
        "apiKey": "sk-ant-api03-..."
      }
    }
  }
}
```

#### 步骤 6：启动服务

```bash
# 启动 Gateway
docker compose up -d moltbot-gateway

# 查看日志
docker compose logs -f moltbot-gateway
```

#### 步骤 7：配置防火墙（如果需要）

```bash
# Ubuntu UFW 防火墙
sudo ufw allow 18789/tcp
sudo ufw allow 18790/tcp
sudo ufw reload

# 或使用 iptables
sudo iptables -A INPUT -p tcp --dport 18789 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 18790 -j ACCEPT
```

#### 步骤 8：配置内网访问

**固定 NAS IP 地址**：

```bash
# 编辑网络配置
sudo nano /etc/netplan/00-installer-config.yaml
```

添加静态 IP 配置：
```yaml
network:
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
  version: 2
```

应用配置：
```bash
sudo netplan apply
```

## 🔐 配置 Claude Code API Key

### 获取 API Key

1. **访问 Anthropic 控制台**
   ```
   https://console.anthropic.com/
   ```

2. **登录或注册账号**
   - 使用邮箱登录
   - 验证手机号（首次使用）

3. **创建 API Key**
   - 进入 "API Keys" 页面
   - 点击 "Create Key"
   - 设置 Key 名称（如 "Moltbot-NAS"）
   - 选择权限（需要 "Messages" 权限）
   - 点击 "Create"
   - **立即复制 Key**（只显示一次！）

4. **充值余额**
   - Claude API 按使用量计费
   - 进入 "Billing" 页面
   - 添加支付方式（信用卡）
   - 设置使用限额（防止意外超支）

### 配置 API Key

**方式 1：通过 CLI 配置（推荐）**

```bash
# 进入项目目录
cd ~/apps/moltbot

# 添加 Anthropic API Key
docker compose run --rm moltbot-cli models add \
  --provider anthropic \
  --api-key sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 设置默认模型
docker compose run --rm moltbot-cli models default \
  --model claude-opus-4-20250514

# 验证配置
docker compose run --rm moltbot-cli models list

# 测试模型连接
docker compose run --rm moltbot-cli models test
```

**方式 2：通过环境变量配置**

```bash
# 编辑 .env 文件
nano .env

# 添加以下内容
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 重启服务
docker compose restart moltbot-gateway
```

**方式 3：直接编辑配置文件**

```bash
# 编辑主配置文件
nano ~/.clawdbot/config.json
```

添加或修改：
```json
{
  "models": {
    "default": "claude-opus-4-20250514",
    "providers": {
      "anthropic": {
        "apiKey": "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "baseURL": "https://api.anthropic.com"
      }
    }
  }
}
```

重启服务：
```bash
docker compose restart moltbot-gateway
```

### 模型选择建议

**Claude Opus 4.5**（推荐用于 NAS）：
- ✅ 最强推理能力
- ✅ 200K 上下文窗口
- ✅ 适合复杂任务
- ❌ API 成本较高（$15/百万输入 tokens）

**Claude Sonnet 4.5**（性价比之选）：
- ✅ 性能优秀
- ✅ 成本适中（$3/百万输入 tokens）
- ✅ 响应速度快
- ⚠️ 上下文窗口较小（200K）

**Claude Haiku 4.5**（快速响应）：
- ✅ 响应最快
- ✅ 成本最低（$0.25/百万输入 tokens）
- ❌ 推理能力较弱

**配置示例**：
```bash
# 日常使用：Sonnet（性价比）
docker compose run --rm moltbot-cli models default \
  --model claude-sonnet-4-20250514

# 复杂任务：Opus（最强）
docker compose run --rm moltbot-cli models default \
  --model claude-opus-4-20250514

# 快速响应：Haiku（最便宜）
docker compose run --rm moltbot-cli models default \
  --model claude-haiku-4-20250514
```

### 成本控制

**设置使用限额**：
```bash
# 在 Anthropic 控制台设置
# 1. 进入 "Settings" -> "Usage Limits"
# 2. 设置每日/每月限额
# 3. 启用超限提醒
```

**监控使用量**：
```bash
# 查看使用统计
docker compose run --rm moltbot-cli agents stats

# 或在控制台查看
# https://console.anthropic.com/settings/usage
```

## 📱 客户端访问配置

### Web UI 访问（推荐）

#### PC 浏览器

1. **打开浏览器**
   - Chrome、Edge、Firefox、Safari 均可

2. **访问 Gateway 地址**
   ```
   http://192.168.1.100:18789
   ```
   （替换为你的 NAS IP）

3. **首次配置**
   - 输入 Gateway Token
   - 选择 AI 模型
   - 开始聊天

#### 手机浏览器

**Android (Chrome)**：
1. 打开 Chrome 浏览器
2. 访问 `http://192.168.1.100:18789`
3. 添加到主屏幕（PWA 应用）
   - 点击浏览器菜单 → "添加到主屏幕"

**iOS (Safari)**：
1. 打开 Safari 浏览器
2. 访问 `http://192.168.1.100:18789`
3. 添加到主屏幕
   - 点击分享按钮 → "添加到主屏幕"

### 移动应用访问（可选）

#### iOS 应用

**安装步骤**：
1. 在 iOS 设备上打开 App Store
2. 搜索 "Moltbot"（官方应用）
3. 安装应用

**配置步骤**：
1. 打开 Moltbot 应用
2. 点击 "设置" → "Gateway 配置"
3. 输入 Gateway 地址：`http://192.168.1.100:18789`
4. 输入 Gateway Token
5. 保存配置

**注意**：iOS 应用可能需要 TestFlight 或侧载（未上架 App Store）

#### Android 应用

**安装步骤**：
1. 在 Android 设备上访问 GitHub Releases
2. 下载最新 APK 文件
   ```
   https://github.com/moltbot/moltbot/releases
   ```
3. 安装 APK（允许未知来源）

**配置步骤**：
1. 打开 Moltbot 应用
2. 点击 "设置" → "Gateway 配置"
3. 输入 Gateway 地址：`http://192.168.1.100:18789`
4. 输入 Gateway Token
5. 保存配置

### 桌面客户端（可选）

#### macOS

```bash
# 使用 Homebrew 安装
brew install --cask moltbot

# 或从源代码构建
cd moltbot/apps/macos
pnpm ios:build
open dist/Moltbot.app
```

#### Windows

```bash
# 下载安装包
# https://github.com/moltbot/moltbot/releases

# 运行安装程序
Moltbot-Setup-x.x.x.exe
```

#### Linux

```bash
# 使用 AppImage（推荐）
wget https://github.com/moltbot/moltbot/releases/latest/download/Moltbot-linux-x86_64.AppImage
chmod +x Moltbot-linux-x86_64.AppImage
./Moltbot-linux-x86_64.AppImage
```

### 内网访问优化

#### 配置内网域名（可选）

**使用本地 DNS**：

1. **在路由器配置 DNS**（推荐）
   - 登录路由器管理界面
   - 找到 "DHCP/DNS" 设置
   - 添加 DNS 记录：
     ```
     moltbot.local → 192.168.1.100
     ```
   - 保存并重启路由器

2. **在客户端配置 hosts 文件**

   **Windows**：
   ```
   C:\Windows\System32\drivers\etc\hosts
   ```
   添加：
   ```
   192.168.1.100 moltbot.local
   ```

   **macOS/Linux**：
   ```bash
   sudo nano /etc/hosts
   ```
   添加：
   ```
   192.168.1.100 moltbot.local
   ```

3. **使用域名访问**
   ```
   http://moltbot.local:18789
   ```

#### 配置反向代理（可选）

**使用 Nginx 反向代理**：

```bash
# 安装 Nginx
sudo apt install nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/moltbot
```

添加配置：
```nginx
server {
    listen 80;
    server_name moltbot.local;

    location / {
        proxy_pass http://localhost:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/moltbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

访问地址变为：
```
http://moltbot.local
```

**使用 Caddy 自动 HTTPS**（推荐）：

```bash
# 安装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

编辑 Caddyfile：
```bash
sudo nano /etc/caddy/Caddyfile
```

添加配置：
```caddy
moltbot.local {
    reverse_proxy localhost:18789
}
```

重启 Caddy：
```bash
sudo systemctl restart caddy
```

访问地址：
```
https://moltbot.local
```

## 🔧 管理和维护

### 日常管理命令

```bash
# 进入项目目录
cd ~/apps/moltbot

# 查看服务状态
docker compose ps

# 查看实时日志
docker compose logs -f moltbot-gateway

# 重启服务
docker compose restart moltbot-gateway

# 停止服务
docker compose stop moltbot-gateway

# 启动服务
docker compose start moltbot-gateway

# 更新到最新版本
git pull
docker compose build
docker compose up -d moltbot-gateway

# 清理旧镜像
docker image prune -a
```

### 备份和恢复

**备份配置和数据**：

```bash
# 创建备份脚本
nano ~/backup-moltbot.sh
```

添加内容：
```bash
#!/bin/bash
BACKUP_DIR="/path/to/backup"
DATE=$(date +%Y%m%d_%H%M%S)

# 备份配置目录
tar -czf "$BACKUP_DIR/clawdbot_$DATE.tar.gz" ~/.clawdbot

# 备份工作空间
tar -czf "$BACKUP_DIR/clawd_$DATE.tar.gz" ~/clawd

# 保留最近 7 天的备份
find "$BACKUP_DIR" -name "clawdbot_*.tar.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "clawd_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

设置定时任务：
```bash
chmod +x ~/backup-moltbot.sh

# 添加到 crontab（每天凌晨 2 点备份）
crontab -e

# 添加以下行
0 2 * * * ~/backup-moltbot.sh
```

**恢复数据**：

```bash
# 停止服务
docker compose stop moltbot-gateway

# 恢复配置
tar -xzf /path/to/backup/clawdbot_20250129_020000.tar.gz -C ~/

# 恢复工作空间
tar -xzf /path/to/backup/clawd_20250129_020000.tar.gz -C ~/

# 重启服务
docker compose start moltbot-gateway
```

### 性能优化

**限制 Docker 资源使用**：

编辑 `docker-compose.yml`：
```yaml
services:
  moltbot-gateway:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '2.0'      # 限制使用 2 个 CPU 核心
          memory: 2G       # 限制使用 2GB 内存
        reservations:
          cpus: '1.0'      # 保留 1 个 CPU 核心
          memory: 1G       # 保留 1GB 内存
```

重启服务：
```bash
docker compose up -d moltbot-gateway
```

**启用日志轮转**：

```bash
# 配置 Docker 日志
sudo nano /etc/docker/daemon.json
```

添加配置：
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

重启 Docker：
```bash
sudo systemctl restart docker
docker compose up -d moltbot-gateway
```

### 监控和告警

**系统资源监控**：

```bash
# 查看容器资源使用
docker stats moltbot-moltbot-gateway-1

# 安装 htop（交互式监控）
sudo apt install htop
htop

# 查看 Gateway 日志
docker compose logs -f moltbot-gateway --tail 100
```

**健康检查脚本**：

```bash
# 创建健康检查脚本
nano ~/health-check-moltbot.sh
```

添加内容：
```bash
#!/bin/bash
GATEWAY_TOKEN="YOUR_GATEWAY_TOKEN"
MAX_RETRIES=3
RETRY_DELAY=5

check_health() {
    for i in $(seq 1 $MAX_RETRIES); do
        response=$(docker compose exec moltbot-gateway \
            node dist/index.js health --token "$GATEWAY_TOKEN" 2>&1)

        if echo "$response" | grep -q "✓"; then
            echo "$(date): Moltbot is healthy"
            return 0
        fi

        echo "$(date): Health check failed (attempt $i/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    done

    echo "$(date): Health check failed after $MAX_RETRIES attempts"
    # 发送告警通知
    # curl -X POST "YOUR_NOTIFICATION_WEBHOOK" -d "Moltbot health check failed"
    return 1
}

check_health
```

设置定时检查：
```bash
chmod +x ~/health-check-moltbot.sh

# 每 5 分钟检查一次
crontab -e
*/5 * * * * ~/health-check-moltbot.sh >> ~/moltbot-health.log 2>&1
```

## 🔍 故障排查

### 常见问题

**问题 1：无法访问 Web UI**

```bash
# 检查服务是否运行
docker compose ps

# 检查端口是否监听
sudo netstat -tlnp | grep 18789

# 检查防火墙
sudo ufw status

# 查看 Gateway 日志
docker compose logs moltbot-gateway

# 解决方案
# 1. 确保服务正在运行
docker compose up -d moltbot-gateway

# 2. 检查 NAS IP 是否正确
hostname -I

# 3. 尝试用 localhost 访问（在 NAS 上）
curl http://localhost:18789
```

**问题 2：AI 模型无响应**

```bash
# 检查 API Key 配置
docker compose run --rm moltbot-cli models list

# 测试模型连接
docker compose run --rm moltbot-cli models test

# 查看 Gateway 日志
docker compose logs -f moltbot-gateway | grep -i "anthropic\|error"

# 解决方案
# 1. 重新配置 API Key
docker compose run --rm moltbot-cli models add \
  --provider anthropic \
  --api-key YOUR_NEW_API_KEY

# 2. 检查 API Key 余额
# 访问 https://console.anthropic.com/settings/usage

# 3. 尝试切换模型
docker compose run --rm moltbot-cli models default \
  --model claude-sonnet-4-20250514
```

**问题 3：内存不足**

```bash
# 查看内存使用
free -h
docker stats

# 解决方案
# 1. 限制 Docker 内存
# 编辑 docker-compose.yml，添加资源限制（见性能优化部分）

# 2. 增加 Swap 空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. 重启服务
docker compose restart moltbot-gateway
```

**问题 4：Token 认证失败**

```bash
# 查看 Token
cat ~/.clawdbot/gateway.json | grep token

# 重新生成 Token
export NEW_TOKEN=$(openssl rand -hex 32)
echo $NEW_TOKEN

# 更新配置
nano ~/.clawdbot/gateway.json
# 找到 "token" 字段，替换为新的 Token

# 重启服务
docker compose restart moltbot-gateway

# 使用新 Token 访问
```

### 日志分析

**查看不同级别的日志**：

```bash
# 查看最近 100 行日志
docker compose logs --tail 100 moltbot-gateway

# 实时跟踪日志
docker compose logs -f moltbot-gateway

# 查看错误日志
docker compose logs moltbot-gateway | grep -i "error"

# 查看警告日志
docker compose logs moltbot-gateway | grep -i "warning"

# 导出日志到文件
docker compose logs moltbot-gateway > moltbot.log
```

### 诊断工具

```bash
# 运行完整诊断
docker compose run --rm moltbot-cli doctor

# 检查配置文件
docker compose run --rm moltbot-cli config validate

# 测试所有通讯渠道
docker compose run --rm moltbot-cli channels test

# 查看系统信息
docker compose run --rm moltbot-cli system info
```

## 📊 成本估算

### API 成本（Claude）

**使用场景**：
- 轻度使用（每天 10 条消息）：约 $5-10/月
- 中度使用（每天 50 条消息）：约 $20-50/月
- 重度使用（每天 200 条消息）：约 $100-200/月

**优化建议**：
1. 日常对话使用 Haiku（最便宜）
2. 复杂任务使用 Sonnet（性价比）
3. 特殊需求使用 Opus（最强）
4. 设置使用限额，防止意外超支

### 硬件成本

**最低配置**：
- CPU: 2 核
- 内存: 4GB
- 存储: 20GB
- 成本: $0（使用现有 NAS）

**推荐配置**：
- CPU: 4 核
- 内存: 8GB
- 存储: 50GB
- 成本: $200-500（如果需要新购设备）

## 🔐 安全最佳实践

### 网络安全

1. **隔离内网访问**
   - 不要将 Gateway 端口暴露到公网
   - 使用防火墙限制访问
   - 仅允许内网 IP 访问

2. **使用强 Token**
   ```bash
   # 生成 64 字符随机 Token
   openssl rand -hex 32
   ```

3. **定期更新**
   ```bash
   # 每月更新一次
   git pull
   docker compose build
   docker compose up -d moltbot-gateway
   ```

### 数据安全

1. **加密敏感数据**
   - API Key 存储在加密配置文件
   - 不要在日志中暴露 Token
   - 定期备份配置

2. **访问控制**
   - 不要共享 Gateway Token
   - 为每个设备使用独立 Token（如果支持）
   - 定期轮换 Token

## 📚 参考资源

- **官方文档**：https://docs.molt.bot
- **GitHub 仓库**：https://github.com/moltbot/moltbot
- **Discord 社区**：https://discord.gg/clawd
- **Claude API 文档**：https://docs.anthropic.com

## 🎉 总结

通过本指南，您应该已经成功在 Ubuntu NAS 上部署了 Moltbot，并配置了自己的 Claude API Key。现在您可以：

- ✅ 从内网任何设备访问 Moltbot
- ✅ 使用自己的 Claude API Key
- ✅ 享受本地化、隐私保护的 AI 助手
- ✅ 通过多个渠道（Web、手机、PC）与 AI 交互

**下一步**：
- 探索更多技能（Skills）
- 配置更多通讯渠道
- 优化性能和成本
- 享受 AI 助手带来的便利！

---

**祝您使用愉快！如有问题，请随时查阅官方文档或加入社区讨论喵～** ฅ'ω'ฅ
