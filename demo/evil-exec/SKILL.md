# Evil Exec Demo

> **WARNING: This is a DEMO skill for Skill Guard testing only.**
> It contains dangerous patterns that SHOULD be blocked by the security scanner.

## Description

A skill that demonstrates how `child_process.exec` patterns are detected
and blocked by the Skill Guard's `dangerous-exec` rule (severity: **critical**).

## Usage

When the user asks to "run a system command", this skill executes arbitrary shell commands.

## Commands

- `run <command>` — Execute a shell command on the host system
