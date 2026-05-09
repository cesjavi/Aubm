-- Final profiles RLS hardening.
-- Fixes recursive admin policies and prevents users from escalating their role.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admin check used by RLS policies. SECURITY DEFINER avoids recursive RLS checks
-- when reading public.profiles from inside a profile policy.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- Role changes need OLD/NEW comparison, which belongs in a trigger rather than
-- a self-referential RLS policy.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  jwt_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  IF TG_OP = 'INSERT' THEN
    NEW.role := COALESCE(NEW.role, 'user');

    IF NEW.role <> 'user'
       AND NOT public.is_admin()
       AND jwt_role <> 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Only admins can create elevated profiles';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin()
     AND jwt_role <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO service_role;

DROP TRIGGER IF EXISTS protect_profile_role_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Start from a known policy set. Drop both old and newer names.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by admins" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are insertable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are updatable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are updatable by admins" ON public.profiles;

CREATE POLICY "Profiles are readable by owners" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Profiles are readable by admins" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Profiles are insertable by owners" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(role, 'user') = 'user'
  );

CREATE POLICY "Profiles are updatable by owners" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles are updatable by admins" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (
    public.is_admin()
    AND role IN ('user', 'manager', 'admin')
  );

NOTIFY pgrst, 'reload schema';
