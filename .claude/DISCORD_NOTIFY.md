# Clawdbot Discord 通知設定

## 概要

Clawdbot の Discord コネクションを使用して、Claude Code の操作完了時に Discord 通知を送信します。

## 設定手順

### 1. Discord チャンネル ID を取得

通知を送信したい Discord チャンネルの ID を取得します：

1. Discord の設定 → 詳細設定 → 開発者モード をオン
2. チャンネルを右クリック → ID をコピー
3. チャンネル ID: `123456789012345678` のような形式

### 2. .env に設定

```bash
cd ~/dev/clawdbot
echo "DISCORD_NOTIFY_CHANNEL=123456789012345678" >> .env
```

### 3. Clawdbot Discord 接続を設定

```bash
# Discord アカウント連携
clawdbot login --channel discord

# 接続確認
clawdbot channels status --probe
```

### 4. 動作確認

```bash
# テスト通知
clawdbot message send \
  --channel discord \
  --target "123456789012345678" \
  --message "🤖 テスト通知"
```

## 通知タイミング

| タイミング | 内容 |
|-----------|------|
| PostToolUse | 操作完了時に Discord 通知を送信 |

## 環境変数

| 変数 | 説明 | 例 |
|------|------|-----|
| `DISCORD_NOTIFY_CHANNEL` | 通知先 Discord チャンネル ID | `123456789012345678` |
| `CLAWDBOT_DIR` | clawdbot のパス（任意） | `$HOME/dev/clawdbot` |

## ファイル構成

```
.claude/
├── hooks/
│   └── discord-notify-clawdbot.sh  # Discord 通知スクリプト
├── settings.json                   # Claude Code フック設定
└── DISCORD_NOTIFY.md               # このドキュメント
```

## トラブルシューティング

### 通知が届かない場合

1. Discord 接続状態確認:
   ```bash
   clawdbot channels status
   ```

2. チャンネル ID 確認:
   ```bash
   grep DISCORD_NOTIFY_CHANNEL .env
   ```

3. 手動テスト:
   ```bash
   .claude/hooks/discord-notify-clawdbot.sh << EOF
{"content": "テスト通知"}
EOF
   ```

### CLI がビルドされていない場合

```bash
cd ~/dev/clawdbot
pnpm build
```
