#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [--branch BRANCH] [--title TITLE] [--body BODY] [--base BASE]

Automatically fork the origin repo (if needed), add a 'fork' remote, push the branch,
and create a PR using gh.

Options:
  --branch BRANCH   Branch to push (default: current branch)
  --title TITLE     PR title
  --body BODY       PR body (use quotes)
  --base BASE       PR base branch (default: main)
  --help            Show this help

Example:
  scripts/create-fork-pr.sh --branch docs/trip-planner-quickref \
    --title "Docs: Trip Planner quick reference" \
    --body "Adds QUICK-REFERENCE.md and CI check." --base main
EOF
}

BRANCH=""
TITLE=""
BODY=""
BASE=main

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2;;
    --title) TITLE="$2"; shift 2;;
    --body) BODY="$2"; shift 2;;
    --base) BASE="$2"; shift 2;;
    --help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install and authenticate first: https://cli.github.com/" >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is required." >&2
  exit 1
fi

if [ -z "$BRANCH" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi

echo "Using branch: $BRANCH"

# Ensure branch exists locally
if ! git show-ref --verify --quiet refs/heads/$BRANCH; then
  echo "Branch '$BRANCH' does not exist locally. Create or switch to it first." >&2
  exit 1
fi

echo "Checking gh auth..."
if ! gh auth status >/dev/null 2>&1; then
  echo "Not authenticated with gh. Run 'gh auth login' first." >&2
  exit 1
fi

ORIGIN_URL=$(git remote get-url origin)
OWNER_REPO=$(echo "$ORIGIN_URL" | sed -E 's#.*[:/](.+/.+?)(\.git)?$#\1#')
REPO_NAME=$(echo "$OWNER_REPO" | cut -d'/' -f2)
USER_LOGIN=$(gh api user --jq .login)

echo "Origin repo: $OWNER_REPO"
echo "Your GitHub user: $USER_LOGIN"

echo "Attempting to fork repository (if not already forked)..."
# Try to fork and add a remote; gh will error if fork exists but it's fine
gh repo fork "$OWNER_REPO" --remote=true --org "$USER_LOGIN" 2>/dev/null || true

# Ensure a remote named 'fork' exists and points to user's fork
if git remote get-url fork >/dev/null 2>&1; then
  echo "Remote 'fork' already exists: $(git remote get-url fork)"
else
  FORK_URL="https://github.com/${USER_LOGIN}/${REPO_NAME}.git"
  git remote add fork "$FORK_URL"
  echo "Added remote 'fork' -> $FORK_URL"
fi

echo "Pushing branch to fork..."
git push -u fork "$BRANCH"

if [ -z "$TITLE" ]; then
  TITLE="Docs: Trip Planner quick reference"
fi
if [ -z "$BODY" ]; then
  BODY="Add QUICK-REFERENCE.md, update README/docs index, add CI check, and expand .env.example. See docs/trip-planner/QUICK-REFERENCE.md for usage."
fi

echo "Creating PR: $TITLE"
gh pr create --title "$TITLE" --body "$BODY" --base "$BASE" --head "${USER_LOGIN}:${BRANCH}"

echo "Done. PR created (or updated)."
