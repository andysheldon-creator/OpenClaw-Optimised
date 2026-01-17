# ppl.gift CRM Skill

Comprehensive CRM management for ppl.gift (Monica CRM fork). This skill provides a full-featured command-line interface for managing contacts, notes, relationships, journal entries, and more.

## Features

- **Contact Management**: Search, create, update contacts with full details
- **Notes & Activities**: Add detailed notes and track interactions
- **Communication**: Manage phone numbers, emails, calls, and conversations
- **Companies**: Create and manage company/organization records
- **Groups**: Organize contacts into groups and categories
- **Relationships**: Connect contacts with proper relationship mapping
- **Photos & Media**: Upload and manage profile photos and images
- **Documents**: Store contracts, certifications, and other files
- **Tags & Classification**: Create and manage tagging system
- **Locations**: Add addresses and geographic information
- **Journal**: Personal journaling with optional contact association
- **Reminders**: Set follow-ups and important dates
- **Gifts**: Track gift ideas and special occasions
- **Analytics**: Contact statistics and relationship mapping

## Quick Start

### 1. Setup Credentials in clawdbot.json

The skill automatically reads credentials from your `~/.clawdbot/clawdbot.json` file under the `ppl` skill entry:

```json
{
  "skills": {
    "entries": {
      "ppl": {
        "env": {
          "PPL_API_URL": "https://ppl.gift/api",
          "PPL_API_TOKEN": "your-api-token-here"
        }
      }
    }
  }
}
```

**Note:** The credentials are already configured in your clawdbot.json file.

### 2. Test Connection

```bash
cd skills/ppl-gift
python scripts/setup.py
```

### 3. Install Dependencies

```bash
cd skills/ppl-gift
uv sync
```

### 4. Start Using

```bash
# Search for contacts
uv run scripts/ppl.py search "john marquis"

# Create a new contact
uv run scripts/ppl.py create-contact "John Marquis" \
  --first-name "John" \
  --last-name "Marquis" \
  --email "john@marquistreeservice.com" \
  --phone "781-844-0042" \
  --job-title "President" \
  --company "Marquis Tree Service" \
  --tags "arborist,tree-service,isa-certified"
```

## Common Use Cases

### Adding a Business Contact

```bash
# 1. Create the contact
uv run scripts/ppl.py create-contact "Mike Troiano" \
  --first-name "Mike" \
  --last-name "Troiano" \
  --email "mike@g20vc.com" \
  --job-title "Partner" \
  --company "G20 Ventures" \
  --tags "venture-capital,investor"

# 2. Add professional background note
uv run scripts/ppl.py add-note "mike-troiano-123" \
  --title "Professional Background" \
  --body "CMO of Actifio - turned company into Google-acquired unicorn. Harvard Business School graduate. Top 1% Twitter influencer."

# 3. Add to journal
uv run scripts/ppl.py journal-add \
  --title "Added Mike Troiano to CRM" \
  --body "G20 Ventures partner, former Actifio CMO, Harvard Business School" \
  --tags "g20-ventures,venture-capital,mike-troiano"
```

### Setting Up Reminders

```bash
# Follow-up call reminder
uv run scripts/ppl.py add-reminder "john-marquis-123" \
  --title "Call John about tree quote" \
  --due-date "2026-01-18T14:00:00Z" \
  --type "call"

# Birthday reminder
uv run scripts/ppl.py add-reminder "john-marquis-123" \
  --title "Send birthday card" \
  --due-date "2026-03-15" \
  --type "birthday"
```

### Managing Relationships

```bash
# Add business relationship
uv run scripts/ppl.py add-relationship "john-marquis-123" \
  --contact-id "bob-hower-456" \
  --type "business-partner" \
  --note "May collaborate on G20 Ventures projects"
```

## Command Reference

### Contact Management

| Command | Description | Example |
|---------|-------------|---------|
| `search` | Search contacts by name or email | `search "john marquis"` |
| `create-contact` | Create new contact | `create-contact "John Doe" --first-name John --last-name Doe` |
| `update-contact` | Update existing contact | `update-contact "john-doe-123" --job-title "CEO"` |

### Notes & Activities

| Command | Description | Example |
|---------|-------------|---------|
| `add-note` | Add note to contact | `add-note "john-doe-123" --title "Meeting Notes" --body "..."` |
| `add-activity` | Log interaction/activity | `add-activity "john-doe-123" --type "meeting" --summary "..."` |

### Communication

| Command | Description | Example |
|---------|-------------|---------|
| `add-phone` | Add phone number | `add-phone "john-doe-123" --number "555-1234" --type mobile` |
| `add-email` | Add email address | `add-email "john-doe-123" --email "john@company.com"` |

### Journal & Tracking

| Command | Description | Example |
|---------|-------------|---------|
| `journal-add` | Add journal entry | `journal-add --title "..." --body "..."` |
| `journal-list` | List recent entries | `journal-list --limit 10` |
| `journal-search` | Search journal | `journal-search "meeting"` |

### Reminders & Tasks

| Command | Description | Example |
|---------|-------------|---------|
| `add-reminder` | Add reminder | `add-reminder "john-doe-123" --title "Call" --due-date "2026-01-20"` |
| `add-task` | Add task | `add-task "john-doe-123" --title "Send email" --due-date "2026-01-18"` |

### Gifts & Special Dates

| Command | Description | Example |
|---------|-------------|---------|
| `add-gift` | Add gift idea | `add-gift "john-doe-123" --title "Book" --price "$25"` |
| `add-date` | Add important date | `add-date "john-doe-123" --type "birthday" --date "1975-03-15"` |

## Credentials Configuration

### Location
Credentials are stored in `~/.clawdbot/clawdbot.json` under the `ppl` skill entry.

### Setup
1. Go to [ppl.gift settings](https://ppl.gift/settings)
2. Navigate to 'API Tokens'
3. Create a new token
4. Add to `~/.clawdbot/clawdbot.json`:

```json
{
  "skills": {
    "entries": {
      "ppl": {
        "env": {
          "PPL_API_URL": "https://ppl.gift/api",
          "PPL_API_TOKEN": "your-token-here"
        }
      }
    }
  }
}
```

**Fallback:** If config file is not found, the skill will fall back to environment variables:
- `PPL_API_URL` (default: `https://ppl.gift/api`)
- `PPL_API_TOKEN` (required if using env vars)

## Rate Limiting

- Monica API: ~3 requests/second average
- Built-in retry logic for failed requests
- Batch operations supported for multiple contacts

## Troubleshooting

### Common Issues

**"API error 401: Unauthorized"**
- Check that your API token is valid
- Ensure credentials are properly configured in `~/.clawdbot/clawdbot.json` under the `ppl` skill entry
- Verify the skill can read from the config file

**"Contact already exists"**
- Use `search` command first to check for existing contacts
- Use `update-contact` instead of `create-contact` for existing contacts

**"Connection timeout"**
- Check internet connection
- Verify ppl.gift service is accessible

**Config file not found**
- Ensure `~/.clawdbot/clawdbot.json` exists and is readable
- Check that the `ppl` entry exists under `skills.entries`
- Fallback to environment variables if config is unavailable

### Getting Help

- Run `uv run scripts/ppl.py --help` for command reference
- Check the SKILL.md file for detailed documentation
- Test connection with `python scripts/setup.py`

## Examples Output

```bash
$ uv run scripts/ppl.py search "john marquis"

Found 1 contact(s):

📇 John Marquis
   Company: Marquis Tree Service
   Title: President
   Phone: 781-844-0042
   Email: john@marquistreeservice.com
   Tags: arborist, tree-service, isa-certified
```

```bash
$ uv run scripts/ppl.py journal-add --title "Added John Marquis" --body "Professional arborist contact" --tags "arborist,john-marquis"

✅ Created journal entry with ID: journal-123
✅ Added to journal
```

## Integration Notes

This skill is designed to work seamlessly with:
- **Clawdbot**: Full integration with agent system
- **Other Skills**: Can be called from other skills
- **Cron Jobs**: Suitable for scheduled tasks
- **Webhooks**: API-compatible for automation

## Development

### Adding New Commands

1. Add method to `PPLGiftAPI` class
2. Add CLI command in `PPLGiftCLI` class
3. Update argparse subparser
4. Add examples to SKILL.md

### Testing

```bash
# Test API connection
python scripts/setup.py

# Run basic search
uv run scripts/ppl.py search "test"

# Test contact creation
uv run scripts/ppl.py create-contact "Test Person" --first-name Test --last-name Person
```

## License

MIT License - see LICENSE file for details