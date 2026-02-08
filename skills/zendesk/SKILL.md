---
name: zendesk
description: Manage Zendesk Support tickets, users, and organizations via the Zendesk REST API.
homepage: https://developer.zendesk.com/api-reference/
metadata:
  {
    "openclaw":
      {
        "emoji": "🎫",
        "requires":
          {
            "bins": ["jq", "curl"],
            "env": ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
          },
      },
  }
---

# Zendesk Skill

Manage support tickets, users, and organizations in Zendesk Support.

## Setup

1. Go to Zendesk Admin > Channels > API
2. Enable Token Access and create an API token
3. Set environment variables:
   ```bash
   export ZENDESK_SUBDOMAIN="yourcompany"    # from yourcompany.zendesk.com
   export ZENDESK_EMAIL="agent@company.com"  # your Zendesk agent email
   export ZENDESK_API_TOKEN="xxxxxxxxxxxx"
   ```

## Auth

All requests use Basic auth with email/token:

```bash
-u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" -H "Content-Type: application/json"
```

Base URL: `https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2`

## Tickets

### List recent tickets

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets?sort_by=created_at&sort_order=desc&per_page=25" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.tickets[] | {id, subject, status, priority, created_at, requester_id}'
```

### Get a ticket with comments

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}?include=comment_count" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.ticket | {id, subject, description, status, priority, tags, created_at, updated_at}'
```

### Get ticket comments (conversation thread)

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}/comments" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.comments[] | {id, body, author_id, created_at, public}'
```

### Search tickets

```bash
curl -s -G "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/search" \
  --data-urlencode "query=type:ticket status:open priority:high" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.results[] | {id, subject, status, priority}'
```

### Search tickets by date range

```bash
curl -s -G "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/search" \
  --data-urlencode "query=type:ticket created>2026-01-01 created<2026-02-01" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq
```

### Create a ticket

```bash
curl -s -X POST "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticket":{"subject":"Order not received","comment":{"body":"Customer reports order #12345 has not arrived after 10 days."},"priority":"high","tags":["shipping","escalation"],"requester":{"name":"Jane Doe","email":"jane@example.com"}}}' | jq
```

### Reply to a ticket (public comment)

```bash
curl -s -X PUT "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticket":{"comment":{"body":"Hi Jane, I have looked into your order and it is currently in transit. Expected delivery is tomorrow.","public":true},"status":"pending"}}' | jq
```

### Add an internal note (private comment)

```bash
curl -s -X PUT "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticket":{"comment":{"body":"Checked with logistics - package delayed at customs. Escalating to shipping team.","public":false}}}' | jq
```

### Update ticket status/priority

```bash
curl -s -X PUT "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticket":{"status":"solved","priority":"normal","tags":["resolved","shipping"]}}' | jq
```

### Assign a ticket

```bash
curl -s -X PUT "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/tickets/{ticketId}" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticket":{"assignee_id":{agentId}}}' | jq
```

## Users

### Search users

```bash
curl -s -G "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/users/search" \
  --data-urlencode "query=jane@example.com" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.users[] | {id, name, email, role}'
```

### List agents

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/users?role=agent&per_page=50" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.users[] | {id, name, email}'
```

## Views (saved ticket filters)

### List views

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/views" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.views[] | {id, title, active}'
```

### Get tickets in a view

```bash
curl -s "https://$ZENDESK_SUBDOMAIN.zendesk.com/api/v2/views/{viewId}/tickets" \
  -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq '.tickets[] | {id, subject, status, priority}'
```

## Notes

- Rate limit: 700 requests per minute (Enterprise), 400 (Professional), 200 (Team)
- Pagination: use `?page=` or `?per_page=` (max 100)
- Search query syntax: `type:ticket status:open priority:urgent assignee:agent@co.com`
- Ticket statuses: new, open, pending, hold, solved, closed
- Priorities: urgent, high, normal, low
- Comments with `"public":true` are visible to the requester; `"public":false` are internal notes
- Always confirm before replying to tickets or changing status
