# Test Data Fixtures

Shared, realistic test data for use across unit tests, integration tests, and development workflows. All data uses obviously fake identities (Acme Corp, Jane Doe, etc.) and `.example.com` domains -- never commit real PII or credentials here.

Related: GitHub Issue [#12](https://github.com/openclaw/openclaw/issues/12) (RF-011).

## Directory Structure

```
fixtures/
  emails/            Sample email fixtures (plain text and HTML)
  web-pages/         Sample HTML pages for scraping/parsing tests
  csv/               Tabular data files (contacts, invoices, catalogs)
  api-responses/     JSON payloads representing external API responses
```

## Usage in Tests

Import fixtures by path relative to the repo root. With Vitest (the project test runner), you can read fixtures using Node's `fs` module or a helper:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read a JSON fixture
const crmLead = JSON.parse(
  readFileSync(resolve(__dirname, "../../fixtures/api-responses/crm-lead.json"), "utf-8"),
);

// Read a plain-text fixture
const emailBody = readFileSync(
  resolve(__dirname, "../../fixtures/emails/lead-inquiry.txt"),
  "utf-8",
);
```

If you prefer a helper that resolves from the repo root:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readFixture(relativePath: string): string {
  return readFileSync(path.join(repoRoot, "fixtures", relativePath), "utf-8");
}

// Usage
const pricingHtml = readFixture("web-pages/pricing-page.html");
const contacts = readFixture("csv/contacts.csv");
```

## Available Fixtures

### emails/

| File                         | Description                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `lead-inquiry.txt`           | Plain-text inbound sales inquiry from a prospect (Jane Doe, Acme Corp)         |
| `support-ticket.html`        | HTML-formatted support ticket about webhook failures (Bob Smith, Widget Works) |
| `newsletter-unsubscribe.txt` | Plain-text newsletter/digest with unsubscribe headers                          |

### web-pages/

| File                   | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `company-about.html`   | Company "About Us" page with leadership team, locations, and key facts |
| `pricing-page.html`    | SaaS pricing page with three tiers, toggle, and FAQ section            |
| `product-listing.html` | Product catalog page with multiple product cards and specs             |

### csv/

| File                  | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `contacts.csv`        | 10 sample CRM contacts with names, emails, companies, and lead status |
| `invoices.csv`        | 8 sample invoices with line items, tax, and payment status            |
| `product-catalog.csv` | 10 products spanning hardware, software, services, and spare parts    |

### api-responses/

| File                               | Description                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `crm-lead.json`                    | Full CRM lead record with contact, company, deal, and activity history            |
| `enrichment-result.json`           | Data enrichment API response with person, company, and intent signals             |
| `marketing-plan-sandbox.json`      | Sandbox marketing plan fixture with campaign, ad group, keyword, and ad mutations |
| `control-plane-operator-flow.json` | Operator lifecycle fixture for skill/workflow mutation E2E harness                |
| `webhook-event.json`               | Inbound webhook event payload (`message.received` type)                           |

## Guidelines

- **Fake data only.** Use `.example.com` domains, `555-xxx-xxxx` phone numbers, and fictional company names.
- **Keep fixtures self-contained.** Each file should be usable independently without external dependencies.
- **Add new fixtures freely.** Place them in the appropriate subdirectory and update this README.
- **Do not duplicate test/fixtures.** The existing `test/fixtures/` directory holds test-harness-specific fixtures (e.g., child process stubs). This top-level `fixtures/` directory is for shared, realistic sample data.
