-- Supabase table for storing OpenClaw environment variables.
--
-- Run this in the Supabase SQL editor or via a migration to create the table.
-- The `env_vars` table stores key-value pairs that OpenClaw will fetch at
-- startup and inject into process.env (without overriding existing values).

create table if not exists env_vars (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security so only authenticated service-role requests can
-- read/write the secrets.
alter table env_vars enable row level security;

-- Policy: only the service_role (used by the backend) can SELECT.
create policy "service_role_select" on env_vars
  for select
  to service_role
  using (true);

-- Policy: only the service_role can INSERT/UPDATE/DELETE.
create policy "service_role_modify" on env_vars
  for all
  to service_role
  using (true)
  with check (true);

-- Auto-update the updated_at timestamp on changes.
create or replace function update_env_vars_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger env_vars_updated_at
  before update on env_vars
  for each row
  execute function update_env_vars_updated_at();

-- Example: insert a few env vars.
-- insert into env_vars (key, value) values
--   ('OPENAI_API_KEY', 'sk-...'),
--   ('TELEGRAM_BOT_TOKEN', '123456:ABCDEF...');
