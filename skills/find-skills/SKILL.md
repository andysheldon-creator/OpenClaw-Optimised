---
name: find-skills
description: "Search the SkillsMP marketplace (25,000+ Agent Skills) for Claude Code, Codex CLI, and ChatGPT skills. Supports keyword search, AI semantic search, flexible sorting, and pagination."
metadata: { "openclaw": { "emoji": "🔍", "requires": { "config": ["skillsmp-api-key"] } } }
---

# Find Skills

Search the SkillsMP marketplace (25,000+ Agent Skills) for Claude Code, Codex CLI, and ChatGPT skills.

## Setup

Get your free API key from https://skillsmp.com/docs/api and configure it:

```bash
export SKILLSMP_API_KEY=sk_live_your_api_key
```

## Search Methods

### Keyword Search

For specific technologies, categories, or authors:

```bash
# Search by keyword
curl -s "https://skillsmp.com/api/v1/skills/search?q=API" \
  -H "Authorization: Bearer ${SKILLSMP_API_KEY}"

# Sort by stars or recent
curl -s "https://skillsmp.com/api/v1/skills/search?q=kubernetes&sortBy=stars" \
  -H "Authorization: Bearer ${SKILLSMP_API_KEY}"

# With pagination
curl -s "https://skillsmp.com/api/v1/skills/search?q=python&page=1&limit=20" \
  -H "Authorization: Bearer ${SKILLSMP_API_KEY}"
```

### AI Semantic Search

For natural language descriptions:

```bash
# URL encode the query
curl -s "https://skillsmp.com/api/v1/skills/ai-search?q=how%20to%20create%20web%20scraper" \
  -H "Authorization: Bearer ${SKILLSMP_API_KEY}"
```

## Search Examples

| Scenario            | Method      | Query                            |
| ------------------- | ----------- | -------------------------------- |
| Specific technology | Keyword     | "python", "kubernetes", "api"    |
| Feature description | AI Semantic | "how to handle git conflicts"    |
| Category browse     | Keyword     | "backend", "devops"              |
| Requirements        | AI Semantic | "performance optimization tools" |

## API Endpoints

| Endpoint                   | Method | Description                 |
| -------------------------- | ------ | --------------------------- |
| `/api/v1/skills/search`    | GET    | Keyword search with sorting |
| `/api/v1/skills/ai-search` | GET    | AI semantic search          |

## Resources

- [SkillsMP Homepage](https://skillsmp.com)
- [API Documentation](https://skillsmp.com/docs/api)
