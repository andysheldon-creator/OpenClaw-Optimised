#!/usr/bin/env node
/**
 * List Discord Channels
 * サーバー内の全チャンネルを一覧表示
 */

import { listGuildChannelsDiscord } from "../src/discord/send.guild.js";
import { loadConfig } from "../src/config/config.js";
import { resolveDiscordAccount } from "../src/discord/accounts.js";
import { createDiscordClient } from "../src/discord/send.shared.js";

async function main() {
  const GUILD_ID = "1260121338811514880"; // PPAL Server

  const cfg = loadConfig();
  const accountInfo = resolveDiscordAccount({ cfg, accountId: "ppal" });
  const { token } = createDiscordClient({}, cfg);

  console.log(`\n📋 Discord Server: ${GUILD_ID}`);
  console.log(`🤖 Bot: ${accountInfo.accountId} (${accountInfo.config.name || "PPAL Bot"})\n`);

  try {
    const channels = await listGuildChannelsDiscord(GUILD_ID, { token });

    console.log("📺 チャンネル一覧:\n");
    console.log("".padEnd(25), "タイプ".padEnd(15), "ID");
    console.log("=".repeat(70));

    for (const channel of channels) {
      const type =
        channel.type === 0 ? "テキスト" :
        channel.type === 2 ? "音声" :
        channel.type === 4 ? "カテゴリ" :
        channel.type === 5 ? " announcements" :
        channel.type === 15 ? "forum" : `type_${channel.type}`;

      const indent = channel.type === 4 ? "" : "  ";

      console.log(
        `${indent}${(channel.name || "").padEnd(25)} ` +
        `${type.padEnd(15)} ` +
        `${channel.id}`
      );
    }

    console.log("\n");

    // テキストチャンネルのみ抽出
    const textChannels = channels.filter(ch => ch.type === 0);
    console.log(`\n📝 テキストチャンネル (${textChannels.length}件):\n`);
    textChannels.forEach(ch => {
      console.log(`  #${ch.name} → ID: ${ch.id}`);
    });

    console.log("\n✅ おすすめの通知チャンネル:\n");
    const generalChannel = textChannels.find(ch =>
      ch.name.toLowerCase().includes("general") ||
      ch.name.toLowerCase().includes("通知") ||
      ch.name.toLowerCase().includes("notify")
    );

    if (generalChannel) {
      console.log(`  👉 #${generalChannel.name} (ID: ${generalChannel.id})`);
    } else if (textChannels.length > 0) {
      console.log(`  👉 #${textChannels[0].name} (ID: ${textChannels[0].id})`);
    }

    console.log("");

  } catch (error: any) {
    console.error("❌ エラー:", error.message);
    process.exit(1);
  }
}

main();
