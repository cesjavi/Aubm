-- Fix recursive policies in profiles table
-- This migration replaces the existing admin policies with a non-recursive approach

-- 1. Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 2. Create a helper function to check admin status without triggering RLS recursion
-- SECURITY DEFINER runs with the privileges of the creator (usually postgres/service_role)
-- effectively bypassing RLS on the profiles table for this check.
CREATE OR REPLACE FUNCTION public.is_admin_check()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Re-create policies using the helper function
CREATE POLICY "Admins can read all profiles" ON public.profiles
    FOR SELECT
    USING ( public.is_admin_check() );

CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE TO authenticated
    USING ( public.is_admin_check() )
    WITH CHECK ( public.is_admin_check() );

-- 4. Restrict and grant access to the function
REVOKE ALL ON FUNCTION public.is_admin_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_check() TO service_role;
