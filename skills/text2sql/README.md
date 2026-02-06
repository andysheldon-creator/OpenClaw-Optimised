# Text2SQL skill

Read-only natural-language queries over a PostgreSQL database.

## Setup

1. **Set `DATABASE_URL`** in the environment (or in `.env` if your runner loads it):

   ```bash
   export DATABASE_URL="postgresql://user:password@host:5432/dbname"
   ```

2. **Use a read-only user (recommended):** Create a PostgreSQL role with only `SELECT` (and `USAGE` on the schema) so the database itself rejects any write. Example:

   ```sql
   CREATE ROLE read_only_user LOGIN PASSWORD '...';
   GRANT USAGE ON SCHEMA public TO read_only_user;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO read_only_user;
   ```

   Then set `DATABASE_URL` to use `read_only_user`. The script also rejects non-SELECT SQL before sending it to the DB.

## Quick examples

From the repo root:

```bash
# List tables
node --import tsx skills/text2sql/scripts/query.ts list_tables

# Table schema
node --import tsx skills/text2sql/scripts/query.ts schema --table my_table

# One sample row
node --import tsx skills/text2sql/scripts/query.ts sample --table my_table

# Run a query (output CSV)
node --import tsx skills/text2sql/scripts/query.ts query --sql "SELECT id, name FROM my_table LIMIT 10"
```

If `bun` is on your PATH you can replace `node --import tsx` with `bun`.
