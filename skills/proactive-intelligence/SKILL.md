---
name: proactive-intelligence
description: Tools for proactive data analysis and insight generation.
---

# Proactive Intelligence Skill

This skill allows the agent to process batches of information (like logs, chat history, or activity feeds) to proactively find insights, rather than just reacting to a specific query.

## Tools

### `analyze_recent_activity`

Analyzes a list of strings (activities) to find patterns or anomalies.

**Arguments:**

- `activities` (string[]): The data to analyze.
- `focus_area` (string, optional): "anomalies", "patterns", "summary", "actionable_insights".

**Returns:**

- Structured findings based on the focus area.
