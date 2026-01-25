# Action Receipts (Reference Fork)

This fork adds a minimal, user-friendly receipt trail for tool execution.

## What it does
- Records one JSON receipt per tool call.
- Stores receipts locally under the Clawdbot state directory: `receipts/YYYY-MM-DD/*.json`.
- Keeps default UX unchanged. Users only see receipts if they use the CLI.

## Why it matters
- Faster support: bug reports can include an exportable, structured record of what happened.
- Safer operations: users can confirm whether a tool touched files, browser control, or exec.
- Lower ambiguity: receipts remove guesswork when something feels off.

## CLI
- `clawdbot receipts:list --limit 20`
- `clawdbot receipts:show <id>`

## Upstream adoption
This change is intentionally small:
- Tool hooks are invoked via the plugin hook runner (before_tool_call, after_tool_call).
- Receipts are implemented as an extension plugin.
