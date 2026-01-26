# Clawdbot セッション終了通知

## 設定完了

✅ **セッション終了時のみ Discord 通知** が設定されました

### 通知内容

```
🤖 Claude Code セッション終了

📅 日時: 2026-01-26 10:30:00
👤 ユーザー: shunsukehayashi
🖥️ ホスト: Mac-mini

✅ 作業完了
```

### 設定値

| 項目 | 値 |
|------|-----|
| 通知チャンネル | **#status** |
| チャンネル ID | `1465087451113722019` |
| 通知タイミング | セッション終了時（1回のみ） |

### チャンネル変更

通知先を変更する場合:

```bash
cd ~/dev/clawdbot

# #general に変更
echo 'DISCORD_NOTIFY_CHANNEL=1465087447225598207' >> .env

# #task-queue に変更
echo 'DISCORD_NOTIFY_CHANNEL=1465087503622209757' >> .env
```

### テスト

セッションを終了して通知を確認してください。
