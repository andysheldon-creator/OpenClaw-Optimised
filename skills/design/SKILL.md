---
name: design
description: "System and UX design skill. Covers architecture decisions, API design, database modeling, and user experience patterns."
metadata: { "openclaw": { "emoji": "📐", "always": true, "skillKey": "design" } }
user-invocable: true
---

# Skill: Design

Architecture, API, database, and UX design.

## Design Types

### System Architecture

- Component boundaries
- Service communication
- Data flow
- Scalability considerations

### API Design

- RESTful conventions
- Request/response schemas
- Error handling patterns
- Versioning strategy

### Database Design

- Schema modeling
- Relationships
- Indexing strategy
- Migration planning

### UX Design

- User flows
- Information architecture
- Interaction patterns
- Accessibility

## Architecture Decision Record (ADR)

```markdown
# ADR-NNN: [Title]

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Context

What is the issue we're deciding about?

## Decision

What did we decide?

## Consequences

What are the trade-offs? Positive and negative.

## Alternatives Considered

What other options were evaluated and why rejected?
```

## API Design Template

````markdown
## Endpoint: [METHOD] /api/v1/[resource]

### Purpose

[What this endpoint does]

### Authentication

[Required | Optional | Public]

### Request

```json
{
  "field1": "type",
  "field2": "type"
}
```
````

### Response (200)

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Responses

| Status | Code           | Message                  |
| ------ | -------------- | ------------------------ |
| 400    | INVALID_INPUT  | Validation failed        |
| 401    | UNAUTHORIZED   | Missing or invalid token |
| 403    | FORBIDDEN      | Insufficient permissions |
| 404    | NOT_FOUND      | Resource not found       |
| 500    | INTERNAL_ERROR | Server error             |

````

## Database Schema Template

```markdown
## Table: [table_name]

### Purpose
[What this table stores]

### Columns
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Last update |

### Indexes
| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| pk_[table] | id | PRIMARY | Primary key |
| idx_[table]_[col] | [col] | BTREE | Query optimization |

### Relationships
| Relation | Table | Type | On Delete |
|----------|-------|------|-----------|
| belongs_to | users | FK | CASCADE |
````

## UX Design Checklist

### User Flows

- [ ] Entry points identified
- [ ] Happy path documented
- [ ] Error states handled
- [ ] Edge cases considered

### States

- [ ] Loading state
- [ ] Empty state
- [ ] Error state
- [ ] Success state
- [ ] Disabled state

### Accessibility (WCAG 2.1 AA)

- [ ] Color contrast >= 4.5:1
- [ ] Focus states visible
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Touch targets >= 44px

### Responsiveness

- [ ] Mobile (375px)
- [ ] Tablet (768px)
- [ ] Desktop (1024px)
- [ ] Wide (1440px)

## Delegation

```typescript
// Architecture design
sessions_spawn({
  task: "Design the system architecture for real-time order updates. Consider WebSocket vs SSE, scaling, and failure handling.",
  agentId: "system-architect",
  model: "anthropic/claude-opus-4-5",
  label: "Real-time Architecture",
});

// API design
sessions_spawn({
  task: "Design RESTful API for the orders module. Include CRUD operations, filtering, pagination, and WebSocket for updates.",
  agentId: "backend-architect",
  model: "anthropic/claude-opus-4-5",
  label: "Orders API Design",
});

// Database design
sessions_spawn({
  task: "Design the database schema for the trading module. Include orders, positions, and P&L tracking. Use DECIMAL for financial data.",
  agentId: "database-engineer",
  model: "anthropic/claude-sonnet-4-5",
  label: "Trading DB Schema",
});

// UX design
sessions_spawn({
  task: "Design the user flow for the order creation wizard. Include validation, confirmation, and error handling.",
  agentId: "ux-designer",
  model: "anthropic/claude-sonnet-4-5",
  label: "Order Wizard UX",
});
```
