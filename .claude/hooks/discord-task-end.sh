#!/bin/bash
# Clawdbot Discord Task End Notification Hook
# SessionEnd: Report task completion

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

# タスク情報ファイルを読み込み
TASK_INFO_FILE="/tmp/clawdbot-task-info-${USER}-${SESSION_ID}.txt"
TASK_START_TIME="不明"

if [ -f "$TASK_INFO_FILE" ]; then
    source "$TASK_INFO_FILE"
    rm -f "$TASK_INFO_FILE"
fi

# 経過時間計算（GNU/BSD date両対応）
if [ -n "$TASK_START_TIME" ] && [ "$TASK_START_TIME" != "不明" ]; then
    # dateコマンドの種類を検出
    if date --version >/dev/null 2>&1; then
        # GNU date (Linux)
        START_SEC=$(date -d "$TASK_START_TIME" "+%s" 2>/dev/null || echo "0")
    else
        # BSD date (macOS)
        START_SEC=$(date -j -f "%Y-%m-%d %H:%M:%S" "$TASK_START_TIME" "+%s" 2>/dev/null || echo "0")
    fi

    END_SEC=$(date "+%s")
    ELAPSED=$((END_SEC - START_SEC))

    if [ $ELAPSED -gt 0 ]; then
        if [ $ELAPSED -ge 3600 ]; then
            DURATION="$((ELAPSED / 3600))時間$((ELAPSED % 3600 / 60))分"
        elif [ $ELAPSED -ge 60 ]; then
            DURATION="$((ELAPSED / 60))分$((ELAPSED % 60))秒"
        else
            DURATION="${ELAPSED}秒"
        fi
    else
        DURATION="計測不可"
    fi
else
    DURATION="不明"
fi

# Git 変更サマリー（gitリポジトリの場合）
GIT_SUMMARY=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    CHANGED_FILES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
    GIT_SUMMARY="
📂 Git: $BRANCH (${CHANGED_FILES}ファイル変更)"
fi

# セッション終了メッセージ
END_MESSAGE="✅ **Claude Code セッション完了**

📅 開始時刻: $TASK_START_TIME
📅 完了時刻: $(date '+%Y-%m-%d %H:%M:%S')
⏱️ 経過時間: ${DURATION}
👤 ユーザー: ${USER:-unknown}
🖥️ ホスト: $(hostname -s 2>/dev/null || hostname | cut -d'.' -f1)${GIT_SUMMARY}

✨ 作業完了"

# Discord 送信
if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    (
        curl -s -X POST "$DISCORD_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"$END_MESSAGE\"}" \
            >/dev/null 2>&1
    ) &
elif [ -n "$DISCORD_ACCOUNT_ID" ]; then
    (
        node "$CLAWDBOT_CLI" message send \
            --channel discord \
            --account "$DISCORD_ACCOUNT_ID" \
            --target "$DISCORD_CHANNEL_ID" \
            --message "$END_MESSAGE" \
            >/dev/null 2>&1
    ) &
fi

exit 0
