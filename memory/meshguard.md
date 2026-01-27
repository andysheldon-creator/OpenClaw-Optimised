# MeshGuard — Complete Reference

> **What:** Governance control plane for enterprise AI agent meshes
> **Who:** David Hurley (founder), WithCandor LLC
> **Contact:** david@meshguard.app
> **Founded:** January 2026

## Core Thesis

Agents will proliferate inside every enterprise app and workflow. Governance, identity, permissioning, and auditability become the monetization layer — similar to how identity, API management, and endpoint security became mandatory control planes for cloud.

MeshGuard solves: **"Who authorized this agent, what can it do, and who's responsible when things go wrong?"**

## Key Features

1. **Agent Identity & Enrollment** — Cryptographic credentials, IdP integration, trust tiers (unverified → verified → trusted → internal)
2. **Policy Engine** — Declarative YAML rules enforced at runtime by gateway
3. **Private Skill Registry** — Signing, review, rollout controls
4. **Capability Surfaces** — Read/write/execute boundaries for skills
5. **Delegation Protocol** — Permission ceilings, depth limits, signed receipts for agent-to-agent calls
6. **DLP Enforcement** — Cross-boundary data loss prevention and redaction
7. **Unified Audit** — Correlation across all agent calls, immutable logs, trace IDs
8. **Alerting** — Webhook, Slack, email notifications for policy events

## Business Model

- **Starter:** $2K/mo or $19,200/yr (50 agents, 100K checks/mo, email support)
- **Professional:** $10K/mo or $96,000/yr (500 agents, 1M checks/mo, SSO, dedicated support)
- **Enterprise:** Custom (unlimited agents, on-premise, SLA, custom integrations)
- Stripe billing via WithCandor LLC

## Moats

- Capability surfaces + signed receipts = switching costs
- Private skill registries = automation library lock-in
- Trust graph + delegation metadata = hard to replicate
- Clawdbot open source = distribution, MeshGuard = monetization

---

## Repositories (github.com/meshguard)

### meshguard (Gateway) — PRIVATE
- **Path:** ~/Git/meshguard
- **Tech:** Bun + Hono, TypeScript
- **What:** Core gateway server — policy engine, audit logger, identity management, proxy middleware, alerting, signup, billing
- **Src modules:** `src/identity/`, `src/policy/`, `src/audit/`, `src/alerts/`, `src/email/`, `src/gateway/`, `src/cli/`
- **Routes:** /health, /admin, /signup, /billing, /azure (marketplace), /proxy/* (governed proxy)
- **Dashboard:** `dashboard/` (React admin UI)
- **Docs in repo:** ALERTING.md, QUICKSTART.md, GETTING_STARTED.md, MULTI_TENANCY_SCOPE.md, azure-marketplace-listing.md
- **Integration docs in repo:** `docs/integrations/` (autogpt, langchain, crewai, generic)

### meshguard-app (Marketing Site) — PRIVATE
- **Path:** ~/Git/meshguard-app
- **Tech:** Next.js 15, Tailwind CSS v4, Vercel
- **Domain:** meshguard.app
- **Pages:** /, /pricing, /roadmap, /changelog, /terms, /privacy, /security, /partners, /azure
- **Scout:** AI chat demo agent (GPT-4o-mini, streaming) — `app/api/chat/route.ts`
  - Interactive demos: delegation flow, comparison tables, trust tiers, audit log, email capture, signup form, investor download
  - Trigger phrases: "Run delegation demo", "Compare to Okta", "Show trust tiers", "Show audit log", "Early access", "Investor resources"
- **Public assets:** logo.png, MeshGuard-Pitch-Deck-v3.pdf, MeshGuard-One-Pager.pdf, MeshGuard-One-Pager.html, sitemap.xml, robots.txt
- **Brand:** Navy #0A2540, Teal #00D4AA, Slate #64748B, Inter font, terminal/CLI dark aesthetic
- **Env:** OPENAI_API_KEY (Vercel dashboard)

### meshguard-docs (Technical Docs) — PUBLIC
- **Path:** ~/Git/meshguard-docs
- **Tech:** VitePress
- **Domain:** docs.meshguard.app
- **Guides (10):** what-is-meshguard, quickstart, getting-started, identity, policies, audit, alerting, billing, enterprise, self-hosted
- **Integrations (13):** overview, langchain, crewai, autogpt, semantic-kernel, clawdbot, claude-code, openai-agents, bedrock, vertex-ai, python, javascript, http
- **API Reference (5):** overview, authentication, gateway, admin, billing
- **Total:** ~28 pages

### meshguard-learn (Learning Center) — PUBLIC
- **Path:** ~/Git/meshguard-learn
- **Tech:** VitePress
- **Domain:** learn.meshguard.app
- **Guides (15):** governing-langchain-agents, securing-crewai, rate-limiting-autogpt, governing-clawdbot-agents, governing-claude-code-agents, governing-openai-agents, governing-bedrock-agents, governing-vertex-ai-agents, governing-microsoft-copilot, customer-service-agent, preventing-prompt-injection, meshguard-for-small-business, personal-vs-enterprise-governance + index
- **Concepts (7):** what-is-agent-governance, trust-tiers, delegation-chains, audit-logs, least-privilege, policy-design-patterns + index
- **Comparisons (7):** vs-opa, vs-langchain-guardrails, vs-constitutional-ai, vs-azure-content-safety, vs-descope, vs-microsoft-purview + index
- **Total:** ~29 pages

### meshguard-examples — PUBLIC
- **Path:** ~/Git/meshguard-examples
- **Examples (7):**
  - `langchain-customer-service/` — Tiered permissions, governed tools, mock CRM/orders/payments, Docker, tests
  - `autogpt-governed/` — Rate limiting, circuit breaker, cost tracking, sandbox/production policies
  - `crewai-research-team/` — Multi-agent crew with per-agent policies, delegation control
  - `claude-code-dev-assistant/` — Pre/post tool hooks, 3 policy profiles (dev-assistant, code-reviewer, ci-agent), setup script
  - `openai-agents-support/` — OpenAI Agents SDK with governed tool calls and handoffs
  - `bedrock-data-analyst/` — AWS Bedrock agent with data access governance
  - `vertex-ai-multiagent/` — Google Vertex AI multi-agent with governance

### meshguard-python (Python SDK) — PUBLIC
- **Path:** ~/Git/meshguard-python
- **Package:** `pip install meshguard` (PyPI v0.1.1)
- **Modules:** client.py, exceptions.py, langchain.py (governed_tool decorator, GovernedToolkit)

### meshguard-js (JavaScript SDK) — PUBLIC
- **Path:** ~/Git/meshguard-js
- **Package:** `npm install meshguard` (npm v0.1.1)
- **Modules:** client.ts, types.ts, exceptions.ts, langchain.ts

### meshguard-dotnet (.NET SDK) — PUBLIC
- **Path:** ~/Git/meshguard-dotnet
- **Packages:** MeshGuard + MeshGuard.SemanticKernel
- **Key classes:** MeshGuardClient.cs, Models.cs, MeshGuardFilter.cs (IFunctionInvocationFilter), ServiceCollectionExtensions.cs
- **Requires:** .NET 8+, Semantic Kernel 1.x

### homebrew-meshguard (Homebrew Tap) — PUBLIC
- **Path:** ~/Git/homebrew-meshguard
- **Install:** `brew install meshguard/tap/meshguard`
- **Files:** Formula/meshguard.rb, bin/meshguard, completions (bash/zsh)

---

## Infrastructure

### Digital Ocean Droplet (157.230.224.227)
- **Gateway:** Docker container on port 3100, nginx proxy → dashboard.meshguard.app
- **Gatus (status page):** Docker container on port 3200, nginx proxy → status.meshguard.app
- **Monitors:** 11 endpoints
- **Nginx routes:** /admin, /signup, /proxy, /health, /billing → gateway
- **Env vars:** SMTP (PurelyMail) + Stripe configured in Docker run command

### Vercel (auto-deploy from GitHub)
- meshguard.app → meshguard-app repo
- docs.meshguard.app → meshguard-docs repo
- learn.meshguard.app → meshguard-learn repo
- DNS managed via Vercel DNS

### Email (PurelyMail)
- support@meshguard.app
- security@meshguard.app
- contact@meshguard.app
- DNS: MX, SPF, DKIM (3 keys), DMARC configured
- Passwords in 1Password (MeshGuard vault)

### Stripe (WithCandor LLC)
- Products: Starter ($2K/mo), Professional ($10K/mo), both with 20% annual discount
- Gateway handles: /billing/checkout, /billing/portal, /billing/plans, /billing/webhook
- API key in 1Password (MeshGuard vault)

---

## Domains & URLs

| URL | What | Hosted On |
|-----|------|-----------|
| meshguard.app | Marketing site + Scout demo | Vercel |
| docs.meshguard.app | Technical documentation | Vercel |
| learn.meshguard.app | Learning center + comparisons | Vercel |
| status.meshguard.app | Uptime monitoring (Gatus) | DO Droplet |
| dashboard.meshguard.app | Gateway API | DO Droplet |

## Social & Accounts

| Platform | Handle/URL |
|----------|-----------|
| Twitter/X | @MeshGuardApp |
| LinkedIn | linkedin.com/company/meshguard |
| GitHub | github.com/meshguard (org) |
| npm | meshguard@0.1.1 |
| PyPI | meshguard 0.1.1 |
| Homebrew | meshguard/tap/meshguard |

## 1Password Vault (MeshGuard)

- PurelyMail: support@, security@, contact@ passwords
- PyPI API Token
- Stripe Live API Key (WithCandor)

---

## Assets

- **Logos:** ~/meshguard/ (full, icon, reversed PNG)
- **Pitch Deck:** meshguard-app/public/MeshGuard-Pitch-Deck-v3.pdf
- **One-Pager:** meshguard-app/public/MeshGuard-One-Pager.pdf + .html
- **Technical Architecture Doc:** https://drive.google.com/file/d/1C5zy4SapcslMBIbIyTHDDK-N8KNQ9t4L/view

---

## Roadmap

### ✅ Shipped (Jan 2026)
- Governance Gateway (policy enforcement, audit logging)
- Python SDK + JavaScript SDK + CLI
- Self-service signup with plan tiers
- Dashboard UI (agents, policies, audit explorer)
- Documentation site (24+ pages)
- Learning center (25+ articles)
- Status page (11 endpoints monitored)
- Welcome onboarding emails
- security.txt + security page
- .NET SDK + Semantic Kernel integration
- Stripe billing integration
- Azure Marketplace SaaS routes
- Professional email (PurelyMail)
- GitHub org (meshguard/) with 9 repos

### 🚧 In Progress (Q1 2026)
- Webhook alert integrations (Slack, PagerDuty)
- SSO / OAuth login (Google, GitHub)
- Policy templates marketplace
- SDK for Go and Rust
- Granular RBAC
- Agent-to-agent delegation chains
- CLI policy validation & dry-run mode
- **New integrations shipped (Jan 26):** Claude Code, Amazon Bedrock, Google Vertex AI, OpenAI Agents SDK — all with docs, learn guides, examples, and sidebar links

### 📋 Planned (Q2 2026)
- SOC 2 Type II certification
- Multi-region deployment (US-East, EU-West)
- Real-time policy playground
- GitHub Actions integration
- Terraform provider
- OpenTelemetry traces export
- Compliance report generator

### 💡 Exploring
- On-premise / self-hosted edition
- HIPAA & ISO 27001 compliance
- AI-powered policy suggestions
- Agent behavior anomaly detection
- GraphQL API
- Multi-cloud agent discovery
- Community marketplace for policies

---

## Competitive Landscape

### Content Filtering (complementary, not competitive)
- **Bedrock Guardrails** — Toxicity, PII, denied topics (content layer only)
- **Azure Content Safety** — Content moderation
- **Constitutional AI** — Behavior shaping

### Identity (adjacent)
- **Descope** — Human identity; MeshGuard = agent identity
- **Okta** — Human IAM; MeshGuard = agent IAM

### Data Governance (different scope)
- **Microsoft Purview** — Data governance; MeshGuard = agent governance
- **OPA** — Generic policy engine; MeshGuard = purpose-built for AI agents

### Agent Frameworks (integration targets, not competitors)
- LangChain / LangGraph — Agent orchestration
- CrewAI — Multi-agent crews
- AutoGPT — Autonomous agents
- Microsoft Semantic Kernel — Enterprise AI framework
- Amazon Bedrock Agents — AWS agent platform
- Google Vertex AI / ADK / A2A — Google agent platform
- OpenAI Agents SDK — OpenAI agent framework
- Salesforce Agentforce — Enterprise CRM agents
- IBM watsonx Orchestrate — Enterprise AI orchestration

---

## Key Decisions

- Self-hosted = Professional/Enterprise only, requires license agreement
- Code is NOT open source — private repos for gateway + marketing
- Email: PurelyMail (full send/receive, not just forwarding)
- Status page on separate droplet from Vercel (independence)
- SDKs, docs, learn, examples = PUBLIC repos
- Gateway, marketing site = PRIVATE repos
- All MeshGuard repos in ~/Git/, NOT in ~/clawd/ (keep workspaces separate)

---

*Last updated: January 26, 2026*
