---
name: implicit-feedback
description: Utilities for detecting implicit feedback through semantic analysis.
---

# Implicit Feedback Skill

This skill provides tools to analyze semantic similarity between texts. It is primarily used to detect when a user is correcting the agent, repeating instructions, or providing implicit feedback that might not be explicitly stated as "feedback".

## Utilities

### `semantic_compare`

Calculates the cosine similarity between two text strings using embeddings.

**Arguments:**

- `text1` (string): The first text.
- `text2` (string): The second text.
- `threshold` (number, optional): Similarity threshold (default 0.8).

**Returns:**

- `similarity` (number): Score between 0 and 1.
- `is_similar` (boolean): True if score >= threshold.
- `interpretation` (string): Human-readable level (High/Medium/Low).

## Dependencies

- Uses OpenClaw's internal embedding provider configuration (supports OpenAI, Gemini, Local).
