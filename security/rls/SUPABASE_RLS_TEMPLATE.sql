-- OpenClaw Supabase Row-Level Security (RLS) Template
-- 
-- IMPORTANT: This template provides a deny-by-default baseline.
-- Customize policies for your specific data model.
--
-- Key Principles:
-- 1. ENABLE RLS on ALL tables
-- 2. Default policy is DENY ALL
-- 3. anon role: read-only, scoped to tenant/user
-- 4. service_role: server-side only, NEVER in client code

-- ============================================================
-- STEP 1: Enable RLS on all tables
-- ============================================================

-- Example: Enable RLS on a users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Example: Enable RLS on a messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Example: Enable RLS on a sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Add ENABLE ROW LEVEL SECURITY for ALL your tables
-- Missing this allows full access to anyone with database credentials

-- ============================================================
-- STEP 2: Create deny-all default policies
-- ============================================================

-- Users table: deny all by default
CREATE POLICY "users_deny_all" ON public.users
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Messages table: deny all by default  
CREATE POLICY "messages_deny_all" ON public.messages
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Sessions table: deny all by default
CREATE POLICY "sessions_deny_all" ON public.sessions
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- STEP 3: Create specific allow policies for authenticated users
-- ============================================================

-- Example: Users can read their own profile
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Example: Users can update their own profile
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Example: Users can read their own messages
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Example: Users can insert their own messages
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Example: Users can read their own sessions
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- STEP 4: Anon role policies (for unauthenticated access)
-- ============================================================

-- CAUTION: Only enable anon access if absolutely necessary
-- Prefer authenticated access for all operations

-- Example: Anon can read public content only
-- CREATE POLICY "messages_select_public" ON public.messages
--   FOR SELECT
--   TO anon
--   USING (is_public = true);

-- ============================================================
-- STEP 5: Service role bypasses RLS
-- ============================================================

-- The service_role automatically bypasses RLS.
-- This is by design for server-side operations.
--
-- CRITICAL SECURITY RULES:
-- 1. NEVER expose service_role key in client code
-- 2. NEVER include service_role key in frontend bundles
-- 3. NEVER log the service_role key
-- 4. NEVER commit service_role key to version control
-- 5. service_role should ONLY be used in:
--    - Backend server code
--    - Database migrations
--    - Serverless functions running server-side

-- ============================================================
-- STEP 6: Audit and verify RLS
-- ============================================================

-- Check which tables have RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Check policies on a specific table
SELECT 
  policyname,
  tablename,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users';

-- ============================================================
-- STEP 7: Common patterns for multi-tenant applications
-- ============================================================

-- If using tenant_id for multi-tenancy:

-- Example: Create tenant-scoped read policy
-- CREATE POLICY "tenant_select" ON public.data
--   FOR SELECT
--   TO authenticated
--   USING (
--     tenant_id = (
--       SELECT tenant_id FROM public.users WHERE id = auth.uid()
--     )
--   );

-- Example: Create tenant-scoped insert policy
-- CREATE POLICY "tenant_insert" ON public.data
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     tenant_id = (
--       SELECT tenant_id FROM public.users WHERE id = auth.uid()
--     )
--   );

-- ============================================================
-- NOTES
-- ============================================================

-- 1. Test all policies thoroughly before deploying
-- 2. Use Supabase Dashboard → Authentication → Policies to verify
-- 3. Monitor auth.audit_log_entries for suspicious activity
-- 4. Consider adding created_at/updated_at triggers for audit trails
-- 5. Review policies after any schema changes
