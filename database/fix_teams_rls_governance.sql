-- Fix for 403 Forbidden on Teams access (Phase 8 Governance)
-- This migration resolves potential RLS recursion and ensures proper grants.

-- 1. Ensure table permissions are granted to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 2. Drop existing problematic policies
DROP POLICY IF EXISTS "Teams are readable by members" ON public.teams;
DROP POLICY IF EXISTS "Team members are readable by team" ON public.team_members;

-- 3. Re-implement Teams Select Policy using a non-recursive direct check
-- Users can see teams they belong to or teams they created.
CREATE POLICY "Teams are readable by members" ON public.teams
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_team_member(id)
  );

-- 4. Re-implement Team Members Select Policy
-- Users can see membership details of teams they are part of.
CREATE POLICY "Team members are readable by team" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_member(team_id)
  );

-- 5. Ensure the is_team_member function is robust and uses search_path
CREATE OR REPLACE FUNCTION public.is_team_member(target_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE team_id = target_team_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Reload schema for PostgREST
NOTIFY pgrst, 'reload schema';
