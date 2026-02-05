# DingTalk 集成测试指南

## 测试步骤

### 1. 在 DingTalk 中创建自定义机器人

1. 打开 DingTalk 群组
2. 点击群设置（右上角）→ 群助手 → 添加机器人
3. 选择"自定义机器人"
4. 输入机器人名称（例如：OpenClaw Bot）
5. **安全设置**：选择"加签"（推荐）
6. 复制以下信息：
   - Webhook URL（类似：`https://oapi.dingtalk.com/robot/send?access_token=xxx`）
   - 密钥（Secret，类似：`SECxxx`）

### 2. 快速测试（不需要完整配置）

使用测试脚本直接测试连接：

```bash
cd extensions/dingtalk
node test-dingtalk.mjs \
  "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN" \
  "YOUR_SECRET"
```

如果成功，你会在 DingTalk 群组中看到测试消息。

### 3. 完整集成测试

#### 3.1 配置 OpenClaw

手动编辑配置文件 `~/.openclaw/openclaw.json`，添加：

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN",
      "secret": "YOUR_SECRET",
      "dmPolicy": "pairing"
    }
  }
}
```

或者使用 onboarding 向导（需要先启动网关）：

```bash
pnpm openclaw onboard dingtalk
```

#### 3.2 检查状态

```bash
pnpm openclaw channels status
```

应该能看到 DingTalk 频道的状态。

#### 3.3 发送测试消息

```bash
pnpm openclaw message send --to dingtalk "Hello from OpenClaw! 🦞"
```

### 4. 网关测试（双向通信）

如果需要接收来自 DingTalk 的消息：

```bash
# 启动网关
pnpm openclaw gateway run --port 18789

# 在另一个终端检查状态
pnpm openclaw channels status --deep
```

**注意**：接收消息需要：

1. 网关可以从公网访问（使用 ngrok 或 Tailscale Funnel）
2. 在 DingTalk 机器人设置中配置 Outgoing Webhook

## 常见问题

### 1. 签名验证失败

- 检查 Secret 是否正确复制（不要有多余空格）
- 确保系统时间准确（签名有时间窗口限制）

### 2. 消息发送失败

- 检查 Webhook URL 是否完整
- 确认机器人没有被禁用
- 检查网络连接

### 3. 找不到 dingtalk 频道

- 确保扩展已构建：`cd extensions/dingtalk && pnpm build`
- 检查 `openclaw.plugin.json` 文件存在
- 重启 OpenClaw

## API 限制

- 每个机器人每分钟最多发送 20 条消息
- 单条消息最大 20KB
- 签名有效期 1 小时

## 参考文档

- [DingTalk 自定义机器人文档](https://open.dingtalk.com/document/robots/custom-robot-access)
- [OpenClaw 频道文档](https://docs.openclaw.ai/channels)
