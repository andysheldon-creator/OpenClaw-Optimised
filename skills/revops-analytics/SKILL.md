---
name: revops-analytics
description: Tools for Revenue Operations analytics and event tracking.
---

# RevOps Analytics Skill

This skill provides capabilities to track key business events and query performance metrics, enabling the agent to exhibit awareness of business context and goals.

## Tools

### `track_event`

Logs a specific event to the analytics system.

**Arguments:**

- `event_name` (string): The name of the event.
- `properties` (object): Arbitrary key-value details.
- `timestamp` (string, optional): ISO timestamp.

### `get_kpi_metrics`

Retrieves high-level metrics (mocked).

**Arguments:**

- `metric_type` (string): 'pipeline_value', 'conversion_rate', 'deals_closed', 'activity_volume'.
- `period` (string): 'day', 'week', 'month', 'quarter'.
