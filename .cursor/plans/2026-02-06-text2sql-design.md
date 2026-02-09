# Text2SQL (PostgreSQL read-only) — Design

**Date:** 2026-02-06  
**Scope:** OpenClaw Skill + script; no new core tool. Read-only access to a PostgreSQL database.

---

## 1. Goal

- Users (and colleagues) ask in natural language to pull data from a PostgreSQL database (e.g. “latest pipeline data”, “top 10 orders”).
- The agent: (1) infers or confirms which table(s) to use, (2) checks schema and a sample row before building a query, (3) runs a **read-only** query, (4) returns either raw CSV (with a row limit) or a short analysis using the result as context.
- **Constraint:** No writes to the database. Only `SELECT` is allowed.

---

## 2. Architecture

- **Skill:** A single OpenClaw skill (e.g. `skills/text2sql/`) that defines when and how to do text2sql.
- **Execution:** The agent uses the existing **exec** tool to run a small script (Node or Python) that receives arguments (e.g. action: `list_tables` | `schema` | `sample` | `query`), table name, optional query/SQL, and optional row limit. The script reads `DATABASE_URL` from the environment and talks to PostgreSQL.
- **Read-only enforcement:**
  - **Preferred:** Use a PostgreSQL role that has only `SELECT` (and possibly `USAGE` on schema) so that even if the script or agent tried to run `INSERT`/`UPDATE`/`DELETE`/`DDL`, the DB would reject it.
  - **Defense in depth:** In the script, reject any SQL that is not a single `SELECT` (e.g. strip comments, check for forbidden keywords like `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, etc., or use a simple allowlist so only `SELECT` is ever sent).

---

## 3. Components

### 3.1 Skill: `SKILL.md`

- **When to use:** User asks to get data from the database, pull pipeline/table data, run a query, export to CSV, or similar. Trigger when the request is about “our Postgres DB” or “the database” in context where that DB is the one configured for this skill.
- **Workflow (in the skill instructions):**
  1. **Unclear table:** If the user’s request doesn’t identify the table (e.g. “latest pipeline data”), list tables (via script `list_tables`) and either infer from names or **ask the user to confirm** which table to use.
  2. **Before every query:** Call the script with `schema` for that table and `sample` (top 1 row) so the agent has column names and example values to build a correct `SELECT`.
  3. **Build and run query:** Generate a single `SELECT` (no writes). Call the script with `query`, the SQL, and a row limit (e.g. default 100 or 1000; skill can cap it).
  4. **Output:** Either return raw CSV (script outputs CSV; agent can paste or write to a file) or use the result as context and **generate a short analysis** in natural language.
- **Read-only reminder in skill:** State explicitly that only reads are allowed; if the user asks to change data, decline and explain.

### 3.2 Script (e.g. `scripts/query.js` or `scripts/query.py`)

- **Input:** CLI args or a simple JSON/stdin contract, e.g.:
  - `list_tables` → list tables (e.g. from `information_schema.tables` or `pg_catalog`) the role can read.
  - `schema --table T` → column names and types for table `T`.
  - `sample --table T [--limit 1]` → run `SELECT * FROM T LIMIT n` (default 1).
  - `query --sql "SELECT ..." [--limit N]` → run the given SQL and output CSV (or JSON). Enforce a max limit (e.g. 1000).
- **Connection:** Read `DATABASE_URL` from env (or a path to a file containing it, if you want to avoid leaking it in process list). Use a driver that supports parameterized queries only; do not concatenate user input into SQL for DML/DDL—only run a single `SELECT` after validation.
- **Read-only check:** Before running a user-provided query in `query`, validate that the trimmed SQL starts with `SELECT` and contains no forbidden keywords (or use a simple parser/allowlist). Reject otherwise and exit with a clear error.
- **Output:** CSV to stdout (or JSON if you prefer); the agent can capture it via exec and then format or analyze.

### 3.3 Configuration / env

- **DATABASE_URL** (e.g. `postgresql://user:pass@host:5432/dbname`) must be set in the environment where the agent runs (or in the workspace, e.g. documented in the skill’s README or in `TOOLS.md` so the user sets it once). Prefer a **read-only DB user** (only SELECT granted) so the database itself enforces no writes.

---

## 4. Data flow

1. User: “Get me the latest pipeline data.”
2. Agent (following skill): Run script `list_tables` → get table list. If “pipeline” is ambiguous, ask user which table.
3. Agent: Run script `schema --table pipelines` and `sample --table pipelines --limit 1` → get columns and one row.
4. Agent: Build `SELECT * FROM pipelines ORDER BY created_at DESC LIMIT 100` (or similar). Run script `query --sql "..." --limit 100` → CSV.
5. Agent: Either attach CSV or summarize/analyze in a short reply.

---

## 5. Error handling

- **Missing DATABASE_URL:** Script exits with a clear message; agent tells user to set it (and that it must be read-only).
- **Table not found / permission denied:** Script returns stderr/exit code; agent relays and can suggest checking table name or DB permissions.
- **Query rejected (not read-only):** Script refuses and returns message; agent does not retry with a write.

---

## 6. Testing

- Unit test the script locally with a read-only Postgres role: call `list_tables`, `schema`, `sample`, `query` with a valid `SELECT`; verify that an `INSERT` or `UPDATE` is rejected by the script (and ideally by the DB if someone bypasses the script).
- Manual test: Enable the skill, set `DATABASE_URL`, ask “list tables” then “get 5 rows from X” and “summarize the last 10 pipeline runs.”

---

## 7. File layout (suggestion)

```
skills/text2sql/
  SKILL.md           # When to use, workflow, read-only rule, how to call script
  scripts/
    query.js         # or query.py: list_tables, schema, sample, query (read-only)
  README.md          # Optional: how to set DATABASE_URL, read-only user setup
```

---

## 8. Summary

| Item          | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Surface       | Skill only (option C)                                           |
| Execution     | Existing **exec** tool + script                                 |
| DB access     | Read-only: prefer read-only DB role + script rejects non-SELECT |
| Schema/sample | Script actions `schema` + `sample` before building query        |
| Unclear table | List tables, then confirm with user if needed                   |
| Output        | Raw CSV (with limit) or agent-generated analysis from result    |
