#!/bin/bash
# Clawdbot Discord Task Start Notification Hook
# SessionStart: Declare task start

# clawdbot のパス
CLAWDBOT_DIR="${CLAWDBOT_DIR:-$HOME/dev/clawdbot}"
CLAWDBOT_CLI="$CLAWDBOT_DIR/dist/entry.js"

# CLIが存在するか確認
[ ! -f "$CLAWDBOT_CLI" ] && exit 0

# Discord 設定
DISCORD_CHANNEL_ID="${DISCORD_NOTIFY_CHANNEL:-1465087451113722019}"  # #status
DISCORD_ACCOUNT_ID="${DISCORD_NOTIFY_ACCOUNT:-ppal}"

# セッションID（PPIDを使用してサブシェルでも一貫性を確保）
SESSION_ID="${CLAUDE_SESSION_ID:-${PPID:-$$}}"

# タスク情報保存先
TASK_INFO_FILE="/tmp/clawdbot-task-info-${USER}-${SESSION_ID}.txt"

# クリーンアップ用trap
trap "rm -f $TASK_INFO_FILE" EXIT INT TERM

# タスク開始情報を保存
cat > "$TASK_INFO_FILE" << EOF
TASK_START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
TASK_USER=${USER:-unknown}
TASK_HOST=$(hostname)
TASK_PWD=$PWD
TASK_SESSION_ID=${SESSION_ID}
EOF

# セッション開始メッセージ
START_MESSAGE="🚀 **Claude Code セッション開始**

📅 開始時刻: $(date '+%Y-%m-%d %H:%M:%S')
👤 ユーザー: ${USER:-unknown}
🖥️ ホスト: $(hostname -s 2>/dev/null || hostname | cut -d'.' -f1)
📁 ワークディレクトリ: $PWD
🆔 セッションID: ${SESSION_ID}

⏳ 作業開始..."

# Discord 送信
if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    (
        curl -s -X POST "$DISCORD_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"$START_MESSAGE\"}" \
            >/dev/null 2>&1
    ) &
elif [ -n "$DISCORD_ACCOUNT_ID" ]; then
    (
        node "$CLAWDBOT_CLI" message send \
            --channel discord \
            --account "$DISCORD_ACCOUNT_ID" \
            --target "$DISCORD_CHANNEL_ID" \
            --message "$START_MESSAGE" \
            >/dev/null 2>&1
    ) &
fi

exit 0
