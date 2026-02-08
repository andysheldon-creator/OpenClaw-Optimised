# Clawdbot Gap Analysis

Gap analysis of user stories against the current codebase.
Generated: 2026-02-08

## Platform Capabilities (Already Working)

These are NOT gaps — they are fully functional in the OpenClaw platform:

| Capability                                | How It Works                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proactive messaging**                   | Heartbeat system (default 30min) checks on tasks and delivers messages to the user's last-used channel via `deliverOutboundPayloads()`. Configurable interval, active hours, and delivery target. |
| **Scheduler / cron**                      | Full cron system with `at`/`every`/`cron` schedule kinds. Agent can manage its own cron jobs. Isolated agent turns with channel delivery. CLI: `openclaw cron add`.                               |
| **Google Workspace (gog)**                | `gogcli` integration for Gmail, Calendar, Drive, Contacts, Sheets, Docs. Credential JSON auth. Gmail webhook pipeline with Pub/Sub auto-renewal.                                                  |
| **Telegram / Slack / Discord / WhatsApp** | Working channel infrastructure. Telegram auto-enables from `TELEGRAM_BOT_TOKEN` env var.                                                                                                          |
| **Approval workflows**                    | End-to-end pipeline: gate detection → approval queue → dashboard UI → resolution with audit trail. Domain-specific gates for finance, marketing, support, HR, ops.                                |
| **Browser automation**                    | Playwright-based BrowserRunner with 8 action types, screenshots, commit gates.                                                                                                                    |
| **PDF tools (Docker)**                    | `poppler-utils` (pdftotext, pdfinfo), `tesseract-ocr` (OCR), `ghostscript` baked into Docker image.                                                                                               |
| **n8n workflow engine**                   | Embedded with Postgres, cron triggers, 5 workflow templates.                                                                                                                                      |
| **Artifact storage**                      | Filesystem-backed store for run outputs, organized by run ID.                                                                                                                                     |
| **Control plane**                         | Run tracking, audit logging, mutation ledger, idempotency, readiness reports.                                                                                                                     |

## Capability Matrix

| Capability                                     | Status      | Detail                                                    |
| ---------------------------------------------- | ----------- | --------------------------------------------------------- |
| Proactive channel delivery                     | **WORKING** | Heartbeat + `deliverOutboundPayloads()`                   |
| Scheduler / recurring tasks                    | **WORKING** | Native cron service in gateway                            |
| Google APIs (Gmail, Sheets, Drive, Calendar)   | **WORKING** | Via `gog` CLI + credential JSON                           |
| PDF text extraction                            | **WORKING** | `pdftotext` (poppler-utils) in Docker                     |
| OCR for scanned docs                           | **WORKING** | `tesseract-ocr` in Docker                                 |
| Approval workflows                             | **WORKING** | Full pipeline                                             |
| Browser automation                             | **WORKING** | Playwright BrowserRunner                                  |
| External API connectors (CRM, analytics, etc.) | PARTIAL     | Google Ads works; CRM/Zendesk/Stripe are stubs            |
| Report formatting (PDF/HTML/charts)            | MISSING     | Can produce structured data but no formatted output       |
| `ingestPdf()` wiring to CLI tools              | STUB        | Function exists but needs to call `pdftotext`/`tesseract` |

---

## Per-Story Gap Analysis

### US-01: Weekly Website Performance Report

**Google Analytics + SEO analysis + weekly report**

| Requirement          | Status          | Detail                                                                    |
| -------------------- | --------------- | ------------------------------------------------------------------------- |
| Google Analytics API | NEEDS CONNECTOR | `gog` doesn't cover GA; needs GA4 API connector or browser automation     |
| SEO data source      | NEEDS CONNECTOR | No SEO tool integration yet (Search Console could use `gog` OAuth scopes) |
| Weekly schedule      | **WORKING**     | Native cron: `openclaw cron add --cron "0 9 * * MON"`                     |
| Report delivery      | **WORKING**     | Heartbeat delivers to Telegram/Slack/email via Gmail                      |
| Formatted report     | PARTIAL         | Agent can compose Markdown; no charts or PDF generation                   |

**Remaining gap: GA4 API connector. Consider extending `gog` OAuth scopes to include Google Search Console, or browser automation for GA dashboards.**

---

### US-02: Sales Lead Follow-Up

**CRM + LinkedIn + lead scoring + daily Telegram summary**

| Requirement               | Status          | Detail                                                          |
| ------------------------- | --------------- | --------------------------------------------------------------- |
| CRM integration (HubSpot) | STUB            | `log-call-notes-crm` skill has HubSpot param but TODO API calls |
| LinkedIn data enrichment  | NEEDS CONNECTOR | No LinkedIn API                                                 |
| Lead scoring              | EXISTS          | `score-inbound-lead` skill with scoring logic                   |
| Daily schedule            | **WORKING**     | Native cron                                                     |
| Telegram delivery         | **WORKING**     | Heartbeat + Telegram channel                                    |

**Remaining gap: HubSpot API implementation (replace stubs with real calls), LinkedIn API connector.**

---

### US-03: Customer Support Ticket Triage

**Zendesk + knowledge base + auto-reply + Slack escalation**

| Requirement           | Status          | Detail                                                |
| --------------------- | --------------- | ----------------------------------------------------- |
| Zendesk integration   | NEEDS CONNECTOR | `triage-support-email` has TODO for ticketing         |
| Knowledge base lookup | PARTIAL         | Agent has web search tools; no dedicated KB connector |
| Auto-reply via email  | **WORKING**     | `gog gmail send` can send replies                     |
| Classification/triage | EXISTS          | `triage-support-email` skill has classification logic |
| Slack escalation      | **WORKING**     | Slack channel infrastructure works                    |
| Approval gates        | EXISTS          | Support gates in `workflows/gates/support-gates.ts`   |

**Remaining gap: Zendesk API connector. Email auto-reply and Slack escalation already work via platform channels + gog.**

---

### US-04: Invoice Reconciliation

**Accounting software + PO matching + weekly summary + dashboard approval**

| Requirement                 | Status          | Detail                                         |
| --------------------------- | --------------- | ---------------------------------------------- |
| Xero/QuickBooks API         | NEEDS CONNECTOR | No accounting software integration             |
| Invoice PDF parsing         | **WORKING**     | `pdftotext` + `tesseract-ocr` in Docker image  |
| PO matching                 | EXISTS          | `match-invoice-to-po` gate with matching logic |
| Invoice processing workflow | EXISTS          | n8n template at `workflows/templates/finance/` |
| Approval gates              | EXISTS          | Full finance gates                             |
| Dashboard approval UI       | **WORKING**     | Approve/reject with reason prompts             |
| Weekly schedule             | **WORKING**     | Native cron                                    |

**Remaining gap: Accounting API connector (Xero or QuickBooks). Wire `ingestPdf()` to call `pdftotext`. The approval pipeline and matching logic are solid.**

---

### US-05: Social Media Content Calendar

**Social analytics + content drafting + approval before posting**

| Requirement                         | Status           | Detail                                      |
| ----------------------------------- | ---------------- | ------------------------------------------- |
| Social media APIs (IG, X, LinkedIn) | NEEDS CONNECTORS | No social media API integrations            |
| Engagement analytics                | NEEDS CONNECTORS | No analytics ingestion                      |
| Content generation                  | **WORKING**      | Agent generates text natively               |
| Approval before posting             | **WORKING**      | Approval workflow                           |
| Scheduled posting                   | PARTIAL          | Cron can schedule; no social API to post to |

**Remaining gap: Social media API connectors (Meta Graph API, X API, LinkedIn API). Content generation and approval already work.**

---

### US-06: Competitor Price Monitoring

**Web scraping + catalog comparison + Telegram alerts + pricing suggestions**

| Requirement            | Status      | Detail                                                     |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| Web scraping           | **WORKING** | Playwright BrowserRunner can navigate and extract data     |
| Scheduled monitoring   | **WORKING** | Native cron for daily runs                                 |
| Telegram alerts        | **WORKING** | Heartbeat + Telegram delivery                              |
| Price comparison logic | PARTIAL     | Agent can reason about prices; no structured catalog model |
| Pricing suggestions    | **WORKING** | Agent can analyze and suggest                              |

**Remaining gap: Minimal. BrowserRunner needs to be used for general scraping (currently purpose-built for Google Ads). Agent can handle comparison logic natively. This story is closest to being fully achievable today.**

---

### US-07: Employee Onboarding Checklist

**HRIS trigger + account provisioning + training + meeting scheduling + status dashboard**

| Requirement                             | Status          | Detail                                            |
| --------------------------------------- | --------------- | ------------------------------------------------- |
| HRIS integration (BambooHR/Gusto)       | NEEDS CONNECTOR | No HR system integration                          |
| Account provisioning (Google Workspace) | PARTIAL         | `gog` can manage some Google Workspace operations |
| Meeting scheduling                      | **WORKING**     | `gog calendar` creates events                     |
| Status tracking                         | **WORKING**     | Control plane run tracking                        |
| HR approval gates                       | EXISTS          | `workflows/gates/people-gates.ts`                 |
| Webhook trigger                         | EXISTS          | Webhook receiver with HMAC verification           |

**Remaining gap: HRIS connector (BambooHR/Gusto API). Google Workspace provisioning partially covered by gog. Calendar scheduling works.**

---

### US-08: Infrastructure Health Digest

**Datadog/Grafana + CI/CD correlation + anomaly detection + Slack digest**

| Requirement                 | Status          | Detail                                                         |
| --------------------------- | --------------- | -------------------------------------------------------------- |
| Datadog/Grafana API         | NEEDS CONNECTOR | No monitoring API integration                                  |
| CI/CD data (GitHub Actions) | PARTIAL         | Agent has GitHub CLI access; no structured pipeline data model |
| Morning digest schedule     | **WORKING**     | Native cron                                                    |
| Slack delivery              | **WORKING**     | Slack channel infrastructure                                   |
| Health digest wrapper       | EXISTS          | `daily-system-health-digest` workflow with types               |
| Ops approval gates          | EXISTS          | `workflows/gates/ops-gates.ts`                                 |

**Remaining gap: Monitoring API connector (Datadog/Grafana). The scheduling, delivery, and workflow framework are ready.**

---

### US-09: Weekly Financial Dashboard

**Stripe + bank feed + transaction categorization + Google Sheets + email report**

| Requirement                | Status          | Detail                                     |
| -------------------------- | --------------- | ------------------------------------------ |
| Stripe API                 | NEEDS CONNECTOR | No Stripe integration                      |
| Bank feed (Plaid)          | NEEDS CONNECTOR | No Plaid integration                       |
| Transaction categorization | **WORKING**     | Agent can categorize natively              |
| Google Sheets              | **WORKING**     | `gog sheets` reads/writes spreadsheet data |
| Email delivery             | **WORKING**     | `gog gmail send`                           |
| Weekly schedule            | **WORKING**     | Native cron                                |
| Cashflow types             | EXISTS          | `weekly-cashflow-snapshot` wrapper         |
| Budget variance gates      | EXISTS          | Finance gates                              |

**Remaining gap: Stripe and Plaid API connectors. Spreadsheet access, email, and scheduling all work via gog + cron.**

---

### US-10: Legal Document Review Pipeline

**Google Drive watch + contract extraction + terms comparison + task creation**

| Requirement                  | Status          | Detail                                     |
| ---------------------------- | --------------- | ------------------------------------------ |
| Google Drive file watching   | **WORKING**     | `gog drive` can list/search/download files |
| PDF/document parsing         | **WORKING**     | `pdftotext` + `tesseract-ocr` in Docker    |
| Key term extraction          | **WORKING**     | Agent can analyze contract text natively   |
| Standard terms comparison    | **WORKING**     | Agent can compare against template         |
| Task creation (Asana/Linear) | NEEDS CONNECTOR | No PM tool API                             |
| File storage                 | EXISTS          | Artifact store for results                 |

**Remaining gap: PM tool connector (Asana/Linear API). The core pipeline (Drive → PDF parse → AI analysis → comparison) is achievable with existing tools.**

---

## Revised Summary

### Stories achievable TODAY (with existing platform capabilities)

| Story                                 | Feasibility | What's needed                                                                              |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| **US-06** Competitor Price Monitoring | **HIGH**    | Use BrowserRunner for scraping + cron + Telegram delivery                                  |
| **US-10** Legal Document Review       | **HIGH**    | gog drive + pdftotext + agent analysis (only missing PM tool for task creation)            |
| **US-04** Invoice Reconciliation      | **MEDIUM**  | pdftotext for invoices + existing PO matching + approval pipeline (missing accounting API) |
| **US-03** Support Ticket Triage       | **MEDIUM**  | Email triage via gog gmail + classification skill + Slack escalation (missing Zendesk)     |

### Stories needing one API connector

| Story                                | Missing Connector          |
| ------------------------------------ | -------------------------- |
| **US-01** Website Performance Report | Google Analytics 4 API     |
| **US-02** Sales Lead Follow-Up       | HubSpot API (replace stub) |
| **US-08** Infra Health Digest        | Datadog or Grafana API     |
| **US-09** Weekly Financial Dashboard | Stripe API                 |

### Stories needing multiple connectors

| Story                           | Missing Connectors                     |
| ------------------------------- | -------------------------------------- |
| **US-05** Social Media Calendar | Meta Graph API + X API + LinkedIn API  |
| **US-07** Employee Onboarding   | BambooHR/Gusto API + provisioning APIs |

## Priority Recommendations

### P0 — Wire existing tools

1. **Wire `ingestPdf()` to `pdftotext`/`tesseract`** — The function exists as a stub. Shell out to the CLI tools now in the Docker image.
2. **Install `gog` in Docker image** — Add gogcli to the Dockerfile so Google Workspace access works in containers.

### P1 — Add high-value API connectors

3. **HubSpot API** — Replace the stub in `log-call-notes-crm` with real API calls. Enables US-02.
4. **Stripe API** — Transaction and payment data. Enables US-09.
5. **Zendesk API** — Ticket CRUD. Enables US-03.
6. **Google Analytics 4 API** — Extend gog OAuth or add dedicated connector. Enables US-01.

### P2 — Report polish

7. **Report formatter** — Markdown → HTML with basic charts (for email-friendly reports).
8. **Datadog/Grafana API** — Monitoring data pull. Enables US-08.
