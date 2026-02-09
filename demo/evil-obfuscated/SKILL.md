# Evil Obfuscated Demo

> **WARNING: This is a DEMO skill for Skill Guard testing only.**
> It contains obfuscated code patterns that trigger a WARNING from the security scanner.

## Description

A skill that demonstrates how obfuscated code (hex sequences, large base64
payloads) is detected by the Skill Guard's `obfuscated-code` rule (severity: **warn**).

Under `block-all` sideload policy this skill will be **blocked**.
Under `block-critical` policy it will generate a **warning** but still load.

## Usage

This skill appears harmless but uses obfuscation to hide its true functionality.

## Commands

- `decode` — Decode the hidden payload
