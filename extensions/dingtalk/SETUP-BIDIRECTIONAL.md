# DingTalk 双向对话配置指南

## 🎯 方案说明

由于 OpenClaw 插件系统的限制，我们使用**独立的 Bridge 服务**来实现 DingTalk 双向通信。

## 📋 完整步骤

### 步骤 1：在 DingTalk 中创建 Outgoing 机器人

1. **删除现有的自定义机器人**（如果有）

2. **创建新的 Outgoing 机器人**：
   - 打开 DingTalk 群组
   - 群设置 → 群助手 → 添加机器人
   - 选择 **"自定义机器人"** 并启用 **"Outgoing"** 模式

3. **配置机器人**：
   - 机器人名称：`OpenClaw Bot`
   - **Token**：设置为 `openclaw-dingtalk-token`（记住这个）
   - **加签密钥**：会自动生成（例如：`SECxxx...`）
   - **POST 地址**：先留空，稍后填写

4. **记录以下信息**：
   - ✅ Outgoing Token: `openclaw-dingtalk-token`
   - ✅ 加签密钥: `SECxxx...`
   - ✅ Webhook URL（发送消息用）: `https://oapi.dingtalk.com/robot/send?access_token=xxx`

### 步骤 2：配置 Bridge 服务

编辑 `extensions/dingtalk/bridge-service.mjs`，修改配置：

```javascript
const CONFIG = {
  dingtalk: {
    webhookUrl: "你的webhook-url", // 从步骤1获取
    secret: "你的加签密钥", // 从步骤1获取
    outgoingToken: "openclaw-dingtalk-token", // 从步骤1设置的Token
  },
  gateway: {
    url: "ws://127.0.0.1:18789",
    token: "b047968c7cb4cf141a325536f5b0c393e490b3b6c60da314",
  },
  bridge: {
    port: 3000,
    path: "/dingtalk/webhook",
  },
};
```

### 步骤 3：启动服务

```bash
# 1. 启动 OpenClaw Gateway（如果还没启动）
pnpm openclaw gateway run --port 18789

# 2. 在新终端启动 Bridge 服务
cd extensions/dingtalk
node bridge-service.mjs
```

你会看到：

```
🚀 DingTalk Bridge 服务已启动
📍 监听端口: 3000
📍 Webhook 路径: /dingtalk/webhook
✅ 已连接到 OpenClaw Gateway
```

### 步骤 4：暴露服务到公网

选择一种方式：

#### 方式 A：使用 ngrok（推荐）

```bash
# 在新终端运行
ngrok http 3000
```

会显示：

```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

复制这个 `https://abc123.ngrok.io` 地址。

#### 方式 B：使用 Tailscale Funnel

```bash
tailscale funnel 3000
```

### 步骤 5：配置 DingTalk POST 地址

回到 DingTalk 机器人设置：

1. 编辑机器人
2. **POST 地址**填写：

   ```
   https://abc123.ngrok.io/dingtalk/webhook
   ```

   （替换为你的 ngrok 地址）

3. 保存

### 步骤 6：测试

在 DingTalk 群组中：

```
@OpenClaw Bot 你好
```

应该会收到回复！

## 🔍 故障排查

### 1. Bridge 服务日志

查看 Bridge 服务的输出：

- `📥 收到 DingTalk 消息` - 表示收到了 DingTalk 的消息
- `✅ 已转发到 OpenClaw Gateway` - 表示已转发给 Gateway
- `✅ 已发送回复到 DingTalk` - 表示回复已发送

### 2. Gateway 日志

```bash
tail -f /tmp/openclaw/openclaw-2026-02-05.log
```

### 3. 常见问题

**Q: Token 验证失败**

- 检查 `bridge-service.mjs` 中的 `outgoingToken` 是否与 DingTalk 设置一致

**Q: Gateway 未连接**

- 确保 OpenClaw Gateway 正在运行
- 检查 Gateway token 是否正确

**Q: DingTalk 收不到回复**

- 检查 webhook URL 和 secret 是否正确
- 查看 Bridge 服务日志

**Q: POST 地址无法访问**

- 确保 ngrok 或 Tailscale 正在运行
- 检查防火墙设置

## 📊 架构图

```
DingTalk 群组
    ↓ (Outgoing Webhook)
Bridge 服务 (port 3000)
    ↓ (WebSocket)
OpenClaw Gateway (port 18789)
    ↓ (处理消息)
AI 模型
    ↓ (生成回复)
OpenClaw Gateway
    ↓ (WebSocket)
Bridge 服务
    ↓ (Webhook POST)
DingTalk 群组
```

## 🎉 完成！

配置完成后，你就可以在 DingTalk 群组中与 OpenClaw 机器人对话了！
