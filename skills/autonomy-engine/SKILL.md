---
name: autonomy-engine
description: Tools for autonomous goal assessment and planning.
---

# Autonomy Engine Skill

This skill equips the agent with meta-cognitive tools to evaluate its own progress and plan future actions. It is designed to be used in "thought loops" or long-running tasks.

## Tools

### `assess_goal_progress`

Forces the agent to explicitly evaluate its state against defined success criteria.

**Arguments:**

- `goal` (string): The objective.
- `context` (string): Current situation summary.
- `success_criteria` (string[]): List of requirements for success.

### `plan_next_moves`

A utility to signal the intent to formulate a multi-step plan.

**Arguments:**

- `objective` (string): What needs to be achieved.
- `constraints` (string[]): Limitations.
