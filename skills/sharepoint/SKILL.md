---
name: sharepoint
description: Search and retrieve documents from One Point's SharePoint/OneDrive. Index thousands of community files for Steve.
status: PLANNED
---

# SharePoint Integration (One Point)

Access and search One Point's document library (SharePoint/OneDrive).

## Status: PLANNED — Waiting on M365 access

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SharePoint / OneDrive                        │
│  (Thousands of community docs, proposals, reports, etc.)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Microsoft Graph API                            │
│  - List files/folders                                            │
│  - Download content                                              │
│  - Search via Graph Search API                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Index (qmd)                             │
│  - Vector embeddings for semantic search                         │
│  - BM25 for keyword search                                       │
│  - Reranking for best results                                    │
│  - Incremental sync (only new/changed files)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Steve                                    │
│  "What's the occupancy rate at Paradise Valley?"                 │
│  "Find the latest proposal for Duncaster"                        │
│  "Summarize the Bethel financial report"                         │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

### Authentication
- Azure AD App Registration (pending)
- Permissions needed:
  - `Files.Read.All` — Read all files user can access
  - `Sites.Read.All` — Read SharePoint sites
  - Or delegated auth via user login

### Storage
- Local cache of file metadata
- Extracted text from docs (for indexing)
- Vector embeddings (qmd)
- ~10-50GB depending on file count

## Commands (Planned)

```bash
sharepoint.py auth              # Authenticate with M365
sharepoint.py sites             # List SharePoint sites
sharepoint.py list <path>       # List files in folder
sharepoint.py search "query"    # Search via Graph API
sharepoint.py download <id>     # Download file locally
sharepoint.py index             # Build/update local search index
sharepoint.py query "question"  # Semantic search with qmd
sharepoint.py sync              # Incremental sync new/changed files
```

## Search Strategy

### Two-tier search:
1. **Microsoft Graph Search** — Fast, server-side, but limited
2. **Local qmd Index** — Semantic search, full text, reranking

### Index Pipeline:
```
File discovered → Download → Extract text → Chunk → Embed → Store in qmd
```

### Supported file types:
- Word (.docx)
- Excel (.xlsx) — extract as text/tables
- PowerPoint (.pptx)
- PDF
- Text files

## Use Cases for One Point

1. **Community Research**
   - "What do we know about Paradise Valley Estates?"
   - "Find all docs mentioning Bethel"

2. **Proposal Lookup**
   - "Get the latest proposal for Duncaster"
   - "What was our fee structure for similar engagements?"

3. **Financial Analysis**
   - "Find financial reports for active engagements"
   - "What's the typical bed count for our communities?"

4. **Meeting Prep**
   - "Summarize everything about [community] before my call"

## Proactive Heartbeat Actions

- Alert on new files added to key folders
- Weekly digest of document activity
- Flag documents that haven't been updated in X months
- Remind about upcoming proposal deadlines (from file metadata)

## Setup Steps (When Ready)

1. Create Azure AD App Registration
2. Grant SharePoint/OneDrive permissions
3. Generate client secret or certificate
4. Configure skill with tenant ID, client ID, secret
5. Run initial sync/index
6. Schedule incremental sync (daily cron)

## Dependencies

- `msal` — Microsoft Authentication Library
- `msgraph-sdk` or raw REST calls
- `qmd` — Local vector/BM25 search
- `python-docx`, `openpyxl`, `pypdf` — File parsing

## Notes

- Initial index may take hours for thousands of files
- Consider filtering by folder/site to prioritize
- Embeddings storage: ~1KB per chunk, ~10 chunks per doc average
- Estimate: 5,000 docs × 10 chunks × 1KB = ~50MB vectors
