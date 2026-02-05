#!/usr/bin/env node
/**
 * DingTalk 集成测试脚本
 * 使用方法：node test-dingtalk.mjs <webhook-url> <secret>
 */

import { createHmac } from "crypto";

const [webhookUrl, secret] = process.argv.slice(2);

if (!webhookUrl || !secret) {
  console.error("使用方法: node test-dingtalk.mjs <webhook-url> <secret>");
  console.error("");
  console.error("示例:");
  console.error("  node test-dingtalk.mjs \\");
  console.error('    "https://oapi.dingtalk.com/robot/send?access_token=xxx" \\');
  console.error('    "SECxxx"');
  process.exit(1);
}

// 生成签名
function generateSignature(secret) {
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(stringToSign);
  const sign = hmac.digest("base64");
  return { timestamp, sign };
}

// 发送测试消息
async function testDingTalk() {
  try {
    const { timestamp, sign } = generateSignature(secret);

    // 构建完整 URL
    const url = new URL(webhookUrl);
    url.searchParams.set("timestamp", timestamp.toString());
    url.searchParams.set("sign", sign);

    // 发送消息
    const message = {
      msgtype: "text",
      text: {
        content: "🦞 OpenClaw DingTalk 集成测试\n\n测试时间: " + new Date().toLocaleString("zh-CN"),
      },
    };

    console.log("📤 发送测试消息到 DingTalk...");
    console.log("Webhook URL:", webhookUrl.substring(0, 50) + "...");

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.errcode === 0) {
      console.log("✅ 测试成功！");
      console.log("消息已发送到 DingTalk 群组");
      console.log("响应:", result);
    } else {
      console.error("❌ 测试失败");
      console.error("错误代码:", result.errcode);
      console.error("错误信息:", result.errmsg);
    }
  } catch (error) {
    console.error("❌ 测试失败");
    console.error("错误:", error.message);
  }
}

testDingTalk();
