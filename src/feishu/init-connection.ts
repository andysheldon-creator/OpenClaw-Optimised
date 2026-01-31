/**
 * Feishu 长连接初始化脚本
 * 用于让飞书开放平台检测到长连接，以便保存配置
 *
 * 运行: npx tsx src/feishu/init-connection.ts
 */

import * as lark from "@larksuiteoapi/node-sdk";

const APP_ID = "cli_a9f608f133781bcc";
const APP_SECRET = "Dta7m0KJVrsXXFKW51OOTd6px1elOk7f";

async function initConnection() {
  console.log("🔌 初始化飞书长连接...\n");
  console.log("   保持此脚本运行，然后去飞书开发者后台保存配置\n");

  // 创建一个空的事件分发器
  const eventDispatcher = new lark.EventDispatcher({});

  // 创建 WebSocket 客户端
  const wsClient = new lark.WSClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    loggerLevel: lark.LoggerLevel.info,
  });

  try {
    console.log("   正在连接到飞书服务器...");
    await wsClient.start({
      eventDispatcher,
    });
    console.log("\n✅ 长连接已建立！\n");
    console.log("📋 现在请按照以下步骤操作：");
    console.log("   1. 回到飞书开发者后台");
    console.log("   2. 点击「保存」按钮");
    console.log("   3. 添加事件订阅 im.message.receive_v1");
    console.log("   4. 再次保存");
    console.log("\n   完成后按 Ctrl+C 退出此脚本\n");

    // 保持连接
    await new Promise(() => {});
  } catch (error: unknown) {
    const err = error as Error & { code?: number; msg?: string };
    console.error("\n❌ 连接失败:", err.message || err);

    if (err.message?.includes("persistent connection")) {
      console.log("\n💡 提示：长连接模式仅支持企业自建应用");
      console.log("   请确保你的应用类型是「企业自建应用」");
    }
  }
}

void initConnection();
