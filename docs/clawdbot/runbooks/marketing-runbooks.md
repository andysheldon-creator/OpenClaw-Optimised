# Marketing Runbooks — Business Skill Packs

Runbooks for all Marketing workflows in the Clawdbot Business Skill Packs.

For production Google Ads mutation operations and incident handling, also use:

- `docs/clawdbot/runbooks/marketing-live-execution.md`
- `docs/clawdbot/runbooks/dashboard-lifecycle-operations.md`

Covers:

- BIZ-078 (#170) Compile weekly content ideas docs + runbook
- BIZ-081 (#173) Generate newsletter draft docs + runbook
- BIZ-084 (#176) Social post scheduling prep docs + runbook

---

## Compile Weekly Content Ideas

**Workflow ID:** `marketing-weekly-content-ideas`
**Trigger:** Scheduled (every Monday at 07:00 UTC) or manual
**Approval gate:** Marketing lead or content manager

### Overview

Gathers trending topics, analyses previous week's content performance, collects team input, and compiles a ranked list of content ideas for the upcoming week. Pauses for marketing lead approval before publishing ideas to the editorial calendar.

### Prerequisites

- Trending topics data source configured (e.g. Google Trends API, social listening tool)
- Content analytics integration (e.g. Google Analytics, blog CMS analytics)
- Team input channel configured (Slack channel, form, or email alias)
- Editorial calendar system write access

### Steps

1. **Fetch trending topics** -- Query the configured trending topics source for relevant industry and product keywords.
2. **Analyse past performance** -- Pull analytics for the previous week's published content. Identify top-performing topics, formats, and channels.
3. **Gather team input** -- Collect content suggestions from the team input channel (messages posted since last run).
4. **Compile ideas** -- Merge trending topics, performance insights, and team input into a deduplicated list of content ideas.
5. **Rank and prioritise** -- Score ideas based on trend strength, alignment with goals, estimated effort, and channel fit.
6. **Approval gate** -- Pause for marketing lead review. The reviewer can reorder, edit, or remove ideas before approving.
7. **Publish to calendar** -- Write approved ideas to the editorial calendar with assigned channels and target dates.
8. **Notify team** -- Send the finalised content plan to the team notification channel.

### Failure handling

- Trending topics API failures fall back to the previous week's topic cache.
- Analytics fetch failures log a warning and continue with available data.
- Calendar write failures are retried once; manual entry is flagged if retry fails.

### Rollback

- Ideas published to the calendar can be removed manually. The workflow logs all calendar entries created.

---

## Generate Newsletter Draft

**Workflow ID:** `marketing-newsletter-draft`
**Trigger:** Scheduled (configurable, e.g. Thursday at 10:00 UTC for Monday send) or manual
**Approval gate:** Marketing editor

### Overview

Auto-generates a newsletter draft from curated content sources (blog posts, product updates, industry news), applies the brand template, and queues it for send. Pauses for editor approval to review tone, accuracy, and formatting before the newsletter is dispatched.

### Prerequisites

- Content sources configured (RSS feeds, blog CMS API, product changelog URL)
- Newsletter template available in the email marketing platform
- Subscriber segments defined in the email platform
- Brand voice/tone guidelines documented

### Steps

1. **Gather content sources** -- Fetch new content from all configured sources since the last newsletter.
2. **Curate sections** -- Select and organise content into newsletter sections (top story, product update, tips, etc.).
3. **Generate draft** -- Use AI to write section copy, subject line, and preview text following brand tone guidance.
4. **Apply template** -- Render the draft into the newsletter HTML template with proper styling.
5. **Approval gate** -- Pause for editor review. The editor sees a rendered preview and can request changes.
6. **Queue for send** -- Submit the approved newsletter to the email platform for scheduled delivery.
7. **Notify editor** -- Confirm the newsletter is queued with the scheduled send date and estimated recipient count.

### Failure handling

- Content source fetch failures are logged; the newsletter proceeds with available content (minimum 2 sections required).
- Template rendering failures halt the workflow and notify the editor.
- Email platform queue failures are retried once with a 5-minute delay.

### Rollback

- If the newsletter is queued but not yet sent, it can be cancelled in the email platform. The workflow logs the campaign ID for easy lookup.

---

## Social Post Scheduling Prep

**Workflow ID:** `marketing-social-post-scheduling`
**Trigger:** Scheduled (weekly, configurable day/time) or manual
**Approval gate:** Social media manager

### Overview

Prepares a batch of social media posts based on the editorial calendar. Generates platform-specific copy, selects media assets, optimises posting times, and queues posts in the scheduling tool. Pauses for social media manager approval to review voice, timing, and platform fit.

### Prerequisites

- Editorial calendar read access
- Media asset library configured (image/video storage)
- Social scheduling tool integration (e.g. Buffer, Hootsuite, or native platform APIs)
- Platform-specific character limits and best practices documented
- Brand voice/tone guidelines available

### Steps

1. **Fetch editorial calendar** -- Pull upcoming content items from the editorial calendar for the scheduling window.
2. **Generate copy** -- Create platform-specific post copy for each content item, respecting character limits and hashtag conventions.
3. **Select media** -- Match media assets from the library to each post (images, videos, carousels).
4. **Optimise timing** -- Determine optimal posting times based on historical engagement data and platform best practices.
5. **Approval gate** -- Pause for social media manager review. The reviewer sees each post with copy, media, and scheduled time.
6. **Queue in scheduler** -- Push approved posts to the social scheduling tool.
7. **Notify social manager** -- Confirm the batch is queued with a summary of posts by channel and date.

### Failure handling

- Media asset selection failures fall back to text-only posts (flagged for manual media attachment).
- Scheduling tool API failures are retried 3 times with exponential backoff.
- If a post exceeds the platform's character limit after generation, it is flagged for manual editing.

### Rollback

- Queued posts can be unscheduled via the scheduling tool. The workflow logs all scheduled post IDs for bulk cancellation.
