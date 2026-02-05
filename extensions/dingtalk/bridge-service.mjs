#!/usr/bin/env node
/**
 * DingTalk Bridge Service - 独立的双向通信服务
 *
 * 功能：
 * 1. 接收来自 DingTalk 的 Outgoing Webhook
 * 2. 转发消息到 OpenClaw Gateway
 * 3. 将 OpenClaw 的回复发送回 DingTalk
 */

import { createHmac } from "crypto";
import { createServer } from "http";
import { WebSocket } from "ws";

// ==================== 配置 ====================
const CONFIG = {
  // DingTalk 配置
  dingtalk: {
    webhookUrl:
      "https://oapi.dingtalk.com/robot/send?access_token=64dfa7fb63667b96f9428ea4f8bd880f158c063442fdcef0d0282878a97fd222",
    secret: "SEC2e8312faf00c7a9b10d674c4e12e09a46ed951033255f84b73ba2cbc8fc47590",
    outgoingToken: "your-outgoing-token", // 你在 DingTalk 中设置的 Token
  },

  // OpenClaw Gateway 配置
  gateway: {
    url: "ws://127.0.0.1:18789",
    token: "b047968c7cb4cf141a325536f5b0c393e490b3b6c60da314", // 从你的配置文件中获取
  },

  // Bridge 服务配置
  bridge: {
    port: 3000,
    path: "/dingtalk/webhook",
  },
};

// ==================== DingTalk 工具函数 ====================

// 生成签名
function generateSignature(secret) {
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(stringToSign);
  const sign = hmac.digest("base64");
  return { timestamp, sign };
}

// 发送消息到 DingTalk
async function sendToDingTalk(text) {
  const { timestamp, sign } = generateSignature(CONFIG.dingtalk.secret);

  const url = new URL(CONFIG.dingtalk.webhookUrl);
  url.searchParams.set("timestamp", timestamp.toString());
  url.searchParams.set("sign", sign);

  const message = {
    msgtype: "text",
    text: { content: text },
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  return await response.json();
}

// ==================== OpenClaw Gateway 连接 ====================

let gatewayWs = null;
let pendingMessages = new Map();

function connectToGateway() {
  console.log("🔌 连接到 OpenClaw Gateway...");

  gatewayWs = new WebSocket(CONFIG.gateway.url);

  gatewayWs.on("open", () => {
    console.log("✅ 已连接到 OpenClaw Gateway");

    // 发送认证
    gatewayWs.send(
      JSON.stringify({
        type: "auth",
        token: CONFIG.gateway.token,
      }),
    );
  });

  gatewayWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("📨 收到 Gateway 消息:", message);

      // 处理回复
      if (message.type === "reply" && message.text) {
        await sendToDingTalk(message.text);
        console.log("✅ 已发送回复到 DingTalk");
      }
    } catch (error) {
      console.error("❌ 处理 Gateway 消息失败:", error);
    }
  });

  gatewayWs.on("error", (error) => {
    console.error("❌ Gateway 连接错误:", error.message);
  });

  gatewayWs.on("close", () => {
    console.log("🔌 Gateway 连接已断开，5秒后重连...");
    setTimeout(connectToGateway, 5000);
  });
}

// ==================== HTTP 服务器（接收 DingTalk Webhook） ====================

const server = createServer(async (req, res) => {
  // 只处理 POST 请求到指定路径
  if (req.method !== "POST" || req.url !== CONFIG.bridge.path) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  // 读取请求体
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const payload = JSON.parse(body);
      console.log("📥 收到 DingTalk 消息:", payload);

      // 验证 Token
      if (payload.token !== CONFIG.dingtalk.outgoingToken) {
        console.error("❌ Token 验证失败");
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      // 提取消息内容
      const text = payload.text?.content || "";
      const senderNick = payload.senderNick || "未知用户";

      console.log(`💬 ${senderNick}: ${text}`);

      // 转发到 OpenClaw Gateway
      if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(
          JSON.stringify({
            type: "message",
            channel: "dingtalk",
            from: senderNick,
            text: text,
            conversationId: payload.conversationId,
          }),
        );

        console.log("✅ 已转发到 OpenClaw Gateway");
      } else {
        console.error("❌ Gateway 未连接");
      }

      // 返回成功响应
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          msgtype: "text",
          text: { content: "收到消息，处理中..." },
        }),
      );
    } catch (error) {
      console.error("❌ 处理请求失败:", error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

// ==================== 启动服务 ====================

server.listen(CONFIG.bridge.port, () => {
  console.log("🚀 DingTalk Bridge 服务已启动");
  console.log(`📍 监听端口: ${CONFIG.bridge.port}`);
  console.log(`📍 Webhook 路径: ${CONFIG.bridge.path}`);
  console.log(`📍 完整地址: http://localhost:${CONFIG.bridge.port}${CONFIG.bridge.path}`);
  console.log("");
  console.log("⚙️  配置说明:");
  console.log("1. 在 DingTalk 机器人设置中，将 POST 地址设置为:");
  console.log(`   http://你的公网地址:${CONFIG.bridge.port}${CONFIG.bridge.path}`);
  console.log("2. 使用 ngrok 或 Tailscale 暴露本地端口到公网");
  console.log("");

  // 连接到 Gateway
  connectToGateway();
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n👋 正在关闭服务...");
  if (gatewayWs) gatewayWs.close();
  server.close();
  process.exit(0);
});
