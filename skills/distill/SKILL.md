---
name: distill
description: NeuroSecond "Distill" phase - automated summarization, action extraction, connection finding, and weekly reviews for notes and progress files.
---

# Distill Skill - NeuroSecond Summarization

Automated intelligence extraction from your notes and progress files.

## Purpose

The "Distill" phase of NeuroSecond methodology requires:
1. **On-demand summarization** - Condense notes to key points
2. **Action item extraction** - Find TODOs, FIXMEs, next steps
3. **Connection finding** - Discover related notes across your knowledge base
4. **Weekly reviews** - Generate comprehensive digests

## Usage

### Summarize a Single File

```bash
~/skills/distill/summarize.sh ~/clawd/memory/work-notes.md
```

### Extract Action Items

```bash
~/skills/distill/extract-actions.sh ~/clawd/progress/
```

### Find Connections

```bash
~/skills/distill/find-connections.sh "topic keyword"
```

### Generate Weekly Review

```bash
~/skills/distill/weekly-review.sh
# Output: ~/clawd/distill/YYYY-MM-DD-weekly.md
```

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `summarize.sh` | Summarize a file | File path | Summary text |
| `extract-actions.sh` | Find action items | Dir path | Action list |
| `find-connections.sh` | Find related notes | Keyword | Related files |
| `weekly-review.sh` | Weekly digest | (auto) | Review file |

## Configuration

Summarization uses the local model via `llm-task`:

```bash
# Default model for summarization
MODEL="ollama/glm-4.7-flash"

# Directories to scan
MEMORY_DIR=~/clawd/memory
PROGRESS_DIR=~/clawd/progress
OUTPUT_DIR=~/clawd/distill
```

## Weekly Review Cron

Add to Liam's cron jobs (Sunday 8 PM):

```json
{
  "id": "weekly-distill",
  "schedule": "0 20 * * 0",
  "task": "~/skills/distill/weekly-review.sh",
  "description": "Generate weekly distill review"
}
```

## Output Format

### Summary Format

```markdown
# Summary: [filename]
Generated: YYYY-MM-DD HH:MM

## Key Points
- Point 1
- Point 2
- Point 3

## Action Items Found
- [ ] Action 1
- [ ] Action 2

## Connections
- Related to: file1.md (topic overlap)
- See also: file2.md (similar content)
```

### Weekly Review Format

```markdown
# Weekly Distill Review - Week of YYYY-MM-DD

## This Week's Notes
- 5 new memory files
- 3 progress files updated

## Key Themes
1. Theme A (mentioned 12 times)
2. Theme B (mentioned 8 times)

## Action Items (Open)
- [ ] From work-notes.md: Review proposal
- [ ] From project-x.txt: Deploy staging

## Connections Discovered
- work-notes.md ↔ project-x.txt (both mention "deadline")

## Suggested Focus
Based on frequency and recency, consider focusing on: Theme A
```

## Integration with Liam

Liam can invoke these scripts during:
- Heartbeats (check for new notes)
- User requests ("summarize my notes")
- Weekly cron jobs

## Dependencies

- `clawdbot` CLI for `llm-task`
- `sqlite3` for embedding search (optional)
- Local Ollama for fast summarization
