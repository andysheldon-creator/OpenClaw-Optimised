#!/usr/bin/env bash
set -euo pipefail

# Summarize a single file using local model
# Usage: ./summarize.sh <file_path>

FILE="${1:-}"

if [[ -z "$FILE" ]]; then
    echo "Usage: $0 <file_path>"
    exit 1
fi

if [[ ! -f "$FILE" ]]; then
    echo "Error: File not found: $FILE"
    exit 1
fi

# Get file content (limit to first 10000 chars for model context)
CONTENT=$(head -c 10000 "$FILE")
FILENAME=$(basename "$FILE")

# Create prompt
PROMPT="Summarize this document in 3-5 bullet points. Focus on key information, decisions, and action items.

Document: $FILENAME

Content:
$CONTENT

Summary:"

# Use llm-task via clawdbot for local model summarization
if command -v clawdbot &>/dev/null; then
    clawdbot llm-task --model flash --prompt "$PROMPT"
else
    # Fallback to pnpm if clawdbot not in PATH
    cd /home/liam && pnpm clawdbot llm-task --model flash --prompt "$PROMPT"
fi
