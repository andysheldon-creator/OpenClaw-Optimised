# DJ Notion Database Schema

This document defines the Notion database schemas for the DJ assistant profile. These databases provide the data backbone for tasks, projects, and workflow management.

## Overview

| Database | Purpose | Key Properties |
|----------|---------|----------------|
| Tasks | Daily todos, quick captures | Name, Status, Due, Priority, Source |
| Projects | Multi-step initiatives | Name, Status, Start, End, Area |
| Meetings Prep | Briefing docs for meetings | Name, Date, Attendees, Agenda |
| Podcast Pipeline | Episode planning & production | Name, Guest, Status, Record Date |
| Episode Pipeline | M5 episode tracking (transcript-to-publish) | Name, Status, TranscriptHash |
| Podcast Assets | M5 generated artifacts cache | Name, EpisodeId, CacheKey |
| Research Radar | Industry tracking, ideas | Name, Type, Source, Tags |
| Work Notes | Work-safe mode captures only | Name, Created, Content |
| RLM Sessions | M6 RLM iteration tracking | Name, Task, Status, IterationCount |
| Improve Plans | M6 improvement plan tracking | Name, Status, OpportunityCount, PRUrl |

## Database Schemas

### 1. Tasks

Primary task management database for day-to-day items.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Task title |
| Status | Select | Inbox, Next, In Progress, Waiting, Done |
| Due | Date | Due date (optional time) |
| Priority | Select | 🔴 High, 🟡 Medium, 🟢 Low |
| Source | Select | Manual, Voice Capture, Email, Meeting |
| Estimate | Number | Minutes (for time blocking) |
| Project | Relation | → Projects database |
| Scheduled | Checkbox | True if time-blocked on calendar |
| Notes | Rich text | Additional details |

**Views to create:**
- Inbox (Status = Inbox)
- Today (Due = Today, Status ≠ Done)
- This Week (Due this week, Status ≠ Done)
- By Project (grouped by Project relation)

### 2. Projects

Multi-step initiatives and ongoing work areas.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Project name |
| Status | Select | Planning, Active, On Hold, Complete, Archived |
| Area | Select | Music Production, Gigs, Business, Content, Personal |
| Start | Date | Project start date |
| End | Date | Target completion |
| Description | Rich text | Project overview |
| Tasks | Relation | → Tasks database (linked) |
| Priority | Select | 🔴 High, 🟡 Medium, 🟢 Low |

**Views to create:**
- Active Projects (Status = Active)
- By Area (grouped by Area)
- Timeline (calendar view by Start/End)

### 3. Meetings Prep

Briefing documents and notes for meetings.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Meeting title |
| Date | Date | Meeting date/time |
| Type | Select | Call, Video, In Person, Event |
| Attendees | Multi-select | Key people |
| Company | Select | Label, Agency, Venue, Press, etc. |
| Agenda | Rich text | Topics to cover |
| Prep Notes | Rich text | Background research |
| Action Items | Rich text | Post-meeting todos |
| Calendar Link | URL | Link to calendar event |

**Views to create:**
- Upcoming (Date ≥ Today, sorted by Date)
- By Company (grouped by Company)
- Past Meetings (Date < Today)

### 4. Podcast Pipeline

Episode planning and production tracking.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Episode title/number |
| Guest | Rich text | Guest name(s) |
| Status | Select | Idea, Researching, Scheduled, Recorded, Editing, Published |
| Record Date | Date | Recording date |
| Publish Date | Date | Target publish date |
| Topics | Multi-select | Episode topics |
| Guest Research | Rich text | Background on guest |
| Questions | Rich text | Interview questions |
| Show Notes | Rich text | Episode description |
| Links | URL | Published episode URL |

**Views to create:**
- Pipeline (Status ≠ Published, sorted by Record Date)
- Ideas (Status = Idea)
- Published (Status = Published)

### 5. Episode Pipeline (M5)

M5 Podcast Engine episode tracking from transcript ingestion to publication.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Episode ID (E001, E002, etc.) |
| Title | Rich text | Episode title |
| Status | Select | Ingested, Pack Pending, Pack Partial, Pack Complete, Draft Ready, Published |
| TranscriptHash | Rich text | SHA256 hash (16 chars) for cache key |
| SourceType | Select | file, url, notion, clipboard |
| SourcePath | Rich text | Original source path/URL |
| SquarespaceDraftId | Rich text | Squarespace draft ID if created |
| PublishedUrl | URL | Live URL when published |
| PublishedAt | Date | Publication timestamp |
| CreatedAt | Date | When episode was ingested |
| UpdatedAt | Date | Last modification |
| LastError | Rich text | Error message if any |

**Views to create:**
- Pipeline (Status ≠ Published, sorted by CreatedAt desc)
- Ready for Pack (Status = Ingested)
- Ready for Draft (Status = Pack Complete)
- Published (Status = Published)

### 6. Podcast Assets (M5)

M5 Podcast Engine generated artifacts cache (titles, show notes, chapters, etc.).

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | E001-titles (episode-artifact format) |
| EpisodeId | Rich text | Episode ID (E001) |
| TranscriptHash | Rich text | Source transcript hash |
| ArtifactType | Select | titles, show_notes, chapters, quotes, clip_plan, guest_followup, full_pack |
| Content | Rich text | JSON content (truncated to 2000 chars) |
| CacheKey | Rich text | Transcript hash for deduplication |
| Version | Number | Artifact version (increments on regeneration) |
| Profile | Select | cheap, normal, deep |
| GeneratedAt | Date | When artifact was generated |

**Views to create:**
- By Episode (grouped by EpisodeId)
- Full Packs (ArtifactType = full_pack)
- Recent (sorted by GeneratedAt desc)

### 7. Research Radar

Industry tracking, artist discovery, and idea capture.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Item title |
| Type | Select | Artist, Track, Gear, Trend, Idea, Article |
| Source | Rich text | Where you found it |
| Tags | Multi-select | Genre tags, context |
| Notes | Rich text | Your thoughts |
| URL | URL | Link to source |
| Date Added | Date | When captured |
| Follow Up | Checkbox | Needs action |

**Views to create:**
- Recent (sorted by Date Added desc)
- Artists to Watch (Type = Artist)
- Ideas (Type = Idea)
- Follow Up (Follow Up = true)

### 8. Work Notes (WorkSafe Mode)

Separate database for work-safe captures only.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Note title |
| Created | Date | Auto-set to creation date |
| Content | Rich text | Note content |
| Tags | Multi-select | Generic tags |

### 9. RLM Sessions (M6)

Tracks Recursive Language Model sessions for audit and analysis.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Session ID (rlm-xxxx) |
| Task | Rich text | Original task description |
| Status | Select | running, completed, stopped, error |
| IterationCount | Number | Total iterations executed |
| MaxDepth | Number | Configured max depth |
| MaxSubagents | Number | Configured max subagents |
| TotalTokens | Number | Total tokens used |
| TotalToolCalls | Number | Total tool calls |
| FinalOutput | Rich text | Final result (truncated to 2000 chars) |
| StopReason | Rich text | Why session stopped |
| StartedAt | Date | When session started |
| CompletedAt | Date | When session ended |

**Views to create:**
- Active (Status = running)
- Recent (sorted by StartedAt desc)
- By Status (grouped by Status)
- High Usage (sorted by TotalTokens desc)

### 10. Improve Plans (M6)

Tracks codebase improvement plans and their PR status.

**Properties:**

| Property | Type | Options/Notes |
|----------|------|---------------|
| Name | Title | Plan ID (imp-xxxx) |
| Status | Select | draft, approved, executing, pr-created, merged, rejected |
| OpportunityCount | Number | Number of opportunities in plan |
| EstimatedLines | Number | Estimated lines changed |
| PRUrl | URL | GitHub PR link (if created) |
| PRNumber | Number | GitHub PR number |
| Scope | Multi-select | Paths in scope |
| CreatedAt | Date | When plan was created |
| ApprovedAt | Date | When plan was approved |
| MergedAt | Date | When PR was merged |
| LastError | Rich text | Most recent error (if any) |

**Views to create:**
- Pending (Status = draft)
- In Progress (Status in [approved, executing, pr-created])
- Completed (Status = merged)
- Rejected (Status = rejected)

**Status Transitions:**
```
draft → approved → executing → pr-created → merged
         ↓           ↓            ↓
      rejected    rejected     rejected
```

---

## Database Creation

### Option 1: Manual Setup

1. Create a new page in Notion as the DJ workspace root
2. Create each database as a sub-page with inline database
3. Add properties according to schemas above
4. Share each database with your Notion integration

### Option 2: API Bootstrap Script

Run this script to create databases programmatically:

```bash
#!/bin/bash
# bootstrap-notion-dj.sh
# Creates DJ databases in Notion

NOTION_KEY=$(cat ~/.config/notion/api_key)
PARENT_PAGE_ID="your-workspace-page-id"

# Create Tasks database
curl -X POST "https://api.notion.com/v1/databases" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"page_id": "'"$PARENT_PAGE_ID"'"},
    "title": [{"text": {"content": "Tasks"}}],
    "properties": {
      "Name": {"title": {}},
      "Status": {"select": {"options": [
        {"name": "Inbox", "color": "gray"},
        {"name": "Next", "color": "blue"},
        {"name": "In Progress", "color": "yellow"},
        {"name": "Waiting", "color": "orange"},
        {"name": "Done", "color": "green"}
      ]}},
      "Due": {"date": {}},
      "Priority": {"select": {"options": [
        {"name": "🔴 High", "color": "red"},
        {"name": "🟡 Medium", "color": "yellow"},
        {"name": "🟢 Low", "color": "green"}
      ]}},
      "Source": {"select": {"options": [
        {"name": "Manual", "color": "gray"},
        {"name": "Voice Capture", "color": "purple"},
        {"name": "Email", "color": "blue"},
        {"name": "Meeting", "color": "green"}
      ]}},
      "Estimate": {"number": {"format": "number"}},
      "Scheduled": {"checkbox": {}},
      "Notes": {"rich_text": {}}
    }
  }'

# Repeat for other databases...
# See full script in scripts/bootstrap-notion-dj.sh
```

### Option 3: Notion Template

Import the DJ workspace template (if available):
1. Go to Notion template gallery
2. Search for "DJ Assistant Workspace" (community template)
3. Duplicate to your workspace
4. Share databases with integration

---

## Configuration

After creating databases, add their IDs to your config:

```json
// ~/.openclaw/openclaw.json
{
  "skills": {
    "dj": {
      "notion": {
        "tasksDb": "abc123...",
        "projectsDb": "def456...",
        "meetingsDb": "ghi789...",
        "podcastDb": "jkl012...",
        "researchDb": "mno345...",
        "workNotesDb": "pqr678...",
        "rlmSessionsDbId": "yza567...",
        "improvePlansDbId": "bcd890..."
      }
    }
  }
}
```

Or use environment variables:
```bash
export DJ_NOTION_TASKS_DB="abc123..."
export DJ_NOTION_PROJECTS_DB="def456..."
export DJ_NOTION_MEETINGS_DB="ghi789..."
export DJ_NOTION_PODCAST_DB="jkl012..."
export DJ_NOTION_RESEARCH_DB="mno345..."
export DJ_NOTION_WORK_NOTES_DB="pqr678..."

# M5 Podcast Engine databases
export DJ_NOTION_EPISODE_PIPELINE_DB_ID="stu901..."
export DJ_NOTION_PODCAST_ASSETS_DB_ID="vwx234..."

# M6 RLM and Improve databases
export DJ_NOTION_RLM_SESSIONS_DB_ID="yza567..."
export DJ_NOTION_IMPROVE_PLANS_DB_ID="bcd890..."
```

## Finding Database IDs

1. Open database in Notion
2. Copy the URL: `https://notion.so/workspace/abc123def456...?v=...`
3. The ID is the 32-character string before `?v=`
4. For data_source_id (queries): call `GET /v1/databases/{id}` and use the returned `data_source_id`

## Notes

- All databases should be shared with your Notion integration
- The integration needs read/write access for full functionality
- Work Notes database should be in a separate workspace or have restricted sharing
- Consider using Notion's native database templates for consistent styling

## Idempotency (M5)

The M5 Podcast Engine uses idempotent write operations to prevent duplicates when retrying failed writes:

| Database | Idempotency Key | Behavior |
|----------|-----------------|----------|
| Episode Pipeline | `episodeId` (Name) | Query before insert, update if exists |
| Podcast Assets | `cacheKey` + `artifactType` | Query before insert, update if exists |

This allows the Notion outbox retry queue to safely replay failed operations without creating duplicates. If an operation is replayed:
- Episode Pipeline: Updates the existing episode entry
- Podcast Assets: Updates the existing asset entry (same transcript hash + artifact type)

**Note**: The `cacheKey` in Podcast Assets is the transcript hash (SHA-256, 16 chars). Combined with `artifactType`, this ensures each artifact is unique per transcript.
