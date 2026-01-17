#!/bin/bash
# Sync clawd workspace: pull upstream + merge + push changes
# No longer syncs to ~/.clawd - everything lives in ~/clawd

cd /Users/steve/clawd

UPSTREAM_CHANGES=0
LOCAL_CHANGES=0

# 1. Pull latest from upstream clawdbot
echo "Fetching upstream..."
git fetch upstream 2>/dev/null

UPSTREAM_COUNT=$(git log HEAD..upstream/main --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$UPSTREAM_COUNT" -gt 0 ]; then
    echo "Merging $UPSTREAM_COUNT upstream changes..."
    UPSTREAM_CHANGES=1
    git merge upstream/main -m "Auto-merge upstream clawdbot" --no-edit || {
        # Keep LOCAL versions for personalized workspace files
        git checkout --ours .gitignore AGENTS.md SOUL.md USER.md IDENTITY.md TOOLS.md memory.md memory/ personal-scripts/ 2>/dev/null
        # Take UPSTREAM versions for skills (we want upstream improvements)
        git checkout --theirs skills/ 2>/dev/null
        # Take UPSTREAM for project docs
        git checkout --theirs CHANGELOG.md README.md 2>/dev/null
        git add -A
        git commit -m "Auto-merge upstream (kept workspace files, took upstream skills/docs)" --no-edit
    }
fi

# 2. Commit any local changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Committing local changes..."
    LOCAL_CHANGES=1
    git add -A
    git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M')"
fi

# 3. Push everything
if [ "$UPSTREAM_CHANGES" -eq 1 ] || [ "$LOCAL_CHANGES" -eq 1 ]; then
    echo "Pushing to origin..."
    git push origin main
fi

# 4. Output for notification (only if changes)
if [ "$UPSTREAM_CHANGES" -eq 1 ]; then
    echo "🔄 Synced $UPSTREAM_COUNT commits from upstream"
elif [ "$LOCAL_CHANGES" -eq 1 ]; then
    echo "✅ Pushed local changes"
fi

# If nothing happened, output nothing (silent ack)
