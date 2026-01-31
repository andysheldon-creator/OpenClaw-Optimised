# Content Intelligence System (CIS) v2.0

**Status:** Operational  
**Last Updated:** 2026-01-30  
**Total Articles:** 156  
**Total Insights:** 630  
**Sources:** 11 active RSS feeds

---

## System Overview

CIS v2.0 is an RSS-based content harvesting and insight extraction system that:
1. Harvests articles from RSS feeds
2. Archives full content with metadata
3. Extracts 3-5 actionable insights per article
4. Routes insights to PARA categories

---

## Source Registry

### Original Sources (6)

| Source | RSS Feed | Articles | Insights | Priority |
|--------|----------|----------|----------|----------|
| Nate Jones | https://natesnewsletter.substack.com/feed | 21 | 94 | High |
| Slow AI | https://theslowai.substack.com/feed | 20 | 97 | High |
| Aakash Gupta | https://www.news.aakashg.com/feed | 20 | 90 | Medium |
| NEW ECONOMIES | https://www.neweconomies.co/feed | 19 | 95 | Medium |
| Rhys Morgan | https://rhysmorgan.substack.com/feed | 30 | 163 | High |
| Sabrina Ramonov | https://www.sabrina.dev/feed | 20 | 91 | High |

### New Sources (5)

| Source | RSS Feed | Articles | Insights | Priority |
|--------|----------|----------|----------|----------|
| Lenny's Newsletter | https://lennyrachitsky.substack.com/feed | 0 | - | High |
| The AI Corner | https://theaicorner.substack.com/feed | 1 | - | High |
| Waking Up | https://wakingup.substack.com/feed | 5 | - | Medium |
| Ground News | https://groundnews.substack.com/feed | 0 | - | Low |
| TechTiff | https://techtiff.substack.com/feed | 20 | - | Low |

**Total:** 156 articles, 630 insights (from original 6 sources)

---

## Directory Structure

```
content-intelligence/
├── config/
│   └── sources.json          # Source registry with metadata
├── sources/
│   ├── nate-jones/
│   │   ├── archive/          # Article JSON files
│   │   ├── insights/         # Extracted insights
│   │   └── metadata/
│   │       └── source.json   # Source profile
│   ├── slow-ai/
│   ├── aakash-gupta/
│   ├── new-economies/
│   ├── rhys-morgan/
│   ├── sabrina-ramonov/
│   ├── lennys-newsletter/
│   ├── ai-corner/
│   ├── waking-up/
│   ├── ground-news/
│   └── techtiff/
├── cis_harvester.py          # RSS harvester
├── extract_pattern.py        # Pattern-based insight extraction
├── extract_direct.py         # LLM-based insight extraction (requires API)
└── CIS_README.md             # This file
```

---

## Archive Format

Each article saved as JSON:
```json
{
  "url": "...",
  "slug": "...",
  "title": "...",
  "subtitle": "...",
  "author": "...",
  "published": "...",
  "content_html": "<full HTML content...>",
  "content_text": "Plain text content...",
  "harvested_at": "..."
}
```

---

## Insight Format

Each article's insights saved as JSON:
```json
{
  "source_name": "...",
  "source_title": "...",
  "source_url": "...",
  "slug": "...",
  "insights": [
    {
      "insight": "Clear statement...",
      "action": "What to DO...",
      "framework": "Method name or null",
      "para_category": "projects|areas|resources",
      "para_target": "specific subcategory",
      "rationale": "Why this matters",
      "confidence": "high|medium|low"
    }
  ],
  "insight_count": 5,
  "frameworks_detected": [...],
  "para_distribution": {...},
  "extracted_at": "..."
}
```

---

## PARA Integration

Insights are routed to PARA categories:

### Projects
- ceramics
- stickers  
- natural-capture

### Areas
- ef-coaching
- ai-tools
- business-strategy

### Resources
- frameworks
- templates
- best-practices

**Current Distribution:**
- Areas: 449 insights (71%)
- Resources: 143 insights (23%)
- Projects: 38 insights (6%)

---

## Usage

### Harvest New Articles
```bash
cd ~/clawd/content-intelligence
python3 cis_harvester.py
```

### Extract Insights (Pattern-based)
```bash
python3 extract_pattern.py
```

### Extract Insights (LLM-based - higher quality)
```bash
python3 extract_direct.py
```

### Update PARA Routing
Insights are automatically routed to PARA database during extraction.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `cis_harvester.py` | Fetches RSS feeds, archives articles |
| `extract_pattern.py` | Pattern-based insight extraction (no LLM needed) |
| `extract_direct.py` | LLM-based insight extraction (requires ZAI API) |
| `process_insights.py` | Batch LLM processing via clawdbot llm-task |

---

## Quality Gates

Current extraction quality:
- Pattern-based: Medium quality (automated, fast)
- LLM-based: High quality (requires API access)

**Recommendation:** Run pattern-based for bulk processing, then re-run select articles with LLM for higher quality insights.

---

## Future Enhancements

1. **Automated scheduling:** Set up cron job for daily/weekly harvests
2. **Deduplication:** Skip already-archived articles
3. **Quality scoring:** Rate insight quality and filter low-confidence
4. **LLM batch processing:** Queue for overnight processing
5. **Search indexing:** Add full-text search across archives
6. **Fix Ground News feed:** Currently 404 error
7. **Check Lenny's Newsletter:** Verify if paywalled or needs different URL

---

## Database Schema

PARA database (`~/clawd/memory/para.sqlite`) table `cis_routing`:
```sql
CREATE TABLE cis_routing (
    id INTEGER PRIMARY KEY,
    source TEXT,
    source_title TEXT,
    source_url TEXT,
    insight_type TEXT,
    insight_content TEXT,
    para_category TEXT,
    para_target TEXT,
    rationale TEXT,
    routed_at TEXT
);
```

---

*CIS v2.0 - Built 2026-01-28, Updated 2026-01-30*
