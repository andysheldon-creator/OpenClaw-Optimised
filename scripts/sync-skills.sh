#!/bin/bash
# Sync skills from workspace to git repo and push

WORKSPACE="/Users/dbhurley/clawd/skills"
GIT_REPO="/Users/dbhurley/Git/clawd"

cd "$GIT_REPO"

# Sync all skills from workspace
for skill in "$WORKSPACE"/*/; do
    name=$(basename "$skill")
    cp -r "$skill" skills/
done

# Check if there are changes
if git diff --quiet skills/ && git diff --cached --quiet skills/; then
    echo "No skill changes to commit"
    exit 0
fi

# Add, commit, push
git add skills/
git commit -m "Sync skills from workspace - $(date '+%Y-%m-%d %H:%M')"
git push personal main

echo "Skills synced and pushed!"
