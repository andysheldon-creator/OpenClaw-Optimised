# Candidate Feature List — OpenClaw Skills & Capabilities

Research date: February 2026
Source: ClawHub registry (5,705+ skills), awesome-openclaw-skills, community discussions, security research

This document evaluates candidate features for integration into OpenClaw-Optimised, assessed against a single goal: **building a multimillion-pound platform software creation business**. Every feature is scored on implementation effort, business impact, and strategic alignment across the full software delivery lifecycle — from ideation through to production security.

---

## Strategic Framework

Your business needs AI-augmented capability across the entire platform delivery chain:

```
IDEATION → DEFINITION → ARCHITECTURE → ENGINEERING → TESTING → SECURITY → DEPLOYMENT → MONITORING → ITERATION
```

Each candidate below is mapped to one or more of these stages. Features are grouped into **tiers**:

- **Tier 1 — Must Have** — directly enables revenue-generating platform delivery
- **Tier 2 — High Value** — significant competitive advantage or efficiency gain
- **Tier 3 — Nice to Have** — useful but not blocking revenue

---

## Tier 1 — Must Have (Revenue-Critical)

### 1. Product Definition & Ideation Agent

**What it does:** Dedicated Board of Directors agent (or skill) that takes a rough product idea and produces a structured PRD (Product Requirements Document) with user stories, acceptance criteria, market positioning, and technical constraints.

**Existing ecosystem:**
- `idea-coach` skill — AI-powered idea/problem manager with GitHub integration
- `marketing-mode` skill — bundles 23 marketing skills including strategy frameworks
- Notion integration — roadmap management, feature request tracking from customer feedback

**Implementation assessment:**
- Effort: **Medium** (2-3 days) — build as a new Board agent personality or a standalone skill that chains Research + Strategy + Content agents
- Dependencies: Board of Directors system (already built), Notion skill (install from ClawHub)
- Approach: Create a `board/product.soul.md` personality with PRD templates, lean canvas, jobs-to-be-done frameworks. Wire into the Board meeting flow so Research provides market data, Finance provides unit economics, and Critic stress-tests assumptions.

**Business impact:** ★★★★★
Every platform you build starts here. A 30-minute Board meeting that produces a PRD with market validation, user stories, and acceptance criteria replaces 2-3 days of manual discovery. At 10+ platforms per year, this saves 20-30 days annually and improves hit rate by forcing structured thinking before code.

---

### 2. Software Architecture Agent

**What it does:** Takes a PRD and produces a technical architecture document — system design, API contracts, database schema, service boundaries, technology choices, and deployment topology. Validates against non-functional requirements (scale, security, cost).

**Existing ecosystem:**
- `backend-patterns` skill — backend architecture patterns and API design
- `add-project` skill — scaffolds projects in a monorepo following conventions
- Community discussion: "DEV Task Board — Multi-Agent Project Management" (GitHub Discussion #3135)

**Implementation assessment:**
- Effort: **Medium** (3-4 days) — new Board agent personality + architecture skill with templates
- Dependencies: Board of Directors system, PRD from Feature #1
- Approach: Create an `architect` agent personality that specialises in: system decomposition, API-first design (OpenAPI), database schema (ERD → DDL), infrastructure topology (Docker/K8s), and cost estimation. Feed it the PRD and it produces architecture decision records (ADRs), C4 diagrams (as Mermaid), and API specs.

**Business impact:** ★★★★★
Architecture mistakes are the most expensive failures in platform development. Getting this right at the start means faster delivery, lower rework, and more maintainable systems. For a business building multiple platforms, consistent architecture patterns across projects create compound efficiency gains — engineers move between projects without re-learning.

---

### 3. Security Engineering & Threat Modelling Agent

**What it does:** Automated security assessment across the full lifecycle: threat modelling during architecture, SAST during development, dependency auditing on every commit, DAST against staging, and OWASP compliance checking before release.

**Existing ecosystem:**
- `security-audit` skill — comprehensive security auditing for deployments
- `skill-vetting` skill — vet ClawHub skills for security before installation
- OpenClaw Safety Scanner — built into v2026.2.6 (credential redaction, code analysis)
- Semgrep integration — AI-assisted SAST, SCA, secrets detection
- MAESTRO Framework — 7-layer agentic AI threat model applied to OpenClaw
- OWASP Top 10 for Agentic Applications (Dec 2025)
- `openclaw-security-monitor` — proactive security monitoring for deployments

**Implementation assessment:**
- Effort: **Medium-High** (4-5 days) — combines a Board agent personality with external tool integrations
- Dependencies: Semgrep CLI, npm audit, OWASP ZAP (already in our DevSecOps pipeline), GitHub Actions
- Approach: Create a `security` Board agent that:
  1. During architecture: runs STRIDE/MAESTRO threat modelling against the architecture doc
  2. During development: triggers Semgrep SAST scans, reviews dependency audit results
  3. Pre-release: orchestrates OWASP ZAP DAST scans against staging
  4. Ongoing: monitors CVE feeds for dependencies in use
  Wire into the existing CI pipeline (`.github/workflows/security.yml`).

**Business impact:** ★★★★★
For a platform business handling customer data and payments, security is non-negotiable. A breach at any client platform destroys trust across all your platforms. Automated threat modelling catches design-level vulnerabilities that code scanning misses. This is also a **sales differentiator** — "security built in from day one" wins enterprise contracts.

---

### 4. Full-Stack Engineering Skills (Code Generation + Scaffolding)

**What it does:** Scaffolds complete platform projects from architecture docs — monorepo setup, service boilerplate, API stubs, database migrations, CI/CD pipelines, Dockerfile, and deployment manifests. Generates working code from specifications.

**Existing ecosystem:**
- `add-project` skill — scaffolds projects in a monorepo with conventions
- `skill-exporter` — exports skills as standalone deployable microservices
- `docker-essentials` skill — Docker commands and container workflows
- `kubernetes-ops` skill — K8s cluster operations and deployments
- `cursor-agent` skill — Cursor CLI agent integration for code editing
- `debug-pro` skill — systematic debugging methodology

**Implementation assessment:**
- Effort: **High** (5-7 days) — project templates + scaffolding skill + CI/CD generation
- Dependencies: Existing Board agents, GitHub skill, Docker
- Approach: Build a `platform-scaffold` skill that takes an architecture doc and generates:
  1. Monorepo structure (Turborepo/Nx)
  2. Service boilerplate (Next.js, Express, Fastify — configurable)
  3. Database schema + migrations (Prisma/Drizzle)
  4. API layer (tRPC or REST with OpenAPI)
  5. Auth scaffolding (Clerk, Auth.js, or custom)
  6. CI/CD pipeline (GitHub Actions)
  7. Docker + docker-compose for local dev
  8. Deployment manifests (Vercel, Railway, or K8s)

**Business impact:** ★★★★★
This is where the £millions live. If you can go from PRD → architecture → working scaffold in hours instead of weeks, you can deliver platforms at 5-10x the rate of traditional agencies. The scaffolding enforces your standards (security, testing, observability) from the start, so quality is built in rather than bolted on.

---

### 5. Testing & QA Automation Agent

**What it does:** Generates and maintains test suites — unit tests from code, integration tests from API specs, E2E tests from user stories, load tests from NFRs. Monitors test coverage and quality gates.

**Existing ecosystem:**
- Built-in Playwright browser automation (uses accessibility tree, not CSS selectors)
- `selenium-automation` skill — web testing via Selenium
- E2E testing guide — natural-language E2E tests using OpenClaw browser automation
- Jest/Vitest already in our DevSecOps pipeline
- ClawHub testing skills (community-built, various maturity levels)

**Implementation assessment:**
- Effort: **Medium** (3-4 days) — Board agent personality + test generation skill
- Dependencies: Jest/Vitest (already configured), Playwright (already configured), architecture docs
- Approach: Create a `qa-engineer` Board agent that:
  1. Reads user stories → generates Playwright E2E tests
  2. Reads API specs → generates integration tests
  3. Reads function signatures → generates unit test stubs
  4. Monitors coverage reports → identifies untested critical paths
  5. Generates load test scripts (k6 or Artillery) from NFRs
  Wire into CI so the QA agent reviews coverage on every PR.

**Business impact:** ★★★★★
Testing is the bottleneck in most platform builds. Automated test generation from specs means every feature ships with tests from day one. For a business delivering multiple platforms, this is the difference between "works on demo day" and "works in production for 3 years". Clients pay premiums for reliability.

---

### 6. GitHub & CI/CD Integration

**What it does:** Full GitHub lifecycle automation — PR creation and review, issue management, CI/CD monitoring, deployment triggers, release management.

**Existing ecosystem:**
- `github` skill — interact with GitHub using `gh` CLI (official, mature)
- `auto-pr-merger` — automates PR checkout and testing workflow
- `github-pr` — fetch, preview, merge, and test PRs locally
- `gitlab-manager` — GitLab merge request management
- `git-essentials` — version control workflows
- `senior-devops` — comprehensive DevOps for CI/CD and infrastructure

**Implementation assessment:**
- Effort: **Low** (1-2 days) — install existing skills + configure for our workflow
- Dependencies: GitHub CLI (`gh`), existing CI pipeline
- Approach: Install `github` and `senior-devops` skills from ClawHub. Configure PR templates, auto-labelling, and CI status checks. Wire into Board agents so the Architecture agent can create GitHub issues from ADRs, and the QA agent can review PR test coverage.

**Business impact:** ★★★★★
This is the connective tissue. Every other feature feeds into GitHub. Automated PR reviews, CI monitoring, and deployment triggers mean your Board agents don't just produce documents — they execute the full delivery pipeline. This is what makes the system a genuine "software factory" rather than just a planning tool.

---

## Tier 2 — High Value (Competitive Advantage)

### 7. Figma & Design System Integration

**What it does:** Analyses Figma files, extracts design tokens (colours, typography, spacing), audits brand compliance, exports assets, and generates component documentation.

**Existing ecosystem:**
- `figma` skill — professional Figma design analysis and asset export (mature, official)
- `apple-hig` skill — Apple Human Interface Guidelines compliance

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skill + configure
- Dependencies: Figma API key
- Approach: Install the `figma` skill. Feed Figma file URLs to the Content/CMO Board agent for brand compliance checking. Generate design tokens → feed to scaffolding to auto-configure Tailwind/CSS variables.

**Business impact:** ★★★★
Design-to-code is a major bottleneck. Extracting design tokens from Figma and auto-configuring the frontend build system eliminates hours of manual translation. For platforms with complex UI requirements, this bridges the designer-developer gap.

---

### 8. Project Management Integration (Jira/Linear/Asana)

**What it does:** Creates and manages issues, tracks sprints, transitions statuses, pulls sprint velocity data, and syncs with Board agent outputs.

**Existing ecosystem:**
- Jira skill — create issues, transition statuses, JQL search, sprint data (Scrum + Kanban)
- Asana skill — full CRUD via REST API with OAuth
- `pndr` skill — personal productivity with tasks, journal, habits
- DEV Task Board discussion — multi-agent project management (GitHub Discussion #3135)

**Implementation assessment:**
- Effort: **Low-Medium** (2 days) — install skills + build Board integration
- Dependencies: Jira/Linear/Asana account + API token
- Approach: Install Jira or Linear skill. Build a thin integration layer so the Product agent creates epics from PRDs, the Architecture agent creates technical stories from ADRs, and the QA agent creates test stories from test plans. Sprint velocity feeds back to the Finance agent for cost tracking.

**Business impact:** ★★★★
Traceability from idea to deployment. Every requirement links to an issue, every issue links to a PR, every PR links to a deployment. This is what enterprise clients audit. It also means you can accurately estimate future projects based on historical velocity data.

---

### 9. Stripe & Payment Platform Integration

**What it does:** Manages Stripe billing infrastructure — creates products/prices, manages subscriptions, handles webhooks, tracks revenue metrics (MRR, churn, LTV).

**Existing ecosystem:**
- Community-built Stripe skills on ClawHub
- Webhook hooks system (already built in OpenClaw-Optimised) — can receive Stripe events
- `financial-calculator` skill — financial calculations
- `budget-variance-analyzer` skill — budget vs actual cost analysis

**Implementation assessment:**
- Effort: **Medium** (2-3 days) — build custom Stripe skill or install community one + harden
- Dependencies: Stripe API key, webhook endpoint (via Tailscale Funnel or reverse proxy)
- Approach: Build a Stripe skill that the Finance/CFO Board agent uses to track revenue across all client platforms. Creates a dashboard of MRR, churn, LTV per platform. Alerts on anomalies (sudden churn spike, failed payments).

**Business impact:** ★★★★
Most platforms you build will need payments. Having a battle-tested Stripe integration pattern means every new platform gets billing out of the box. The Finance agent tracking revenue across all your client platforms gives you a real-time view of your business health.

---

### 10. SEO & Content Engine

**What it does:** Competitive research, SERP analysis, keyword planning, and optimised content generation with proper structure and internal linking.

**Existing ecosystem:**
- `seo-content-engine` skill — researches real SERPs before writing (mature, highly rated)
- `marketing-mode` skill — 23 bundled marketing skills including SEO
- `ga4-analytics` skill — Google Analytics conversational queries

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skills
- Dependencies: Google Search Console access (optional), GA4 property (optional)
- Approach: Install `seo-content-engine` and `ga4-analytics`. Wire into the Content/CMO Board agent for content strategy. Use for client platform landing pages, documentation, and blog content.

**Business impact:** ★★★★
Every platform needs organic traffic. SEO-optimised landing pages and documentation help client platforms grow. As a service offering, "we build platforms that rank" is a genuine differentiator over agencies that just ship code.

---

### 11. Browser Automation & Web Scraping

**What it does:** AI-driven website navigation, data extraction, competitor monitoring, automated testing, and form filling. Uses accessibility tree instead of brittle CSS selectors.

**Existing ecosystem:**
- Built-in Playwright browser automation (already in OpenClaw-Optimised)
- `browse` skill — browser automation function creation and deployment
- `firecrawl-search` skill — AI-powered web scraping with JavaScript rendering and bot detection
- `selenium-automation` skill — web testing via Selenium

**Implementation assessment:**
- Effort: **Low** (1 day) — already built in, just install complementary skills
- Dependencies: Chrome, Playwright (already configured)
- Approach: Install `firecrawl-search` for advanced scraping. Use for competitive intelligence (pricing, features), market research feeds to Research Board agent, and automated E2E testing.

**Business impact:** ★★★★
Market intelligence is critical for platform positioning. Automated competitor monitoring means your Research agent always has fresh data. Combined with the QA agent, browser automation handles both testing and intelligence gathering.

---

### 12. Google Workspace Integration

**What it does:** Unified Gmail, Calendar, Drive, Contacts, Sheets, and Docs management from a single skill. Multi-account support and automation.

**Existing ecosystem:**
- `gog` skill — Google Workspace all-in-one (Gmail, Calendar, Drive, Contacts, Sheets, Docs)
- Gmail Pub/Sub hooks (already built in OpenClaw-Optimised)

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skill + configure OAuth
- Dependencies: Google Cloud project, OAuth credentials
- Approach: Install `gog` skill. Wire into Board agents: Research agent reads shared docs, Strategy agent manages meeting notes in Drive, General agent manages calendar and email workflows.

**Business impact:** ★★★★
Running a platform business means constant communication — client emails, meeting schedules, shared documents, spreadsheet financials. Having the agent manage Google Workspace means zero context-switching.

---

### 13. Notion Integration (Knowledge Management)

**What it does:** Full CRUD on Notion pages and databases. Creates pages from customer feedback, manages roadmaps, tracks decisions, maintains documentation.

**Existing ecosystem:**
- `notion` skill — official API integration with full database operations (mature)
- Use case: auto-creates Notion pages from customer feedback emails, categorises by topic, updates product roadmap

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skill
- Dependencies: Notion API key
- Approach: Install `notion` skill. Use as the "second brain" for the Board — every PRD, architecture doc, meeting summary, and decision gets stored in Notion. The Product agent maintains roadmaps, the Strategy agent tracks competitive intelligence, the Finance agent tracks budgets.

**Business impact:** ★★★★
A structured knowledge base across all your platforms is what transforms a "person with AI tools" into a "platform business". Historical decisions, client preferences, architecture patterns — all searchable, all linked.

---

## Tier 3 — Nice to Have (Efficiency Gains)

### 14. HubSpot / CRM Integration

**What it does:** Manages contacts, companies, deals, and sales pipeline directly through messaging apps.

**Existing ecosystem:**
- `hubspot-crm` skill — contacts, companies, deals, file associations via REST API

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skill
- Dependencies: HubSpot API key

**Business impact:** ★★★
As the platform business grows, tracking client relationships becomes critical. The Strategy/CEO Board agent monitoring the sales pipeline provides strategic visibility.

---

### 15. Twitter/X & Social Media Presence

**What it does:** Posts, schedules, queues tweets. Engagement analytics. Thread creation.

**Existing ecosystem:**
- `twitter-x-social` skill — mature social media management
- `agentgram-openclaw` skill — AgentGram social network

**Implementation assessment:**
- Effort: **Low** (1 day) — install existing skill
- Dependencies: Twitter/X API key

**Business impact:** ★★★
Founder credibility and thought leadership drive inbound leads. Consistent posting about platform building, AI, and engineering builds authority.

---

### 16. Agent-to-Agent Protocols & Moltbook

**What it does:** Connects your Board agents to the wider AI agent network. Agents can discover, communicate with, and hire other agents for specialised tasks.

**Existing ecosystem:**
- `agentchat` skill — real-time agent-to-agent communication
- `clawork` skill — job board for AI agents
- `clankedin` skill — professional network for AI agents
- Moltbook — social network for AI agents (2.5M agents registered)

**Implementation assessment:**
- Effort: **Medium** (2-3 days) — install skills + configure agent identities
- Dependencies: Moltbook account, agent identity setup

**Business impact:** ★★★
The network effect. Your Board agents can outsource specialised tasks (e.g., hire a legal agent for contract review, a translation agent for localisation). Early positioning in the agent-to-agent economy could become a competitive moat.

---

### 17. Smart Home & IoT Monitoring

**What it does:** Monitors infrastructure hardware, server room sensors, and office automation.

**Existing ecosystem:**
- 56 Smart Home & IoT skills on ClawHub
- `midea-ac` skill — AC control

**Implementation assessment:**
- Effort: **Low** (1 day per integration)
- Dependencies: IoT devices, Home Assistant, or similar

**Business impact:** ★★
Marginal for platform building. Useful for monitoring self-hosted infrastructure.

---

### 18. Voice Reply & Speech Automation

**What it does:** Local text-to-speech, voice message generation, podcast-style content creation.

**Existing ecosystem:**
- `voice-reply` skill — local TTS using Piper voices
- Built-in ElevenLabs integration (already in OpenClaw-Optimised)
- 65 Speech & Transcription skills on ClawHub

**Implementation assessment:**
- Effort: **Low** (already built) — install complementary skills
- Dependencies: ElevenLabs API (already configured)

**Business impact:** ★★
Useful for hands-free status updates and client communication. Not core to platform delivery.

---

## Implementation Roadmap

Prioritised by business impact and dependency order:

### Phase 1: Foundation (Week 1-2)
| # | Feature | Effort | Dependency |
|---|---------|--------|------------|
| 6 | GitHub & CI/CD Integration | 1-2 days | None |
| 12 | Google Workspace Integration | 1 day | None |
| 13 | Notion Integration | 1 day | None |
| 8 | Project Management (Jira/Linear) | 2 days | None |

**Why first:** These are connective tissue. Install existing ClawHub skills, configure API keys, and your Board agents can immediately start managing work across GitHub, Google, Notion, and your project tracker.

### Phase 2: Delivery Engine (Week 3-5)
| # | Feature | Effort | Dependency |
|---|---------|--------|------------|
| 1 | Product Definition Agent | 2-3 days | Board (done), Notion |
| 2 | Software Architecture Agent | 3-4 days | Product Agent |
| 4 | Full-Stack Engineering Skills | 5-7 days | Architecture Agent |
| 5 | Testing & QA Agent | 3-4 days | Engineering Skills |
| 3 | Security Engineering Agent | 4-5 days | Architecture Agent, CI pipeline |

**Why second:** This is the core "software factory" — the pipeline that turns ideas into production platforms. Each agent builds on the previous one's output.

### Phase 3: Growth (Week 6-8)
| # | Feature | Effort | Dependency |
|---|---------|--------|------------|
| 9 | Stripe & Payments | 2-3 days | Engineering Skills |
| 7 | Figma & Design System | 1 day | None |
| 10 | SEO & Content Engine | 1 day | None |
| 11 | Browser Automation (enhanced) | 1 day | None |
| 14 | HubSpot CRM | 1 day | None |

**Why third:** Once you can build platforms, you need to monetise them (Stripe), make them look good (Figma), get them found (SEO), and manage client relationships (CRM).

### Phase 4: Network Effects (Week 9+)
| # | Feature | Effort | Dependency |
|---|---------|--------|------------|
| 15 | Social Media | 1 day | None |
| 16 | Agent-to-Agent Protocols | 2-3 days | Board system |

---

## Total Investment Estimate

| Phase | Features | Total Effort | Cumulative |
|-------|----------|-------------|------------|
| Phase 1 | 4 features | 5-6 days | 1-2 weeks |
| Phase 2 | 5 features | 17-23 days | 5-7 weeks |
| Phase 3 | 5 features | 6-9 days | 7-9 weeks |
| Phase 4 | 2 features | 3-4 days | 8-10 weeks |

**Total: ~31-42 days of implementation across 8-10 weeks**

After Phase 2, you have a functioning AI-powered software factory that can take a product idea and deliver a production-ready platform with tests, security, and CI/CD. That capability alone — the ability to deliver platforms in days instead of months — is what drives the multimillion-pound business.

---

## Security Warnings

Before installing any ClawHub skills, be aware:

- **341 malicious skills** were discovered in the ClawHavoc campaign (Feb 2026) — [The Hacker News](https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html)
- **12% of all ClawHub skills** were found to be malicious by Koi Security
- **7% of skills expose credentials** — [The Register](https://www.theregister.com/2026/02/05/openclaw_skills_marketplace_leaky_security/)
- Always check the **VirusTotal report** before installing any skill
- Use the `skill-vetting` skill to audit before installation
- Review skill source code manually for critical business operations
- Our DevSecOps pipeline includes Semgrep SAST which will catch many supply-chain attacks

**Recommendation:** For Tier 1 features, **build custom skills** rather than trusting community ones for security-critical operations. For Tier 2-3 features, install from ClawHub but audit first.

---

## Sources

- [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) — curated skill directory (3,002+ skills across 36 categories)
- [ClawHub Skills Marketplace](https://clawhub.ai/skills) — official registry (5,705 skills)
- [ClawHub Developer Guide 2026](https://www.digitalapplied.com/blog/clawhub-skills-marketplace-developer-guide-2026) — skill architecture and publishing
- [10 Best OpenClaw Skills for Founders](https://superframeworks.com/articles/best-openclaw-skills-founders) — business-focused skill selection
- [OpenClaw Security Engineer's Cheat Sheet](https://semgrep.dev/blog/2026/openclaw-security-engineers-cheat-sheet/) — Semgrep integration
- [MAESTRO Threat Model for OpenClaw](https://kenhuangus.substack.com/p/openclaw-threat-model-maestro-framework) — 7-layer security analysis
- [OpenClaw Kubernetes Operator](https://openclaw.rocks/blog/openclaw-kubernetes-operator) — enterprise deployment
- [5 Profitable Business Ideas Around OpenClaw](https://superframeworks.com/articles/openclaw-business-ideas-indie-hackers) — monetisation strategies
- [DEV Task Board — Multi-Agent Project Management](https://github.com/openclaw/openclaw/discussions/3135) — community feature discussion
- [E2E Test Automation with OpenClaw](https://jangwook.net/en/blog/en/openclaw-e2e-test-automation-guide/) — testing guide
- [OpenClaw Architecture for Beginners](https://cyberstrategyinstitute.com/openclaw-architecture-for-beginners-jan-2026/) — system architecture overview
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw) — project history and context
