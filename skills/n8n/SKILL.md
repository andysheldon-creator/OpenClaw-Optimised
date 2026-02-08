---
name: n8n
description: Manage n8n workflows, executions, credentials, webhooks, tags, and variables via the n8n REST API. Deploy workflow templates and compose multi-step automations.
homepage: https://docs.n8n.io/api/
metadata:
  {
    "openclaw":
      {
        "emoji": "🔄",
        "requires": { "bins": ["jq", "curl"], "env": ["N8N_BASE_URL", "N8N_API_KEY"] },
      },
  }
---

# n8n Workflow Engine Skill

Manage n8n workflows, executions, credentials, webhooks, tags, and variables. Deploy workflow templates from the repo. Compose multi-step automations using Clawdbot custom nodes.

## Setup

Inside the Clawdbot Docker stack both env vars are auto-configured:

- `N8N_BASE_URL` defaults to `http://n8n:5678/workflows`
- `N8N_API_KEY` is passed through from the host

For an external n8n instance:

1. Open n8n Settings > API > Create API Key
2. Copy the key (starts with `n8n_api_`)
3. Set environment variables:

```bash
export N8N_BASE_URL="https://your-n8n.example.com"
export N8N_API_KEY="n8n_api_xxxxxxxx"
```

## Auth

All requests use the `X-N8N-API-KEY` header:

```bash
-H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json"
```

Base URL for all API calls is `$N8N_BASE_URL/api/v1`.

## Workflows

### List workflows

```bash
curl -s "$N8N_BASE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, name, active}'
```

### Get a workflow by ID

```bash
curl -s "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

### Create a workflow

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Workflow",
    "nodes": [
      {
        "name": "Start",
        "type": "n8n-nodes-base.start",
        "position": [250, 300],
        "parameters": {},
        "typeVersion": 1
      }
    ],
    "connections": {},
    "settings": { "executionOrder": "v1" }
  }' | jq '{id: .id, name: .name}'
```

### Update a workflow

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "settings": {"executionOrder": "v1"}}' | jq
```

### Delete a workflow

```bash
curl -s -X DELETE "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

### Activate a workflow

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": true}' | jq '{id: .id, active: .active}'
```

### Deactivate a workflow

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": false}' | jq '{id: .id, active: .active}'
```

### Execute a workflow manually

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/workflows/{workflowId}/run" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": {"key": "value"}}' | jq '{executionId: .data.executionId}'
```

## Executions

### List all executions

```bash
curl -s "$N8N_BASE_URL/api/v1/executions?limit=20&includeData=false" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, finished, status, workflowId: .workflowData.id}'
```

### List executions for a workflow

```bash
curl -s "$N8N_BASE_URL/api/v1/executions?workflowId={workflowId}&limit=10" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, finished, status, startedAt}'
```

### Get execution with full data

```bash
curl -s "$N8N_BASE_URL/api/v1/executions/{executionId}?includeData=true" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

### Retry a failed execution

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/executions/{executionId}/retry" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

### Delete an execution

```bash
curl -s -X DELETE "$N8N_BASE_URL/api/v1/executions/{executionId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

## Credentials

### List credential types (schema discovery)

```bash
curl -s "$N8N_BASE_URL/api/v1/credential-types" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {name: .name, displayName: .displayName}'
```

### List stored credentials

```bash
curl -s "$N8N_BASE_URL/api/v1/credentials" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, name, type}'
```

### Create a credential

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/credentials" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API Key",
    "type": "httpHeaderAuth",
    "data": {
      "name": "Authorization",
      "value": "Bearer sk_live_xxx"
    }
  }' | jq '{id: .id, name: .name, type: .type}'
```

### Delete a credential

```bash
curl -s -X DELETE "$N8N_BASE_URL/api/v1/credentials/{credentialId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

## Webhooks

### Trigger a production webhook

Production webhooks are active only when the workflow is activated:

```bash
curl -s -X POST "$N8N_BASE_URL/webhook/{webhook-path}" \
  -H "Content-Type: application/json" \
  -d '{"event": "new_lead", "email": "jane@example.com"}' | jq
```

### Trigger a test webhook

Test webhooks work while the workflow is open in the n8n editor with "Listen for test event" active:

```bash
curl -s -X POST "$N8N_BASE_URL/webhook-test/{webhook-path}" \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "data": "sample"}' | jq
```

### URL patterns

| Context                     | URL pattern                                      |
| --------------------------- | ------------------------------------------------ |
| Docker internal             | `http://n8n:5678/workflows/webhook/{path}`       |
| Docker external (via nginx) | `http://localhost:8080/workflows/webhook/{path}` |
| Test mode                   | Replace `/webhook/` with `/webhook-test/`        |

## Tags

### List tags

```bash
curl -s "$N8N_BASE_URL/api/v1/tags" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, name}'
```

### Create a tag

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/tags" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "production"}' | jq '{id: .id, name: .name}'
```

### Tag a workflow

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tags": [{"id": "{tagId}"}]}' | jq '{id: .id, tags: [.tags[].name]}'
```

## Variables

### List variables

```bash
curl -s "$N8N_BASE_URL/api/v1/variables" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data'
```

### Create a variable

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/variables" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key": "CRM_BASE_URL", "value": "https://crm.example.com/api"}' | jq
```

### Update a variable

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/variables/{variableId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value": "https://crm-v2.example.com/api"}' | jq
```

### Delete a variable

```bash
curl -s -X DELETE "$N8N_BASE_URL/api/v1/variables/{variableId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq
```

## Deploying Templates

Workflow templates live in `workflows/templates/` in this repo. Deploy them to n8n via the API.

### Deploy a single template

```bash
curl -s -X POST "$N8N_BASE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflows/templates/sales/lead-intake.json | jq '{id: .id, name: .name}'
```

### Deploy and activate

```bash
WF_ID=$(curl -s -X POST "$N8N_BASE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflows/templates/sales/lead-intake.json | jq -r '.id')

curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/$WF_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": true}' | jq '{id: .id, name: .name, active: .active}'
```

### Batch deploy all templates

```bash
for tpl in workflows/templates/**/*.json; do
  echo "Deploying $tpl..."
  curl -s -X POST "$N8N_BASE_URL/api/v1/workflows" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d @"$tpl" | jq '{id: .id, name: .name}'
done
```

## Clawdbot Custom Nodes

The `n8n-nodes-clawdbot` package provides three custom node types available inside the Docker stack.

### clawdbotSkill

Invoke a registered Clawdbot skill by name.

| Parameter   | Type   | Default    | Description                                   |
| ----------- | ------ | ---------- | --------------------------------------------- |
| `skillName` | string | (required) | Name of the skill to invoke                   |
| `input`     | string | `""`       | JSON string passed to the skill as input data |

Node type: `n8n-nodes-clawdbot.clawdbotSkill`

```json
{
  "name": "Enrich Lead",
  "type": "n8n-nodes-clawdbot.clawdbotSkill",
  "position": [650, 250],
  "parameters": {
    "skillName": "lead-enrichment",
    "input": "={{ JSON.stringify($json) }}"
  }
}
```

### clawdbotApprovalGate

Pause workflow execution until a human approves or rejects via the Clawdbot dashboard.

| Parameter         | Type    | Default  | Description                                           |
| ----------------- | ------- | -------- | ----------------------------------------------------- |
| `approverRole`    | string  | `""`     | Role required to approve. Empty = any authorised user |
| `timeoutMinutes`  | number  | `1440`   | Minutes before auto-expiry (default 24h)              |
| `includeSnapshot` | boolean | `true`   | Attach current item data to the approval request      |
| `onRejection`     | options | `"stop"` | `stop` / `continue` / `error`                         |
| `onTimeout`       | options | `"stop"` | `stop` / `approve` / `reject`                         |

Node type: `n8n-nodes-clawdbot.clawdbotApprovalGate`

```json
{
  "name": "Manager Approval",
  "type": "n8n-nodes-clawdbot.clawdbotApprovalGate",
  "position": [1050, 200],
  "parameters": {
    "approverRole": "sales-manager",
    "timeoutMinutes": 480,
    "includeSnapshot": true,
    "onRejection": "stop",
    "onTimeout": "stop"
  }
}
```

### clawdbotArtifact

Store a file, screenshot, or transcript as a run artifact.

| Parameter      | Type   | Default    | Description                                                        |
| -------------- | ------ | ---------- | ------------------------------------------------------------------ |
| `artifactType` | string | (required) | Type of artifact: `document`, `screenshot`, `transcript`, `report` |
| `label`        | string | `""`       | Human-readable label for the artifact                              |

Node type: `n8n-nodes-clawdbot.clawdbotArtifact`

```json
{
  "name": "Store Invoice Artifact",
  "type": "n8n-nodes-clawdbot.clawdbotArtifact",
  "position": [650, 400],
  "parameters": {
    "artifactType": "document",
    "label": "={{ 'invoice-' + $json.invoice_number }}"
  }
}
```

## Composing Workflows

Full worked example: create a webhook-triggered workflow that receives a support request, classifies it via a Clawdbot skill, routes high-priority tickets through an approval gate, and sends a notification.

### Step 1: Create the workflow

```bash
WORKFLOW=$(cat <<'WFJSON'
{
  "name": "Support Escalation Pipeline",
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "support-escalation",
        "responseMode": "onReceived"
      },
      "typeVersion": 1
    },
    {
      "name": "Classify Ticket",
      "type": "n8n-nodes-clawdbot.clawdbotSkill",
      "position": [450, 300],
      "parameters": {
        "skillName": "ticket-classifier",
        "input": "={{ JSON.stringify({ subject: $json.subject, body: $json.body }) }}"
      },
      "typeVersion": 1
    },
    {
      "name": "Is High Priority?",
      "type": "n8n-nodes-base.if",
      "position": [650, 300],
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.priority }}",
              "operation": "equals",
              "value2": "high"
            }
          ]
        }
      },
      "typeVersion": 1
    },
    {
      "name": "Escalation Approval",
      "type": "n8n-nodes-clawdbot.clawdbotApprovalGate",
      "position": [850, 250],
      "parameters": {
        "approverRole": "support-lead",
        "timeoutMinutes": 60,
        "includeSnapshot": true,
        "onRejection": "continue",
        "onTimeout": "approve"
      },
      "typeVersion": 1
    },
    {
      "name": "Send Notification",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1050, 300],
      "parameters": {
        "method": "POST",
        "url": "https://hooks.slack.com/services/T00/B00/xxx",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "text", "value": "={{ 'Ticket escalated: ' + $json.subject }}" }
          ]
        }
      },
      "typeVersion": 1
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{"node": "Classify Ticket", "type": "main", "index": 0}]]
    },
    "Classify Ticket": {
      "main": [[{"node": "Is High Priority?", "type": "main", "index": 0}]]
    },
    "Is High Priority?": {
      "main": [
        [{"node": "Escalation Approval", "type": "main", "index": 0}],
        [{"node": "Send Notification", "type": "main", "index": 0}]
      ]
    },
    "Escalation Approval": {
      "main": [[{"node": "Send Notification", "type": "main", "index": 0}]]
    }
  },
  "settings": { "executionOrder": "v1" }
}
WFJSON
)

WF_ID=$(echo "$WORKFLOW" | curl -s -X POST "$N8N_BASE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- | jq -r '.id')

echo "Created workflow: $WF_ID"
```

### Step 2: Activate

```bash
curl -s -X PATCH "$N8N_BASE_URL/api/v1/workflows/$WF_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": true}' | jq '{id: .id, active: .active}'
```

### Step 3: Test via webhook

```bash
curl -s -X POST "$N8N_BASE_URL/webhook/support-escalation" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Server down", "body": "Production API returning 503 errors"}' | jq
```

### Step 4: Check execution result

```bash
curl -s "$N8N_BASE_URL/api/v1/executions?workflowId=$WF_ID&limit=1&includeData=true" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[0] | {id, finished, status}'
```

## Notes

- **Docker URLs:** Inside the Docker stack, services reach n8n at `http://n8n:5678/workflows`. External clients use `http://localhost:8080/workflows` (via the nginx reverse proxy).
- **Pagination:** List endpoints accept `limit` (max 250) and `cursor` parameters. Follow `nextCursor` in the response to page through results.
- **Execution data:** Pass `includeData=true` to include full node input/output in execution responses. Omit it for lightweight listings.
- **Webhook activation:** Production webhooks (`/webhook/`) only respond when the workflow is active. Use `/webhook-test/` during development (requires the editor "Listen for test event" to be active).
- **Connection format:** n8n connections use node names (not IDs) as keys. Each output maps to an array of arrays: `"NodeName": {"main": [[{...}], [{...}]]}` where each inner array represents an output branch.
- **Credential data:** Credential values are write-only via the API. GET requests return metadata but never the stored secret values.
- **Rate limits:** The n8n public API does not enforce rate limits by default, but the nginx proxy may apply connection limits depending on configuration.
