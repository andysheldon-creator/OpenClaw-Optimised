#!/bin/bash
# Clawdbot Discord Second Brain Hook
# SessionEnd: Save important insights to Discord (Knowledge Base)

# clawdbot のパス
CLAWDBOT_DIR="${CLAWDBOT_DIR:-$HOME/dev/clawdbot}"
CLAWDBOT_CLI="$CLAWDBOT_DIR/dist/entry.js"

# CLIが存在するか確認
[ ! -f "$CLAWDBOT_CLI" ] && exit 0

# Discord 設定
# セカンドブレイン用チャンネル（別途設定可能）
BRAIN_CHANNEL_ID="${DISCORD_BRAIN_CHANNEL:-1465087447225598207}"  # デフォルト: #general
DISCORD_ACCOUNT_ID="${DISCORD_NOTIFY_ACCOUNT:-ppal}"

# メモリ保存先
MEMORY_FILE="/tmp/clawdbot-brain-${USER}-$$.md"

# クリーンアップ用trap
trap "rm -f $MEMORY_FILE" EXIT INT TERM

# セッション情報収集
SESSION_DATE=$(date '+%Y-%m-%d')
SESSION_TIME=$(date '+%H:%M:%S')
SESSION_HOST=$(hostname -s 2>/dev/null || hostname | cut -d'.' -f1)
SESSION_PWD=$PWD

# Git 変更情報収集
GIT_INFO=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    GIT_CHANGED=$(git status --short 2>/dev/null)
    GIT_COMMIT=$(git log -1 --pretty=format:"%h - %s" 2>/dev/null || echo "no commit")

    if [ -n "$GIT_CHANGED" ]; then
        GIT_INFO="
## 📂 Git 変更
\`\`\`
$GIT_CHANGED
\`\`\`
**ブランチ**: $GIT_BRANCH
**最新コミット**: $GIT_COMMIT"
    fi
fi

# 作業内容推測（ディレクトリ名から）
PROJECT_NAME=$(basename "$SESSION_PWD")
WORK_CONTEXT=""

case "$PROJECT_NAME" in
    *clawdbot*)
        WORK_CONTEXT="🦞 Clawdbot 開発作業"
        ;;
    *miyabi*)
        WORK_CONTEXT="🎭 Miyabi エージェント作業"
        ;;
    *ppal*)
        WORK_CONTEXT="📚 PPAL コース作業"
        ;;
    gen-studio*)
        WORK_CONTEXT="🎨 Gen-Studio 開発"
        ;;
    *)
        WORK_CONTEXT="💻 $PROJECT_NAME 作業"
        ;;
esac

# メモリファイル作成
cat > "$MEMORY_FILE" << EOF
# 🧠 Claude Code Memory - $SESSION_DATE

## 📋 セッション情報
- **日時**: $SESSION_DATE $SESSION_TIME
- **ユーザー**: ${USER:-unknown}
- **ホスト**: $SESSION_HOST
- **プロジェクト**: $WORK_CONTEXT
- **パス**: \`$SESSION_PWD\`

---

## 💡 重要な発見・学習
<!-- このセッションで得た知見を記述 -->
- 追加あり次更新

---

## 🔧 技術的メモ
<!-- 技術的な詳細・設定変更など -->
- 追加あり次更新

---

## ⚠️ 問題・エラーと解決策
<!-- 遭遇した問題と解決方法 -->
- なし

---

## 🔗 関連リソース
<!-- 参考ドキュメント・Issueなど -->
- 追加あり次更新

---
$GIT_INFO

**タグ**: #clawcode #memory #${PROJECT_NAME//-/}
EOF

# Discord に送信（コードブロックとして整形）
BRAIN_MESSAGE="🧠 **セカンドブレインに保存**

\`\`\`markdown
$(cat "$MEMORY_FILE")
\`\`\`

---

💾 **記録完了**: ${SESSION_DATE} ${SESSION_TIME}"

# jq が利用可能かチェック
USE_JQ=0
if command -v jq >/dev/null 2>&1; then
    USE_JQ=1
fi

# Discord 送信
if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    if [ $USE_JQ -eq 1 ]; then
        JSON_CONTENT=$(echo "$BRAIN_MESSAGE" | jq -Rs .)
    else
        # フォールバック: 簡易エスケープ
        JSON_CONTENT=$(echo "$BRAIN_MESSAGE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
    fi
    (
        curl -s -X POST "$DISCORD_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"content\": $JSON_CONTENT}" \
            >/dev/null 2>&1
    ) &
elif [ -n "$DISCORD_ACCOUNT_ID" ]; then
    (
        # バイト数で判定（Discordの制限は2000バイト）
        MESSAGE_BYTES=$(printf "%s" "$BRAIN_MESSAGE" | wc -c | tr -d ' ')

        if [ "$MESSAGE_BYTES" -gt 1900 ]; then
            # 短縮版メッセージ
            node "$CLAWDBOT_CLI" message send \
                --channel discord \
                --account "$DISCORD_ACCOUNT_ID" \
                --target "$BRAIN_CHANNEL_ID" \
                --message "🧠 **セカンドブレインに保存**

セッションメモリが生成されました:
- 日時: ${SESSION_DATE} ${SESSION_TIME}
- プロジェクト: $WORK_CONTEXT
- サイズ: ${MESSAGE_BYTES}バイト

詳細はローカルファイルを確認してください。" \
                >/dev/null 2>&1
        else
            node "$CLAWDBOT_CLI" message send \
                --channel discord \
                --account "$DISCORD_ACCOUNT_ID" \
                --target "$BRAIN_CHANNEL_ID" \
                --message "$BRAIN_MESSAGE" \
                >/dev/null 2>&1
        fi
    ) &
fi

# ローカルにも保存（検索用）
MEMORY_DIR="$HOME/.clawdbot/memory"
mkdir -p "$MEMORY_DIR"
MEMORY_LOCAL="$MEMORY_DIR/${SESSION_DATE}-${USER}-$(date '+%H%M%S').md"
cp "$MEMORY_FILE" "$MEMORY_LOCAL"

exit 0
