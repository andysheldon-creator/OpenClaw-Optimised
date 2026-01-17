---
name: ppl-gift
description: Manage people, contacts, notes, and relationships in ppl.gift CRM (Monica fork). Auto-sync journal entries and maintain contact relationships.
homepage: https://ppl.gift
metadata: {"clawdis":{"emoji":"👥","requires":{"bins":["uv"]}}}
---

# ppl.gift CRM Skill

Comprehensive CRM management for ppl.gift (Monica CRM fork). Search contacts, create notes, manage relationships, and sync journal entries.

## Setup

### Credentials Configuration

The skill automatically reads credentials from `~/.clawdbot/clawdbot.json` under the `ppl` skill entry:

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

**Note:** Your credentials are already configured in your clawdbot.json file.

## Quick Commands

### Contact Management

```bash
# Search contacts
uv run {baseDir}/scripts/ppl.py search "john marquis"
uv run {baseDir}/scripts/ppl.py search --email "john@example.com"

# Create contact
uv run {baseDir}/scripts/ppl.py create-contact "John Marquis" \
  --first-name "John" \
  --last-name "Marquis" \
  --email "john@marquistreeservice.com" \
  --phone "781-844-0042" \
  --job-title "President" \
  --company "Marquis Tree Service" \
  --tags "arborist,tree-service,isa-certified"

# Update contact
uv run {baseDir}/scripts/ppl.py update-contact "john-marquis-123" \
  --job-title "President & CEO" \
  --company "Marquis Tree Service" \
  --add-tags "professional-arborist"
```

### Notes & Information

```bash
# Add note to contact
uv run {baseDir}/scripts/ppl.py add-note "john-marquis-123" \
  --title "Professional Background" \
  --body "ISA Certified Arborist #7104A. Specializes in tree care and maintenance."

# Add activity/engagement
uv run {baseDir}/scripts/ppl.py add-activity "john-marquis-123" \
  --type "meeting" \
  --summary "Initial consultation about tree services" \
  --description "Discussed tree removal and pruning for property"

# Add phone number
uv run {baseDir}/scripts/ppl.py add-phone "john-marquis-123" \
  --number "781-844-0042" \
  --type "mobile"

# Add email
uv run {baseDir}/scripts/ppl.py add-email "john-marquis-123" \
  --email "john@marquistreeservice.com" \
  --type "work"
```

### Companies & Organizations

```bash
# Create company
uv run {baseDir}/scripts/ppl.py create-company "Marquis Tree Service" \
  --description "Professional tree care and arborist services" \
  --website "https://marquistreeservice.com"

# Search companies
uv run {baseDir}/scripts/ppl.py search-companies "G20 Ventures"
```

### Groups & Organizations

```bash
# Create group
uv run {baseDir}/scripts/ppl.py create-group "Harvard Alumni" \
  --description "Harvard Business School graduates" \
  --type "professional"

# Search groups
uv run {baseDir}/scripts/ppl.py search-groups "alumni"
```

### Communication & Activities

```bash
# Log phone call
uv run {baseDir}/scripts/ppl.py log-call "john-marquis-123" \
  --summary "Discussed tree service quote for office property" \
  --duration 15 \
  --type "received"

# Create conversation
uv run {baseDir}/scripts/ppl.py create-conversation "john-marquis-123" \
  --content "Sent follow-up email about arborist certification" \
  --type "email"

# Search conversations
uv run {baseDir}/scripts/ppl.py search-conversations "tree services"
```

### Photos & Media

```bash
# Upload profile photo
uv run {baseDir}/scripts/ppl.py upload-photo "john-marquis-123" \
  --photo-url "https://example.com/photo.jpg" \
  --description "Professional headshot" \
  --type "avatar"
```

### Documents & Files

```bash
# Upload document
uv run {baseDir}/scripts/ppl.py upload-document "john-marquis-123" \
  --file-url "https://example.com/certification.pdf" \
  --filename "ISA_Certification_7104A.pdf" \
  --description "International Society of Arboriculture certification" \
  --type "certification"
```

### Tags & Classification

```bash
# Create tag
uv run {baseDir}/scripts/ppl.py create-tag "ISA-Certified" \
  --description "International Society of Arboriculture certified professionals" \
  --type "professional"

# Search tags
uv run {baseDir}/scripts/ppl.py search-tags "arborist"
```

### Locations & Addresses

```bash
# Add location
uv run {baseDir}/scripts/ppl.py add-location "john-marquis-123" \
  --address "123 Tree Service Way, Lexington, MA 02420" \
  --type "business"
```

### Relationships & Connections

```bash
# Add relationship between contacts
uv run {baseDir}/scripts/ppl.py add-relationship "john-marquis-123" \
  --contact-id "bob-hower-456" \
  --type "business-partner" \
  --note "May collaborate on G20 Ventures projects"

# Add address
uv run {baseDir}/scripts/ppl.py add-address "john-marquis-123" \
  --street "123 Main Street" \
  --city "Lexington" \
  --state "MA" \
  --postal-code "02420" \
  --country "US" \
  --type "home"
```

### Journal & Tracking

```bash
# Add journal entry
uv run {baseDir}/scripts/ppl.py journal-add \
  --title "Meeting with John Marquis" \
  --body "Discussed potential tree services for G20 Ventures office property" \
  --tags "meeting,arborist,consultation" \
  --contact-id "john-marquis-123"

# List journal entries
uv run {baseDir}/scripts/ppl.py journal-list --limit 10

# Search journal
uv run {baseDir}/scripts/ppl.py journal-search "tree services"
```

### Reminders & Tasks

```bash
# Add reminder
uv run {baseDir}/scripts/ppl.py add-reminder "john-marquis-123" \
  --title "Follow up on quote" \
  --due-date "2026-01-20" \
  --type "call"

# Add task
uv run {baseDir}/scripts/ppl.py add-task "john-marquis-123" \
  --title "Send arborist certification request" \
  --description "Request copy of ISA certification #7104A" \
  --due-date "2026-01-18"
```

### Gift & Special Dates

```bash
# Add gift idea
uv run {baseDir}/scripts/ppl.py add-gift "john-marquis-123" \
  --title "Tree Care Book" \
  --description "Professional arborist handbook" \
  --url "https://example.com/book" \
  --price "$45"

# Add important date
uv run {baseDir}/scripts/ppl.py add-date "john-marquis-123" \
  --type "birthday" \
  --date "1975-03-15" \
  --label "Birthday"
```

## Advanced Operations

### Import/Export

```bash
# Export contact data
uv run {baseDir}/scripts/ppl.py export-contact "john-marquis-123" --format json

# Bulk import contacts from CSV
uv run {baseDir}/scripts/ppl.py import-contacts contacts.csv --skip-duplicates

# Sync with external systems
uv run {baseDir}/scripts/ppl.py sync-twenty "john-marquis-123" \
  --twenty-engagement "g20-ventures"
```

### Search & Discovery

```bash
# Advanced contact search
uv run {baseDir}/scripts/ppl.py search-advanced \
  --tags "arborist" \
  --company "tree" \
  --recent-activity --days 30

# Find contacts by relationship
uv run {baseDir}/scripts/ppl.py find-by-relationship "bob-hower" --type "business-partner"

# Search by location
uv run {baseDir}/scripts/ppl.py search-nearby "Lexington MA" --radius 10
```

### Analytics & Reports

```bash
# Contact statistics
uv run {baseDir}/scripts/ppl.py stats

# Relationship mapping
uv run {baseDir}/scripts/ppl.py relationship-map --contact "john-marquis-123"

# Activity timeline
uv run {baseDir}/scripts/ppl.py timeline "john-marquis-123" --days 365
```

## Common Use Cases

### Adding New Business Contact

```bash
# 1. Create contact with business info
uv run {baseDir}/scripts/ppl.py create-contact "Mike Troiano" \
  --first-name "Mike" \
  --last-name "Troiano" \
  --email "mike@g20vc.com" \
  --job-title "Partner" \
  --company "G20 Ventures" \
  --tags "venture-capital,investor"

# 2. Add professional background note
uv run {baseDir}/scripts/ppl.py add-note "mike-troiano-123" \
  --title "Professional Background" \
  --body "CMO of Actifio - turned company into Google-acquired unicorn. Harvard Business School graduate."

# 3. Add relationship to Bob Hower
uv run {baseDir}/scripts/ppl.py add-relationship "mike-troiano-123" \
  --contact-id "bob-hower-456" \
  --type "colleague" \
  --note "Co-partner at G20 Ventures"

# 4. Add to journal
uv run {baseDir}/scripts/ppl.py journal-add \
  --title "Added Mike Troiano to CRM" \
  --body "G20 Ventures partner, former Actifio CMO, Harvard Business School" \
  --tags "g20-ventures,venture-capital,mike-troiano"
```

### Setting Up Reminders

```bash
# Follow-up reminder
uv run {baseDir}/scripts/ppl.py add-reminder "john-marquis-123" \
  --title "Call John about tree quote" \
  --due-date "2026-01-18T14:00:00Z" \
  --type "call" \
  --reminder-type "follow-up"

# Birthday reminder
uv run {baseDir}/scripts/ppl.py add-reminder "john-marquis-123" \
  --title "Send birthday card" \
  --due-date "2026-03-15" \
  --recurring "yearly"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PPL_API_URL` | Yes | ppl.gift API URL (usually https://ppl.gift/api) |
| `PPL_API_TOKEN` | Yes | ppl.gift API authentication token |

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
| `log-call` | Log phone call | `log-call "john-doe-123" --summary "Call about..." --duration 15` |
| `create-conversation` | Create conversation | `create-conversation "john-doe-123" --content "Email content..."` |
| `search-conversations` | Search conversations | `search-conversations "meeting"` |

### Companies & Organizations

| Command | Description | Example |
|---------|-------------|---------|
| `create-company` | Create company | `create-company "Acme Corp" --website "https://acme.com"` |
| `search-companies` | Search companies | `search-companies "venture"` |

### Groups & Organizations

| Command | Description | Example |
|---------|-------------|---------|
| `create-group` | Create group | `create-group "Harvard Alumni" --type professional` |
| `search-groups` | Search groups | `search-groups "alumni"` |

### Photos & Media

| Command | Description | Example |
|---------|-------------|---------|
| `upload-photo` | Upload photo | `upload-photo "john-doe-123" --photo-url "https://..."` |

### Documents & Files

| Command | Description | Example |
|---------|-------------|---------|
| `upload-document` | Upload document | `upload-document "john-doe-123" --file-url "https://..." --filename "contract.pdf"` |

### Tags & Classification

| Command | Description | Example |
|---------|-------------|---------|
| `create-tag` | Create tag | `create-tag "VIP-Client" --type business` |
| `search-tags` | Search tags | `search-tags "arborist"` |

### Locations & Addresses

| Command | Description | Example |
|---------|-------------|---------|
| `add-location` | Add location | `add-location "john-doe-123" --address "123 Main St, City, ST 12345"` |

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

## Data Flow

1. **Contact Creation** → Search for duplicates first, create or update as needed
2. **Notes & Activities** → Automatically timestamp and link to contacts
3. **Relationships** → Bidirectional linking between contacts
4. **Journal Entries** → Personal tracking + optional contact association
5. **Reminders** → Scheduled notifications and follow-ups

## Integration Notes

- **Auto-deduplication**: Prevents duplicate contacts based on name/email
- **Journal sync**: All actions logged to personal journal automatically
- **Relationship mapping**: Maintains bidirectional contact relationships
- **Activity tracking**: All interactions logged as activities
- **Reminder system**: Built-in follow-up and birthday reminders

## Example Output

```bash
$ uv run {baseDir}/scripts/ppl.py search "john marquis"

Found 1 contact:
┌─────────────────┬────────────────────────┬─────────────────┐
│ ID              │ Name                   │ Company         │
├─────────────────┼────────────────────────┼─────────────────┤
│ john-marquis-123│ John Marquis           │ Marquis Tree... │
└─────────────────┴────────────────────────┴─────────────────┘

Phone: 781-844-0042 (mobile)
Email: john@marquistreeservice.com (work)
Tags: arborist, tree-service, isa-certified

Last Activity: 2026-01-17 - Added to CRM
Relationships: Connected to Bob Hower (business-partner)
```

## Dependencies

```bash
# Install dependencies
cd skills/ppl-gift && uv sync
```

## Rate Limiting

- Monica API: ~3 requests/second average
- Built-in rate limiting and retry logic
- Batch operations for multiple contacts