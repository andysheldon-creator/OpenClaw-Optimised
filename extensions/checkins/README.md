# Checkins Extension

A Discord standup/check-in management extension for Clawdbot. Automates daily team check-ins via DM conversations and posts summaries to designated channels.

## Features

- Scheduled check-in prompts via Discord DM
- 3-question standup format (yesterday, today, blockers)
- Per-member timezone support
- Vacation mode
- Auto-posting to team channels
- Admin-only team management

## How It Works

1. **Admin creates a team** and assigns a Discord channel for standup posts
2. **Admin adds members** with their timezone
3. **At each member's scheduled time** (default 5pm in their timezone), the bot DMs them
4. **Member answers 3 questions** via DM conversation
5. **Completed check-in is posted** to the team's channel

## Check-in Questions

1. "What did you accomplish today?"
2. "What will you do next?"
3. "Any blockers or anything to handover?"

For question 3, members can reply with "none", "skip", "no", or "n/a" to indicate no blockers.

## Admin Commands

All admin commands require Discord server Administrator permission. Talk to the bot naturally - it will use the appropriate tools.

### Team Management

| Command | Example |
|---------|---------|
| Create team | "Create a team called Engineering with standups in #engineering-standup" |
| Delete team | "Delete the Engineering team" |
| List teams | "What teams are configured?" |

### Member Management

| Command | Example |
|---------|---------|
| Add member | "Add @john to the Engineering team, timezone EST" |
| Remove member | "Remove @john from the Engineering team" |
| Change timezone | "Change @john's timezone to PST" |
| List members | "Who is on the Engineering team?" |

### Vacation

| Command | Example |
|---------|---------|
| Set vacation | "Set @john on vacation until Friday" |
| Set indefinite vacation | "Put @john on vacation" |
| End vacation | "End @john's vacation" |

Members can also set their own vacation by DMing the bot.

## Member Self-Service

Members can DM the bot directly for:

- Setting their own vacation: "I'm on vacation until next Monday"
- Ending vacation: "I'm back from vacation"

## Timezone Support

The extension accepts flexible timezone formats:

- IANA: `America/New_York`, `Europe/London`, `Asia/Tokyo`
- Abbreviations: `EST`, `PST`, `UTC`, `GMT`
- Common names: `Eastern`, `Pacific`, `Central`

## Default Schedule

- Check-in time: 5:00 PM (17:00) in member's timezone
- Skip weekends: Yes
- Reminder: Sent 1 hour after initial prompt if no response
- Abandon: Incomplete check-ins expire at midnight

## Database

Check-in data is stored in SQLite at `~/.clawdbot/checkins.db`:

- **teams**: Team definitions with channel assignments
- **members**: Team membership with schedules
- **checkins**: Completed check-in records
- **conversation_state**: Active DM conversations

## Configuration

Add to your `clawdbot.json`:

```json
{
  "plugins": {
    "entries": {
      "checkins": {
        "enabled": true,
        "config": {
          "defaultTimezone": "America/New_York",
          "defaultCheckInTime": "17:00",
          "reminderDelayMinutes": 60,
          "abandonAfterMinutes": 420
        }
      }
    }
  }
}
```

## Discord Channel Setup

1. Create channels for each team's standups (e.g., `#engineering-standup`)
2. Ensure the bot has permission to send messages in those channels
3. When creating teams, specify the channel ID or mention the channel

## Permissions Required

The bot needs these Discord permissions:

- Send Messages (for standup posts)
- Read Message History (for context)
- Add Reactions (for acknowledgments)

Plus the **Message Content Intent** must be enabled in Discord Developer Portal.

## Example Setup Flow

```
Admin: Create a team called Frontend with standups posted to #frontend-standup
Bot: Created team "Frontend"

Admin: Add @alice to Frontend, timezone PST
Bot: Added @alice to Frontend, timezone America/Los_Angeles

Admin: Add @bob to Frontend, timezone EST
Bot: Added @bob to Frontend, timezone America/New_York

Admin: Set @alice on vacation until Friday
Bot: @alice is now on vacation until Friday, January 31
```

At 5pm PST, Alice would receive a DM (but won't because she's on vacation).
At 5pm EST, Bob receives:

```
Bot: What did you accomplish today?
Bob: Fixed the login bug and reviewed 2 PRs
Bot: What will you do next?
Bob: Working on the dashboard redesign
Bot: Any blockers or anything to handover?
Bob: None
Bot: Check-in complete! Posted to #frontend-standup
```

The summary appears in #frontend-standup:

```
Bob's Check-in

**What did you accomplish today?**
Fixed the login bug and reviewed 2 PRs

**What will you do next?**
Working on the dashboard redesign

**Blockers:** None
```
