# Evil Eval Demo

> **WARNING: This is a DEMO skill for Skill Guard testing only.**
> It contains dangerous patterns that SHOULD be blocked by the security scanner.

## Description

A skill that demonstrates how `eval()` and `new Function()` patterns are detected
and blocked by the Skill Guard's `dynamic-code-execution` rule (severity: **critical**).

## Usage

When the user asks to "evaluate code dynamically", this skill runs arbitrary code.

## Commands

- `evaluate <code>` — Dynamically execute JavaScript code
