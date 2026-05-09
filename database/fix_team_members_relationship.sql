-- Fix for Schema Cache relationship error (Phase 8 Governance)
-- This migration ensures PostgREST can discover the relationship between team_members and profiles.

-- 1. Update foreign key to point to public.profiles instead of auth.users
-- They both share the same UUID, but pointing to public schema helps PostgREST discovery.
ALTER TABLE public.team_members
DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;

ALTER TABLE public.team_members
ADD CONSTRAINT team_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Ensure RLS doesn't block the join
-- (Already handled in fix_teams_rls_governance, but double checking)
GRANT SELECT ON public.profiles TO authenticated;

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
