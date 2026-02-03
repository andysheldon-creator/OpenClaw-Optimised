# Component 6: Overseer Integration

The Overseer bridge connects the existing goal/task hierarchy with the knowledge graph,
turning goals and tasks into first-class graph nodes and enabling dependency-aware planning
via graph queries.

---

## 6A. Goal-Entity Linking

**Purpose:** Bridge the Overseer's goal/task hierarchy (`src/infra/overseer/`) with the
knowledge graph so that goals, tasks, and subtasks become graph nodes with relationships
to extracted entities.

**File:** `src/knowledge/overseer-bridge.ts` (new)

### How It Works

When the Overseer creates or updates a goal (`OverseerGoalRecord`), the bridge:

1. **Creates a `goal` entity node** in the knowledge graph:

   ```
   entity_id: "goal-{goalId}"
   name: goal.title
   type: "goal"
   description: goal.problemStatement
   ```

2. **Creates `task` entity nodes** for each task/subtask in the plan:

   ```
   entity_id: "task-{taskId}"
   name: task.title
   type: "task"
   description: task.description
   ```

3. **Runs entity extraction** on `goal.problemStatement` + `goal.successCriteria` to
   discover which existing entities the goal relates to (e.g. "Refactor the Auth
   Service" → discovers link to existing "Auth Service" entity).

4. **Creates relationships:**

   | Relationship   | Type                                   | Example                                   |
   | -------------- | -------------------------------------- | ----------------------------------------- |
   | Goal → Task    | `has_task`                             | "Auth Refactor" → "Update JWT signing"    |
   | Task → Subtask | `has_subtask`                          | "Update JWT signing" → "Migrate to RS256" |
   | Task → Entity  | `references`, `depends_on`, `modifies` | "Update JWT signing" → "Auth Service"     |
   | Goal → Goal    | `blocks`, `depends_on`                 | "Auth Refactor" → "API Migration"         |

### Sync Mechanism

The bridge listens to Overseer lifecycle events:

```typescript
export function createOverseerBridge(params: {
  overseer: OverseerStore;
  graphEngine: GraphQueryEngine;
  extractor: EntityExtractor;
}): OverseerBridge {
  return {
    onGoalCreated(goal: OverseerGoalRecord): Promise<void>;
    onGoalUpdated(goal: OverseerGoalRecord): Promise<void>;
    onTaskStatusChanged(goalId: string, taskId: string, status: string): Promise<void>;
    syncAll(): Promise<void>;  // full re-sync (e.g. after reindex)
  };
}
```

When a goal is created or updated, the bridge:

1. Upserts the goal entity node
2. Upserts task/subtask entity nodes
3. Extracts entity mentions from goal text fields
4. Creates/updates relationships

### What This Enables

- **"What goals reference the Auth Service?"** -- graph query finds all goal nodes
  connected to the Auth Service entity
- **"Show me all tasks that modify files in `src/memory/`"** -- graph query finds task
  nodes related to file entities matching that path
- **"What's blocking the API Migration?"** -- graph traversal follows `blocks`
  relationships from the goal node
- **Cross-session goal awareness** -- even if a goal was created in a different session,
  its graph connections persist and are discoverable

---

## 6B. Dependency-Aware Planning

**Purpose:** Enable the Overseer planner to query the knowledge graph when decomposing
goals into tasks, discovering implicit dependencies that would otherwise be missed.

### Enhanced Planning Flow

When the planner (`src/infra/overseer/planner.ts`) creates a new plan:

1. **Extract entities** from the goal's problem statement and success criteria
2. **Query the graph** for related entities and their neighborhoods
3. **Discover existing goals/tasks** that touch the same entities
4. **Surface these as potential dependencies or conflicts** in the plan context

### Example

A user creates a goal: "Add two-factor authentication to the login flow."

Without graph integration, the planner generates tasks based solely on the goal text.

With graph integration, the planner:

1. Extracts entities: "two-factor authentication", "login flow"
2. Queries the graph and discovers:
   - "Login Flow" entity is connected to "Auth Service" (part_of)
   - "Auth Service" has an active goal "Auth Refactor" (status: in_progress)
   - "Auth Service" depends on "OAuth Provider"
3. Surfaces in the plan context:
   - "Note: 'Auth Service' is currently being refactored (goal: Auth Refactor, in progress).
     The 2FA task may need to coordinate with or wait for the refactor."
   - "Note: Login Flow is part of Auth Service, which depends on OAuth Provider.
     Consider whether 2FA affects the OAuth flow."

### Implementation

The planner receives graph context as an additional input section in its planning prompt:

```typescript
// In planner.ts, when building the planning prompt:
if (graphEngine) {
  const goalEntities = await extractor.extractEntities(goal.problemStatement);
  const relatedContext = await graphEngine.getNeighborhood(
    goalEntities.map(e => e.id),
    { maxHops: 2 }
  );
  const activeGoals = relatedContext.entities
    .filter(e => e.type === "goal")
    .map(e => /* format as planning context */);

  planningPrompt += `\n\n## Related Knowledge Graph Context\n${formatForPlanner(relatedContext, activeGoals)}`;
}
```

This transforms the Overseer from a flat task tracker into a dependency-aware planner
that can reason about the broader project context when decomposing work.

---

## Files to Create

- `src/knowledge/overseer-bridge.ts` -- goal/task graph node sync

## Files to Modify

- `src/infra/overseer/planner.ts` -- inject graph context into planning prompt
- `src/infra/overseer/store.types.ts` -- optional `entityIds` field on goal/task records
- `src/infra/overseer/runner.ts` -- call bridge on goal/task lifecycle events
