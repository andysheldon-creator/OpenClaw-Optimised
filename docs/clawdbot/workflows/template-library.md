# Template Library

The Clawdbot template library provides ready-to-deploy n8n workflow templates for common business automation scenarios. Templates use Clawdbot custom nodes (skills, approval gates, artifacts) alongside standard n8n nodes.

## Available Templates

### Sales

| Template    | File                                         | Description                                                                                                                                                                                                            |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead Intake | `workflows/templates/sales/lead-intake.json` | Captures leads via webhook, enriches with a Clawdbot skill, scores them, routes high-value leads through a manager approval gate, and pushes qualified leads to the CRM. Lower-scoring leads enter a nurture sequence. |

### Support

| Template      | File                                             | Description                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket Triage | `workflows/templates/support/ticket-triage.json` | Receives tickets via webhook, classifies urgency and category with a Clawdbot skill, routes by priority (critical through low), escalates SLA-breaching tickets through an approval gate, and auto-drafts responses for low-priority items. |

### Finance

| Template           | File                                                  | Description                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invoice Processing | `workflows/templates/finance/invoice-processing.json` | Parses invoice documents with a Clawdbot skill, matches against purchase orders, auto-approves matched invoices, routes discrepancies through a finance review approval gate, and posts approved invoices to the accounting system. |

### Marketing

| Template                   | File                                                               | Description                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing Plan Dry Run     | `workflows/templates/marketing/marketing-plan-dry-run.json`        | Compiles a marketing plan into a deterministic action graph, builds diff artifacts for operator review, and stores preview output without mutating external ad platforms.                               |
| Marketing Plan Live Runner | `workflows/templates/marketing/marketing-plan-live-execution.json` | Runs approved action graphs with adapter branching (`browser` or `cli`), bounded retries for transient failures, escalation for deterministic failures, ledger writes, and replay artifact persistence. |

## Deploying Templates

### From the Dashboard

1. Open the Clawdbot dashboard and navigate to **Workflows**
2. Click **New from Template**
3. Browse or search the template library
4. Select a template and click **Deploy**
5. The workflow opens in the n8n editor for customisation

### From the CLI

```bash
openclaw workflows deploy --template workflows/templates/sales/lead-intake.json
```

Add `--dry-run` to simulate the deployment without creating the workflow:

```bash
openclaw workflows deploy --template workflows/templates/sales/lead-intake.json --dry-run
```

### Via the n8n API

```bash
curl -X POST http://localhost:8080/workflows/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d @workflows/templates/sales/lead-intake.json
```

## Customising a Template

Templates are starting points. After deploying, open the workflow in the n8n editor and:

1. **Update credentials** -- replace `example.com` URLs with your actual service endpoints
2. **Configure webhooks** -- the webhook paths are unique per template; update them if needed
3. **Adjust branching logic** -- modify IF/Switch conditions to match your business rules
4. **Set approval roles** -- change `approverRole` parameters to match your org structure
5. **Connect notification channels** -- update Slack channels, email addresses, etc.

For marketing templates:

1. Confirm dry-run template produces complete proposed mutation output.
2. Confirm live template node bindings map to the expected skill versions.
3. Validate retry and escalation branches in a sandbox before production rollout.

## Testing with Dry Run

Before enabling triggers on a deployed workflow, validate it with dry-run mode:

1. Open the workflow in the n8n editor
2. Click **Simulate** (or use the CLI with `--dry-run`)
3. All external calls are intercepted and replaced with fixture data
4. A banner reads "DRY RUN -- No side effects executed"
5. Review the execution log to confirm the flow behaves as expected

See the dry-run configuration types in `src/clawdbot/workflows/dry-run.ts` for details on fixture loading and side-effect blocking.

## Template Anatomy

Each template JSON file contains standard n8n workflow fields plus Clawdbot metadata:

```json
{
  "name": "Template Name",
  "description": "What this template automates.",
  "area": "sales",
  "version": "1.0.0",
  "nodes": [ ... ],
  "connections": { ... },
  "settings": { "executionOrder": "v1" }
}
```

### Clawdbot Custom Nodes in Templates

- **`n8n-nodes-clawdbot.clawdbotSkill`** -- invokes a registered Clawdbot skill. Set the `skillName` parameter to the skill's registered name.
- **`n8n-nodes-clawdbot.clawdbotApprovalGate`** -- pauses execution for human approval. Configure `approverRole`, `timeoutMinutes`, and rejection/timeout behaviour.
- **`n8n-nodes-clawdbot.clawdbotArtifact`** -- stores a file or document as a run artifact for audit and review.

## Creating a New Template

1. Build the workflow in the n8n visual editor
2. Export it: **Workflow menu** > **Download**
3. Add the metadata fields (`name`, `description`, `area`, `version`) to the JSON
4. Place the file in the appropriate subdirectory under `workflows/templates/`
5. Validate with dry-run mode
6. Submit a PR following the project's [PR guidelines](/help/submitting-a-pr)

## Gap Analysis

Use the gap analysis tool to identify which business areas lack template coverage:

```typescript
import { generateGapReport } from "../clawdbot/workflows/index.js";

const templates = loadTemplateMetadata(); // reads workflows/templates/**/*.json
const gaps = generateGapReport(templates);

for (const gap of gaps) {
  console.log(`[${gap.priority}] ${gap.area}: ${gap.desiredState} (effort: ${gap.effortEstimate})`);
}
```

See `src/clawdbot/workflows/gap-analysis.ts` for the full type definitions and the list of desired capabilities.

## Related

- [Workflows Guide](/clawdbot/workflows/guide)
- [Embedded n8n Setup](/clawdbot/workflows/embedded-n8n-setup)
- [Architecture Overview](/clawdbot/architecture/overview)
