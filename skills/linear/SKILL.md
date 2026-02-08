---
name: linear
description: Manage Linear issues, projects, and teams via the Linear GraphQL API.
homepage: https://developers.linear.app/docs
metadata:
  {
    "openclaw":
      { "emoji": "🔷", "requires": { "bins": ["jq", "curl"], "env": ["LINEAR_API_KEY"] } },
  }
---

# Linear Skill

Manage issues, projects, cycles, and teams in Linear.

## Setup

1. Go to Linear > Settings > API > Personal API keys
2. Create a new key with appropriate label
3. Set environment variable:
   ```bash
   export LINEAR_API_KEY="lin_api_xxxxxxxx"
   ```

## Auth

All requests are POST to the GraphQL endpoint:

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "..."}'
```

## Teams

### List teams

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id name key } } }"}' | jq '.data.teams.nodes'
```

## Issues

### List recent issues

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(first: 20, orderBy: createdAt) { nodes { id identifier title state { name } priority assignee { name } createdAt } } }"}' | jq '.data.issues.nodes[] | {id: .identifier, title, status: .state.name, priority, assignee: .assignee.name}'
```

### Search issues

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "query($q: String!) { searchIssues(term: $q, first: 10) { nodes { identifier title state { name } priority } } }", "variables": {"q": "search term"}}' | jq '.data.searchIssues.nodes'
```

### Get issue details

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "query($id: String!) { issue(id: $id) { identifier title description state { name } priority priorityLabel assignee { name email } project { name } labels { nodes { name } } createdAt updatedAt } }", "variables": {"id": "ISSUE-UUID"}}' | jq '.data.issue'
```

### Create an issue

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier title url } } }", "variables": {"input": {"teamId": "TEAM-UUID", "title": "Contract review: Vendor ABC", "description": "Review vendor contract for non-standard terms.\n\n**Key deviations found:**\n- Payment terms: Net-60 (our standard: Net-30)\n- Liability cap: $50k (our standard: $100k)\n- Auto-renewal: 2 years (our standard: 1 year)", "priority": 2}}}' | jq '.data.issueCreate.issue'
```

### Update issue status

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier title state { name } } } }", "variables": {"id": "ISSUE-UUID", "input": {"stateId": "STATE-UUID"}}}' | jq
```

### Add a comment to an issue

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body } } }", "variables": {"input": {"issueId": "ISSUE-UUID", "body": "Automated analysis complete. See attached report."}}}' | jq
```

### Assign an issue

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }", "variables": {"id": "ISSUE-UUID", "input": {"assigneeId": "USER-UUID"}}}' | jq
```

### Add labels to an issue

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }", "variables": {"id": "ISSUE-UUID", "input": {"labelIds": ["LABEL-UUID-1", "LABEL-UUID-2"]}}}' | jq
```

## Workflow States

### List workflow states for a team

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }", "variables": {"teamId": "TEAM-UUID"}}' | jq '.data.team.states.nodes'
```

## Projects

### List projects

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects(first: 20) { nodes { id name state progress { scope completed } } } }"}' | jq '.data.projects.nodes'
```

## Labels

### List labels

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issueLabels(first: 50) { nodes { id name color } } }"}' | jq '.data.issueLabels.nodes'
```

## Notes

- Linear uses UUIDs for all entity IDs internally; human-readable identifiers like `ENG-123` are in the `identifier` field
- Priority values: 0 (No priority), 1 (Urgent), 2 (High), 3 (Medium), 4 (Low)
- Workflow state types: triage, backlog, unstarted, started, completed, canceled
- Rate limit: 1,500 requests per hour per API key
- Pagination: use `first`, `last`, `before`, `after` cursor-based pagination
- All text fields support Markdown
- Always confirm before creating issues or changing status
