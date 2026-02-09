# Code Review: Text2SQL (PostgreSQL read-only) skill

**Base:** 7b2a22121  
**Head:** 2f6c1ea9c  
**Range:** 9 commits (chore/text2sql through TDD tests)

## What Was Implemented

Read-only PostgreSQL text2sql skill: a script (`skills/text2sql/scripts/query.ts`) with commands `list_tables`, `schema`, `sample`, and `query`; read-only SQL validator; SKILL.md workflow; README; unit and integration tests. Script reads `DATABASE_URL` from env and rejects non-SELECT before connecting.

## Requirements/Plan

- Design: `.cursor/plans/2026-02-06-text2sql-design.md`
- Implementation: `.cursor/plans/2026-02-06-text2sql-implementation.md`
- Read-only only (DB role + script validation); schema + sample before query; CSV or analysis output; max row limit (1000).

---

## Review Checklist

**Code Quality:** Separation of concerns (validator, parseArgs, run\*), error handling (stderr + exit 1), TypeScript types, DRY (escapeCsv, quoteId, rowsToCsv), edge cases (empty table, limit parsing).  
**Architecture:** Single script + validator; no new core tool; exec-based. Security: read-only check before connect; table names passed through quoteId (identifier quoting).  
**Testing:** Validator unit tests (SELECT/WITH allowed, DML/DDL rejected); script integration tests (missing DATABASE_URL, invalid command, non-SELECT rejected). Tests run via spawn (real script).  
**Requirements:** Plan tasks 1–8 met; read-only enforced; docs and workflow in SKILL/README.

---

## Output

### Strengths

- **Read-only enforcement:** Non-SELECT is rejected before connecting (query.ts:164–168), so integration tests don’t need a real DB. Validator is a pure function with clear unit tests (readonly-validator.test.ts).
- **Safe table/schema usage:** `runSample` and `runSchema` use parameterized queries or `quoteId()` for schema/table (query.ts:90–95, 129–131), avoiding SQL injection from `--table`.
- **Clear CLI and errors:** parseArgs validates required flags and prints specific messages (Usage, “requires --table”, “DATABASE_URL is not set”, “Only SELECT queries are allowed”).
- **CSV output:** escapeCsv and rowsToCsv handle quotes and nulls; output is usable for downstream tools.
- **Tests:** 6 tests total; TDD used for missing DATABASE_URL and invalid-command behavior; runScript helper keeps integration tests readable.
- **Docs:** SKILL.md and README explain workflow, read-only rule, and setup (including read-only DB user).

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

1. **Multiple statements in validator**
   - **File:** skills/text2sql/scripts/readonly-validator.ts (and design: “single SELECT”)
   - **Issue:** SQL like `SELECT 1; SELECT 2` passes (starts with SELECT, no forbidden keyword). Design called for a single SELECT; `pg` would run both statements.
   - **Why it matters:** Slight deviation from “single read-only statement”; in practice both are SELECTs so no write risk.
   - **Fix (optional):** Reject when trimmed SQL contains `;` outside of string literals, or document that multiple SELECTs are allowed.

2. **Unhandled main() rejection**
   - **File:** skills/text2sql/scripts/query.ts:193
   - **Issue:** `main()` is async but invoked as `main();` with no `.catch()`. If an unexpected rejection occurred before the first await, it would be an unhandled rejection.
   - **Why it matters:** Unlikely given current flow (early sync checks then await connect), but improves robustness.
   - **Fix:** `main().catch((err) => { console.error(err); process.exit(1); });`

### Recommendations

- Consider adding a test that a valid SELECT (e.g. `SELECT 1 as x`) is _not_ rejected when DATABASE_URL is set (e.g. expect stderr not to match “Only SELECT”), if you ever run tests with a real DB or a throwaway Postgres.
- Keep the validator in a separate file so it stays easy to unit test and reuse.

### Assessment

**Ready to merge?** Yes

**Reasoning:** Implementation matches the design and plan: read-only enforcement (validator + early reject), list_tables/schema/sample/query with safe table handling and CSV output, clear errors and docs, and tests that run without a DB. No critical or important issues; minor items are optional hardening and style.
