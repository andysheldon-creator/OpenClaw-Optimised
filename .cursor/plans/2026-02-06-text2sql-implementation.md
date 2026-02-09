# Text2SQL (PostgreSQL read-only) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only PostgreSQL text2sql skill: agent runs a script to list tables, get schema/sample, and run validated SELECT-only queries; returns CSV or analysis.

**Architecture:** One skill under `skills/text2sql/` with `SKILL.md` (workflow + read-only rule) and a Node/TypeScript script `scripts/query.ts` run via exec. Script reads `DATABASE_URL` from env; enforces read-only by validating that ad-hoc SQL is a single SELECT (no DML/DDL). Prefer a read-only DB role; script rejects non-SELECT as defense in depth.

**Tech Stack:** TypeScript, Node 22+, `pg` (node-postgres), Bun to run script; Vitest for tests.

---

## Task 1: Add dependency and script stub

**Files:**

- Modify: `package.json` (add `pg` to dependencies, `@types/pg` to devDependencies)
- Create: `skills/text2sql/scripts/query.ts`

**Step 1: Add pg dependency**

In `package.json`, add to `dependencies`: `"pg": "^8.13.0"` (or current major). Add to `devDependencies`: `"@types/pg": "^8.11.0"`. Use exact version if patched elsewhere; otherwise caret is fine.

**Step 2: Create script stub with CLI parsing**

Create `skills/text2sql/scripts/query.ts` that:

- Uses a single dependency: `pg` (import `Client` from `"pg"`).
- Parses argv for subcommands: `list_tables` | `schema` | `sample` | `query`.
- For `schema`: require `--table <name>`.
- For `sample`: require `--table <name>`, optional `--limit <n>` (default 1).
- For `query`: require `--sql "<SELECT...>"`, optional `--limit <n>` (default 500, max 1000).
- If `DATABASE_URL` is missing, print to stderr "DATABASE_URL is not set. Set it to a read-only PostgreSQL connection string." and exit with code 1.
- No database calls yet; just parse and exit 0 after printing "OK" for each command (so we can run and see help/behavior).

Example argv handling (pseudocode):

```ts
const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || !["list_tables", "schema", "sample", "query"].includes(cmd)) {
  console.error(
    'Usage: query list_tables | schema --table T | sample --table T [--limit N] | query --sql "SELECT ..." [--limit N]',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Set it to a read-only PostgreSQL connection string.");
  process.exit(1);
}
// For now: console.log('OK'); process.exit(0);
```

**Step 3: Run script to verify**

Run: `DATABASE_URL=postgres://x/x bun skills/text2sql/scripts/query.ts list_tables`  
Expected: stdout "OK" (or similar), exit 0.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml skills/text2sql/scripts/query.ts
git commit -m "chore(text2sql): add pg dep and script CLI stub"
```

---

## Task 2: Implement read-only SQL validator

**Files:**

- Create: `skills/text2sql/scripts/readonly-validator.ts`
- Create: `skills/text2sql/scripts/readonly-validator.test.ts`

**Step 1: Write the failing test**

Create `skills/text2sql/scripts/readonly-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isReadOnlySelect } from "./readonly-validator";

describe("isReadOnlySelect", () => {
  it("allows simple SELECT", () => {
    expect(isReadOnlySelect("SELECT * FROM t")).toBe(true);
    expect(isReadOnlySelect("  SELECT id FROM users WHERE x = 1")).toBe(true);
  });

  it("rejects INSERT, UPDATE, DELETE, DDL", () => {
    expect(isReadOnlySelect("INSERT INTO t VALUES (1)")).toBe(false);
    expect(isReadOnlySelect("UPDATE t SET x=1")).toBe(false);
    expect(isReadOnlySelect("DELETE FROM t")).toBe(false);
    expect(isReadOnlySelect("DROP TABLE t")).toBe(false);
    expect(isReadOnlySelect("TRUNCATE t")).toBe(false);
    expect(isReadOnlySelect("SELECT * FROM t; DROP TABLE t")).toBe(false);
  });

  it("rejects SQL that does not start with SELECT", () => {
    expect(isReadOnlySelect("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    expect(isReadOnlySelect("; SELECT * FROM t")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run skills/text2sql/scripts/readonly-validator.test.ts --config vitest.unit.config.ts`  
If vitest does not include skills by default, run: `pnpm exec vitest run skills/text2sql/scripts/readonly-validator.test.ts` (or add `skills/text2sql/**/*.test.ts` to unit config include in this task).  
Expected: FAIL (isReadOnlySelect not defined or file missing).

**Step 3: Implement validator**

Create `skills/text2sql/scripts/readonly-validator.ts`:

- Export `function isReadOnlySelect(sql: string): boolean`.
- Trim SQL and strip single-line `--` and multi-line `/* */` comments (simplified: remove lines that are only comments, then trim).
- Normalize: uppercase the trimmed string (after removing comments) for keyword checks.
- Require that the first token (after optional semicolons/whitespace) is `SELECT`, or that the string starts with `WITH` (CTE) and eventually has `SELECT`. For simplicity: after stripping comments and trimming, reject if the string contains (as whole words, case-insensitive) any of: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `REVOKE`, `EXECUTE`, `CALL`. And require that the trimmed string (after removing leading semicolons) starts with `SELECT` or `WITH`.
- Return true only if it looks like a single read-only statement.

Minimal implementation idea:

```ts
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL)\b/i;

export function isReadOnlySelect(sql: string): boolean {
  const trimmed = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  if (FORBIDDEN.test(trimmed)) return false;
  const upper = trimmed.toUpperCase();
  return upper.startsWith("SELECT") || upper.startsWith("WITH");
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run skills/text2sql/scripts/readonly-validator.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add skills/text2sql/scripts/readonly-validator.ts skills/text2sql/scripts/readonly-validator.test.ts
git commit -m "feat(text2sql): add read-only SQL validator"
```

---

## Task 3: Include skill tests in unit run

**Files:**

- Modify: `vitest.unit.config.ts`

**Step 1: Add skills/text2sql to include**

In `vitest.unit.config.ts`, add `"skills/text2sql/**/*.test.ts"` to the `include` array so that `pnpm test` runs the text2sql tests.

**Step 2: Run unit tests**

Run: `pnpm exec vitest run --config vitest.unit.config.ts`  
Expected: All tests pass (including readonly-validator).

**Step 3: Commit**

```bash
git add vitest.unit.config.ts
git commit -m "test(text2sql): include skill tests in unit run"
```

---

## Task 4: Implement list_tables and schema

**Files:**

- Modify: `skills/text2sql/scripts/query.ts`

**Step 1: Implement list_tables**

- Create a `pg.Client` from `process.env.DATABASE_URL`, connect, then query:

  `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name`

- Output one table per line: `schema.tablename` or `tablename` (if schema is public). Or JSON array to stdout. Prefer simple text: one fully qualified name per line.
- On error (connection or query), write message to stderr and exit 1.
- Close client and exit 0.

**Step 2: Implement schema**

- For `schema --table T`: if T contains a dot, treat as schema.table; else use schema `public`.
- Query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`
- Output: CSV header row then no data (just column names and types), or JSON. Prefer CSV: `column_name,data_type` then one row per column.
- On table not found (0 rows), stderr "Table not found: T" and exit 1.

**Step 3: Run manually**

Run with a real read-only DATABASE_URL:

- `bun skills/text2sql/scripts/query.ts list_tables`
- `bun skills/text2sql/scripts/query.ts schema --table some_table`

Expected: list of tables; for schema, list of columns.

**Step 4: Commit**

```bash
git add skills/text2sql/scripts/query.ts
git commit -m "feat(text2sql): implement list_tables and schema"
```

---

## Task 5: Implement sample and query (read-only)

**Files:**

- Modify: `skills/text2sql/scripts/query.ts`

**Step 1: Implement sample**

- For `sample --table T [--limit N]`: validate table name (identifier only; no SQL injection). Build `SELECT * FROM "schema"."table" LIMIT n` with proper quoting (pg: use double quotes for identifiers). Use parameterized query only for LIMIT (e.g. `LIMIT $1`). Default limit 1, max e.g. 10 for sample.
- Execute and output result as CSV to stdout (header row + rows). Use a simple CSV formatter (escape quotes in values).
- On error, stderr and exit 1.

**Step 2: Implement query with read-only check**

- For `query --sql "SELECT ..." [--limit N]`: parse limit (default 500, max 1000). Append `LIMIT n` to the user SQL only if the SQL does not already contain a LIMIT clause (simple check: no `LIMIT` in uppercase SQL). If it already has LIMIT, optionally cap the number (e.g. replace or append) to avoid huge results; for simplicity, append `LIMIT 1000` if not present.
- Call `isReadOnlySelect(sql)` from `readonly-validator.ts`. If false, stderr "Only SELECT queries are allowed. Rejected." and exit 1.
- Execute the (possibly limit-appended) SQL with pg; stream or fetch rows, output CSV to stdout.
- On DB error, stderr and exit 1.

**Step 3: Run manually**

- `bun skills/text2sql/scripts/query.ts sample --table some_table --limit 2`
- `bun skills/text2sql/scripts/query.ts query --sql "SELECT 1 as x" --limit 5`
- `bun skills/text2sql/scripts/query.ts query --sql "INSERT INTO t VALUES(1)"`  
  Expected: sample and query return CSV; INSERT exits 1 with "Only SELECT queries are allowed."

**Step 4: Commit**

```bash
git add skills/text2sql/scripts/query.ts
git commit -m "feat(text2sql): implement sample and query with read-only enforcement"
```

---

## Task 6: Add SKILL.md

**Files:**

- Create: `skills/text2sql/SKILL.md`

**Step 1: Write skill frontmatter and overview**

Create `skills/text2sql/SKILL.md` with:

- YAML frontmatter: `name: text2sql`, `description: Natural-language queries over a read-only PostgreSQL database. Use when the user asks to get data from the database, pull pipeline/table data, run a query, or export to CSV. Requires DATABASE_URL (read-only user recommended).`
- Optional metadata: `requires: { env: ["DATABASE_URL"] }` if the project supports that.

**Step 2: Document workflow**

- When to use: user asks for data from "the database", "Postgres", "pipeline data", "run a query", "export to CSV", etc.
- Read-only rule: Only reads are allowed. If the user asks to change data (INSERT/UPDATE/DELETE), decline and explain that this skill is read-only.
- Workflow:
  1. If table is unclear: run script `list_tables` (from skill base dir), then ask user to confirm which table if ambiguous.
  2. Before building a query: run script `schema --table <T>` and `sample --table <T>` to get column names and one sample row.
  3. Build a single SELECT; run script `query --sql "..." [--limit N]` (max 1000).
  4. Output: return raw CSV or use the result as context and write a short analysis.

**Step 3: Document how to run the script**

- Script path: `{baseDir}/scripts/query.ts` (baseDir = skill directory, e.g. repo root or `skills/text2sql` depending on how OpenClaw resolves it). Prefer: "From the repository root, run: `DATABASE_URL=... bun skills/text2sql/scripts/query.ts <cmd> ...`"
- Commands: `list_tables`, `schema --table <name>`, `sample --table <name> [--limit 1]`, `query --sql "SELECT ..." [--limit 500]`.

**Step 4: Commit**

```bash
git add skills/text2sql/SKILL.md
git commit -m "docs(text2sql): add SKILL.md with workflow and read-only rule"
```

---

## Task 7: Add README for setup

**Files:**

- Create: `skills/text2sql/README.md`

**Step 1: Write README**

- How to set `DATABASE_URL` (env or .env).
- Recommend using a read-only PostgreSQL user (e.g. `GRANT SELECT ON ALL TABLES IN SCHEMA public TO read_only_user`).
- One-line example: list tables, get schema, sample, run query.

**Step 2: Commit**

```bash
git add skills/text2sql/README.md
git commit -m "docs(text2sql): add README for DATABASE_URL and read-only user"
```

---

## Task 8: Integration test (optional but recommended)

**Files:**

- Create: `skills/text2sql/scripts/query.test.ts` (or extend existing test)

**Step 1: Add test that script rejects non-SELECT**

In `skills/text2sql/scripts/query.test.ts`: spawn the script with `query --sql "INSERT INTO t VALUES(1)"` and no real DB (or with DATABASE_URL set). Assert exit code 1 and stderr contains "Only SELECT" or "Rejected".

Example (Node):

```ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "query.ts");

describe("query script", () => {
  it("rejects non-SELECT for query command", () => {
    const r = spawnSync("bun", [script, "query", "--sql", "INSERT INTO t VALUES (1)"], {
      env: { ...process.env, DATABASE_URL: "postgres://localhost/dummy" },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/only SELECT|rejected/i);
  });
});
```

**Step 2: Run test**

Run: `pnpm exec vitest run skills/text2sql/scripts/query.test.ts`  
Expected: PASS.

**Step 3: Commit**

```bash
git add skills/text2sql/scripts/query.test.ts
git commit -m "test(text2sql): integration test that script rejects non-SELECT"
```

---

## Summary

| Task | Deliverable                                            |
| ---- | ------------------------------------------------------ |
| 1    | pg dep + query.ts CLI stub (argv + DATABASE_URL check) |
| 2    | readonly-validator.ts + tests                          |
| 3    | vitest.unit.config.ts includes skills/text2sql         |
| 4    | list_tables + schema in query.ts                       |
| 5    | sample + query (with validator) in query.ts            |
| 6    | SKILL.md (workflow, read-only rule, how to run script) |
| 7    | README.md (DATABASE_URL, read-only user)               |
| 8    | query.test.ts (reject non-SELECT)                      |

---

**Reference:** Design: `.cursor/plans/2026-02-06-text2sql-design.md`
