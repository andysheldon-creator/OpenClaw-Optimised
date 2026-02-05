# DingTalk 双向通信配置指南

## 方案 A：Outgoing Webhook（推荐）

### 1. 在 DingTalk 中配置 Outgoing Webhook

1. 打开 DingTalk 群组设置
2. 群助手 → 添加机器人 → 选择"自定义机器人"
3. 在"消息接收模式"中选择 **"Outgoing 机器人"**
4. 配置：
   - POST 地址：`http://你的公网地址/webhooks/dingtalk`
   - Token：自定义一个密钥
   - 加签密钥：记录下来

### 2. 启动 OpenClaw Gateway

```bash
# 方式 1：使用 Tailscale Funnel（推荐）
pnpm openclaw gateway run --funnel

# 方式 2：使用 ngrok
pnpm openclaw gateway run --port 18789
# 在另一个终端：
ngrok http 18789
```

### 3. 配置 OpenClaw

编辑 `~/.openclaw/openclaw.json`，添加：

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "webhookUrl": "你的发送webhook-url",
      "secret": "你的发送secret",
      "outgoing": {
        "enabled": true,
        "token": "你配置的outgoing-token"
      },
      "dmPolicy": "open"
    }
  }
}
```

### 4. 测试

在 DingTalk 群组中：

```
@机器人名称 你好
```

机器人应该会回复！

---

## 方案 B：轮询模式（简单但不推荐）

如果 Outgoing Webhook 不可用，可以使用定时轮询：

### 实现思路

1. 使用 DingTalk 开放平台 API
2. 定期查询群组消息
3. 处理新消息并回复

**缺点**：

- 需要企业内部应用权限
- 有 API 调用限制
- 延迟较高

---

## 方案 C：企业内部应用（最完整）

如果你有企业管理员权限：

### 1. 创建企业内部应用

1. 登录 [DingTalk 开放平台](https://open-dev.dingtalk.com/)
2. 创建企业内部应用
3. 获取 AppKey 和 AppSecret
4. 配置服务器出口 IP
5. 开启 Stream 模式

### 2. 配置 OpenClaw

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "mode": "stream",
      "appKey": "你的appkey",
      "appSecret": "你的appsecret",
      "dmPolicy": "open"
    }
  }
}
```

---

## 当前实现状态

目前 DingTalk 扩展实现了：

- ✅ 发送消息（webhook）
- ✅ 接收消息的框架（gateway.ts）
- ⚠️ 需要配置 Outgoing Webhook 或 Stream 模式

---

## 快速测试（不需要双向通信）

如果只是想测试发送功能：

```bash
# 使用测试脚本
node extensions/dingtalk/test-dingtalk.mjs \
  "你的webhook-url" \
  "你的secret"
```

---

## 推荐方案

对于个人使用：

1. **先使用方案 A（Outgoing Webhook）** - 最简单
2. 如果不行，使用测试脚本单向发送
3. 如果需要完整功能，考虑方案 C（企业应用）

需要我帮你实现哪个方案？
