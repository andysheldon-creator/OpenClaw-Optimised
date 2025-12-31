---
name: coding-supervisor
description: Monitor, supervise, and interact with AI coding sessions across Claude Code, OpenCode, Codex CLI, Gemini CLI, and Cursor.
metadata: {"clawdis":{"emoji":"👁️","always":true}}
---

# Coding Supervisor

Monitor, supervise, and **interact** with AI coding sessions across multiple tools.

## Capabilities

### Read-Only (Monitoring)
- "What coding sessions are active?"
- "What's happening in OpenCode?"
- "Summarize the Claude Code session in clawdis"
- "Are there any errors in my coding sessions?"

### Interactive (Session Control)
- "List my Claude Code sessions"
- "Continue session X"
- "Resume the clawdis session"
- "Pick up where I left off in OpenCode"

---

## Session Locations & CLI

| Tool | Session Data | List Command | Resume Command |
|------|-------------|--------------|----------------|
| **Claude Code** | `~/.claude/transcripts/ses_*.jsonl` | `claude -r ""` (picker) | `claude -r <session_id>` |
| **OpenCode** | Per-project DB | `opencode session list` | `opencode -s <session_id>` |
| **Codex CLI** | `~/.codex/sessions/` | `codex resume` (picker) | `codex resume --session <id>` |
| **Gemini CLI** | `~/.gemini/tmp/<hash>/` | `gemini --list-sessions` | N/A |
| **Cursor** | `~/Library/Application Support/Cursor/` | N/A (GUI) | N/A (GUI) |

---

## Interactive Session Workflow

When user wants to continue/resume a session, follow this **multi-step** process:

### Step 1: List Available Sessions

First, show the user what sessions exist. Run the appropriate list command:

#### Claude Code Sessions
```bash
# List recent sessions with details
for f in $(ls -t ~/.claude/transcripts/*.jsonl 2>/dev/null | head -10); do
  session_id=$(basename "$f" .jsonl)
  msg_count=$(wc -l < "$f" | tr -d ' ')
  last_mod=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f")
  # Get project path from first line if available
  project=$(head -1 "$f" 2>/dev/null | jq -r '.cwd // .workingDirectory // "unknown"' 2>/dev/null | xargs basename 2>/dev/null || echo "unknown")
  echo "$session_id | $project | $msg_count msgs | $last_mod"
done
```

#### OpenCode Sessions
```bash
opencode session list 2>/dev/null
```

#### Codex Sessions
```bash
# List with metadata
for f in $(ls -t ~/.codex/sessions/2025/*/*.json 2>/dev/null | head -10); do
  session_id=$(basename "$f" .json)
  last_mod=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f")
  echo "$session_id | $last_mod"
done
```

### Step 2: Present Sessions to User

Format the output as a numbered list:

```
Available Claude Code sessions:

1. ses_abc123 | clawdis | 45 msgs | 2025-12-30 23:15
2. ses_def456 | oracle | 120 msgs | 2025-12-30 22:00
3. ses_ghi789 | agent-scripts | 23 msgs | 2025-12-30 18:30

Which session would you like to continue? (number or session ID)
```

### Step 3: Execute Resume Command

Once user identifies the session (by number, ID, or project name):

#### Claude Code
```bash
# Resume specific session
claude -r ses_abc123

# Or open picker with search term
claude -r "clawdis"

# Continue most recent
claude -c
```

#### OpenCode
```bash
# Resume specific session
opencode -s <session_id>

# Continue most recent
opencode -c
```

#### Codex
```bash
# Resume specific session
codex resume --session <session_id>

# Continue most recent
codex resume --last

# Open picker
codex resume
```

---

## Monitoring Commands

### 1. Check Running Processes
```bash
pgrep -lf "claude|opencode|codex|gemini|Cursor" 2>/dev/null
```

### 2. List Claude Code Sessions (recent)
```bash
ls -lt ~/.claude/transcripts/*.jsonl 2>/dev/null | head -10
```

### 3. Read Claude Code Session (last N lines of most recent)
```bash
# Get most recent session
LATEST=$(ls -t ~/.claude/transcripts/*.jsonl 2>/dev/null | head -1)
# Read last 50 lines (recent activity)
tail -50 "$LATEST" | jq -r 'select(.type) | "\(.type): \(.message // .content // .summary // empty)"' 2>/dev/null
```

### 4. List OpenCode Sessions
```bash
opencode session list 2>/dev/null
```

### 5. List Codex Sessions
```bash
ls -lt ~/.codex/sessions/2025/*/*.json 2>/dev/null | head -10
```

### 6. List Gemini Sessions (per-project)
```bash
ls -lt ~/.gemini/tmp/*/session*.json 2>/dev/null | head -10
```

### 7. Check for Errors in Recent Sessions
```bash
# Claude Code errors
grep -l "error\|Error\|ERROR\|failed\|Failed" ~/.claude/transcripts/*.jsonl 2>/dev/null | head -5

# Look for tool failures or API errors in recent session
LATEST=$(ls -t ~/.claude/transcripts/*.jsonl 2>/dev/null | head -1)
grep -i "error\|failed\|exception" "$LATEST" | tail -10
```

### 8. Get Session Summary
```bash
LATEST=$(ls -t ~/.claude/transcripts/*.jsonl 2>/dev/null | head -1)
# Count messages
wc -l "$LATEST"
# Get project path from filename or content
basename "$LATEST"
# Get last user message
grep '"role":"user"' "$LATEST" | tail -1 | jq -r '.content' 2>/dev/null
# Get last assistant message
grep '"role":"assistant"' "$LATEST" | tail -1 | jq -r '.content[:200]' 2>/dev/null
```

---

## Query Workflows

### "What sessions are active?"
1. Run `pgrep` to find running processes
2. List recent sessions from each tool
3. Report which tools have active/recent sessions

### "What's happening in [tool]?"
1. Find the most recent session for that tool
2. Read the last 20-50 messages
3. Summarize: current task, recent actions, any issues

### "Any errors?"
1. Grep all recent sessions for error patterns
2. Check for stalled sessions (no recent activity)
3. Report findings with session IDs

### "Summarize [project] session"
1. Find session by project name/path
2. Extract: start time, message count, last activity
3. Summarize: what was being worked on, current status

### "Continue/resume [session]"
1. **List sessions** for the specified tool (or all if not specified)
2. **Present numbered list** with project, message count, last modified
3. **Wait for user selection** (number, ID, or project name)
4. **Execute resume command** with the selected session

### "Pick up where I left off"
1. Check which tools have recent sessions
2. Show most recent session per tool
3. User picks tool + session
4. Execute resume

---

## Session File Formats

### Claude Code (JSONL)
Each line is a JSON object with fields like:
- `type`: "user", "assistant", "tool_use", "tool_result"
- `content`: message content
- `timestamp`: ISO timestamp
- `tool_name`: for tool calls
- `cwd` or `workingDirectory`: project path

### OpenCode
Uses SQLite database, query via `opencode session list`

### Codex CLI
JSON files in `~/.codex/sessions/YYYY/MM/`

### Gemini CLI
JSON session files in project-specific temp directories

---

## Supervisor Alerts

Watch for these patterns to alert user:
- **Error**: grep for "error", "Error", "failed", "exception"
- **Stalled**: No new lines in session file for 10+ minutes while process running
- **Approval needed**: grep for "approve", "confirm", "permission", "accept"
- **Completed**: grep for "complete", "done", "finished", "success"

---

## Example Interactions

### Monitoring

**User**: "What coding sessions do I have running?"
**Action**: Run pgrep, list recent sessions, summarize status

**User**: "What's Claude Code doing in the clawdis project?"
**Action**: Find session with "clawdis" in path, read recent messages, summarize

**User**: "Are there any errors in my sessions?"
**Action**: Grep all recent sessions for errors, report findings

**User**: "Give me a status update on all coding agents"
**Action**: Check each tool, summarize activity, flag issues

### Interactive

**User**: "List my Claude Code sessions"
**Action**:
1. Run session listing command
2. Format as numbered list with project/msgs/date
3. Present to user

**User**: "Continue session 2" (after listing)
**Action**: `claude -r ses_def456`

**User**: "Resume the clawdis session"
**Action**:
1. Search sessions for "clawdis" in project path
2. If one match: `claude -r <session_id>`
3. If multiple: show matches, ask user to pick

**User**: "Pick up where I left off in OpenCode"
**Action**:
1. Run `opencode session list`
2. Show most recent or ask if multiple
3. Execute `opencode -c` or `opencode -s <id>`

**User**: "Continue my most recent coding session"
**Action**:
1. Find most recent session across all tools
2. Identify tool and session ID
3. Execute appropriate resume command
