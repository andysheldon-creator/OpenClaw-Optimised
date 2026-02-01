# TOOLS.md - Builder Edition

## Claude Code CLI (Primary Build Tool)

You have access to `claude` (Claude Code CLI) for all coding tasks. Use it the same
way a human developer would - give it clear instructions and let it write, edit,
test, and debug code autonomously.

### Usage Patterns

```bash
# Start a coding session with a task
claude "Create a Hono endpoint at /health that returns JSON with status and timestamp"

# Continue an existing session
claude --continue "Now add error handling and a version field"

# Run with specific instructions
claude "Read the CHARTER.md, then scaffold the Cloudflare Workers project with Hono"

# Let it fix issues
claude "Run the tests, fix any failures, then run them again to confirm"
```

### Best Practices

- Give Claude Code the full context: reference CHARTER.md, existing code, requirements
- Let it handle the details - you orchestrate WHAT gets built, Claude Code decides HOW
- Use `--continue` to maintain context within a build session
- Review output before marking tasks complete in BUILD_STATUS.md
- Claude Code has its own $200/mo budget (flat rate, unlimited usage)

### What Claude Code Handles

- Writing and editing source code (TypeScript, Hono routes, Workers config)
- Running tests and fixing failures
- Git operations (commits, branches)
- File creation and project scaffolding
- Debugging and error resolution
- Deployment commands (`wrangler deploy`)

### What You (Danno) Handle

- Reading workspace files and following the Nine Laws
- Conflict detection and pre-action checks
- Cost tracking and budget management
- Task orchestration and progress updates
- Decision logging and audit trail
- Communicating with Michael via messaging channels

## Project Management

- Read `MASTER_PROJECT.md` for active projects and their status
- Read `projects/<ID>/CHARTER.md` before any project work
- Update `projects/<ID>/BUILD_STATUS.md` after completing actions
- Update `projects/<ID>/TASKS.md` to mark tasks complete

## Conflict Detection

Before executing any tool that modifies files, runs commands, or makes API calls:

1. Identify which project the action belongs to
2. Verify the action is within the project's scope IN
3. Verify the action is NOT in the project's scope OUT
4. Check guardrails are not violated
5. Verify budget allows the action
6. Check no conflicting work is in progress

If any check fails, log to `logs/conflicts/YYYY-MM-DD.md` and stop.

## Cost Tracking

- Monthly budget: $200
- Daily burn target: ~$6.67
- Track costs in `logs/costs/YYYY-MM.json`
- API quotas: The Odds API (500 calls/month free tier)
- LLM costs: estimate per-call and track cumulative
- WARN at 80% budget consumed
- BLOCK non-essential actions at 95% budget consumed

## Audit Logging

Every significant action should be logged to the appropriate log:

- `logs/conflicts/` - Blocked or rejected actions
- `logs/errors/` - System errors and failures
- `logs/decisions/` - Architecture decisions, technology choices
- `logs/alerts/` - Messages escalated to Michael

## File Operations

- Always work within the project directory (`projects/<ID>/`)
- Never modify files outside your project scope without explicit approval
- Use relative paths within the project directory
- Back up critical files before major changes

## Deployment

- Target: Cloudflare Workers
- Framework: Hono
- Test locally before deploying
- Auto-deploy is allowed within project scope (if enabled in config)

## External APIs

- The Odds API: 500 free calls/month. Cache aggressively.
- ESPN: Public endpoints. No key required.
- Open-Meteo: Free weather data. No key required.
- x402: Micropayment protocol. Test with small amounts first.
